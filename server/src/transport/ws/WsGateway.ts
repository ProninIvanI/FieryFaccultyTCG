import { WebSocketServer, WebSocket } from 'ws';
import { GameService } from '../../application/GameService';
import { ClientMessageDto, parseClientMessage, ServerMessageDto } from './dto';
import { AuthIdentity, resolveAuthIdentity } from '../../infrastructure/auth/AuthIdentityClient';
import { resolvePlayerDeck } from '../../infrastructure/decks/DeckCatalogClient';
import {
  createPersistentMatchId,
  createPersistentReplayId,
  MatchPersistenceClientLike,
  NoopMatchPersistenceClient,
} from '../../infrastructure/matches/MatchPersistenceClient';
import { logger } from '../../infrastructure/logger';
import { Action, GameState } from '../../../../game-core/src/types';

type IdentityResolver = (token: string) => Promise<AuthIdentity | null>;

type RuntimePlayerMeta = {
  userId: string;
  playerId: string;
  deckId: string;
  connectedAt: string;
};

type RuntimeSessionMeta = {
  persistentMatchId: string;
  persisted: boolean;
  createdByUserId: string;
  seed: number;
  startedAt: string;
  players: Map<string, RuntimePlayerMeta>;
};

export class WsGateway {
  private wss?: WebSocketServer;
  private readonly sessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketBindings = new Map<WebSocket, { sessionId: string; playerId: string }>();
  private readonly sessionMeta = new Map<string, RuntimeSessionMeta>();

  constructor(
    private readonly gameService: GameService,
    private readonly identityResolver: IdentityResolver = resolveAuthIdentity,
    private readonly matchPersistence: MatchPersistenceClientLike = new NoopMatchPersistenceClient(),
  ) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (socket) => this.handleConnection(socket));
  }

  stop(): void {
    this.wss?.close();
  }

  private handleConnection(socket: WebSocket): void {
    socket.on('message', (data) => {
      const raw = data.toString();
      void this.handleIncomingMessage(socket, raw);
    });
  }

  private async handleIncomingMessage(socket: WebSocket, raw: string): Promise<void> {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) {
      this.send(socket, { type: 'error', error: parsed.error });
      return;
    }
    await this.routeMessage(socket, parsed.value);
  }

  private async routeMessage(socket: WebSocket, message: ClientMessageDto): Promise<void> {
    if (message.type === 'join') {
      const identity = await this.identityResolver(message.token);
      if (!identity) {
        this.send(socket, { type: 'error', error: 'Unauthorized' });
        return;
      }

      const deck = await resolvePlayerDeck(message.token, message.deckId);
      if (!deck) {
        this.send(socket, { type: 'error', error: 'Deck not found or unavailable' });
        return;
      }

      const result = this.gameService.join(message.sessionId, {
        playerId: identity.userId,
        characterId: deck.characterId,
        deck: deck.cards,
      }, message.seed);
      if (!result.ok) {
        this.send(socket, { type: 'error', error: result.error });
        return;
      }

      this.trackSessionJoin(message.sessionId, identity.userId, deck.deckId, result.session.getSeed());
      await this.persistMatchIfReady(message.sessionId, result.session.getState());

      this.attachSocket(message.sessionId, identity.userId, socket);
      this.broadcast(message.sessionId, { type: 'state', state: result.session.getState() });
      return;
    }
    if (message.type === 'action') {
      const binding = this.socketBindings.get(socket);
      if (!binding) {
        this.send(socket, { type: 'error', error: 'Join session first' });
        return;
      }
      const result = this.gameService.applyAction(binding.sessionId, binding.playerId, message.action);
      if (!result.ok) {
        this.send(socket, { type: 'error', error: result.error });
        return;
      }
      await this.persistReplay(binding.sessionId, result.state);
      this.broadcast(binding.sessionId, { type: 'state', state: result.state });
    }
  }

  private trackSessionJoin(sessionId: string, userId: string, deckId: string, seed: number): void {
    const now = new Date().toISOString();
    const existing = this.sessionMeta.get(sessionId);

    if (existing) {
      existing.players.set(userId, {
        userId,
        playerId: userId,
        deckId,
        connectedAt: now,
      });
      return;
    }

    this.sessionMeta.set(sessionId, {
      persistentMatchId: createPersistentMatchId(sessionId),
      persisted: false,
      createdByUserId: userId,
      seed,
      startedAt: now,
      players: new Map([
        [
          userId,
          {
            userId,
            playerId: userId,
            deckId,
            connectedAt: now,
          },
        ],
      ]),
    });
  }

  private async persistMatchIfReady(sessionId: string, state: GameState): Promise<void> {
    const meta = this.sessionMeta.get(sessionId);
    if (!meta || meta.persisted || meta.players.size < 2) {
      return;
    }

    const players = Array.from(meta.players.values())
      .sort((left, right) => left.playerId.localeCompare(right.playerId, 'en'))
      .map((player, index) => ({
        id: `match_player_${sessionId}_${player.playerId}`,
        userId: player.userId,
        playerSlot: index + 1,
        playerIdInMatch: player.playerId,
        deckId: player.deckId,
        connectedAt: player.connectedAt,
      }));

    try {
      await this.matchPersistence.createMatch({
        id: meta.persistentMatchId,
        matchId: sessionId,
        status: 'active',
        createdByUserId: meta.createdByUserId,
        seed: String(meta.seed),
        gameCoreVersion: '0.1.0',
        rulesVersion: 'pvp-v1',
        startState: state,
        startedAt: meta.startedAt,
        lastAppliedActionAt: null,
        players,
      });

      meta.persisted = true;
      await this.persistReplay(sessionId, state);
    } catch (error) {
      logger.warn(
        `Failed to persist match start for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async persistReplay(sessionId: string, state: GameState): Promise<void> {
    const meta = this.sessionMeta.get(sessionId);
    if (!meta || !meta.persisted) {
      return;
    }

    const initialContext = {
      matchId: sessionId,
      seed: meta.seed,
      gameCoreVersion: '0.1.0',
      rulesVersion: 'pvp-v1',
      players: Array.from(meta.players.values())
        .sort((left, right) => left.playerId.localeCompare(right.playerId, 'en'))
        .map((player) => ({
          playerId: player.playerId,
          userId: player.userId,
          deckId: player.deckId,
        })),
    };

    try {
      await this.matchPersistence.saveReplay(meta.persistentMatchId, {
        id: createPersistentReplayId(),
        matchId: meta.persistentMatchId,
        formatVersion: '1',
        initialContext,
        commandLog: state.actionLog as Action[],
      });
    } catch (error) {
      logger.warn(
        `Failed to persist replay for session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private attachSocket(sessionId: string, playerId: string, socket: WebSocket): void {
    this.detachSocket(socket);
    const set = this.sessionSockets.get(sessionId) ?? new Set<WebSocket>();
    set.add(socket);
    this.sessionSockets.set(sessionId, set);
    this.socketBindings.set(socket, { sessionId, playerId });
    socket.on('close', () => {
      this.detachSocket(socket);
    });
  }

  private detachSocket(socket: WebSocket): void {
    const binding = this.socketBindings.get(socket);
    if (!binding) {
      return;
    }
    const set = this.sessionSockets.get(binding.sessionId);
    set?.delete(socket);
    if (set && set.size === 0) {
      this.sessionSockets.delete(binding.sessionId);
    }
    this.socketBindings.delete(socket);
  }

  private broadcast(sessionId: string, message: ServerMessageDto): void {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets) {
      return;
    }
    sockets.forEach((socket) => this.send(socket, message));
  }

  private send(socket: WebSocket, message: ServerMessageDto): void {
    socket.send(JSON.stringify(message));
  }
}
