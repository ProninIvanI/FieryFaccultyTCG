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
  username?: string;
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

type JoinRejectedMessage = Extract<ServerMessageDto, { type: 'join.rejected' }>;

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
      if (parsed.rejection) {
        this.send(socket, parsed.rejection);
      } else {
        this.send(socket, { type: 'error', error: parsed.error });
      }
      return;
    }
    await this.routeMessage(socket, parsed.value);
  }

  private async routeMessage(socket: WebSocket, message: ClientMessageDto): Promise<void> {
    if (message.type === 'join') {
      const identity = await this.identityResolver(message.token);
      if (!identity) {
        this.send(socket, this.toJoinRejected(message.sessionId, 'unauthorized', 'Unauthorized'));
        return;
      }

      const deck = await resolvePlayerDeck(message.token, message.deckId);
      if (!deck) {
        this.send(socket, this.toJoinRejected(message.sessionId, 'deck_unavailable', 'Deck not found or unavailable'));
        return;
      }

      const result = this.gameService.join(message.sessionId, {
        playerId: identity.userId,
        characterId: deck.characterId,
        deck: deck.cards,
      }, message.seed);
      if (!result.ok) {
        this.send(socket, this.toJoinRejected(message.sessionId, this.toJoinRejectCode(result.error), result.error));
        return;
      }

      this.trackSessionJoin(message.sessionId, identity, deck.deckId, result.session.getSeed());
      await this.persistMatchIfReady(message.sessionId, result.session.getState());

      this.attachSocket(message.sessionId, identity.userId, socket);
      const stateSnapshot = this.gameService.getStateSnapshot(message.sessionId);
      if (stateSnapshot) {
        this.broadcast(message.sessionId, this.toStateMessage(message.sessionId, stateSnapshot));
      }
      this.broadcastRoundStatus(message.sessionId);
      this.sendRoundDraftSnapshot(message.sessionId, identity.userId, socket);
      return;
    }
    if (message.type === 'roundDraft.replace') {
      const binding = this.socketBindings.get(socket);
      if (!binding) {
        this.send(socket, {
          type: 'roundDraft.rejected',
          operation: 'replace',
          roundNumber: message.roundNumber,
          code: 'join_required',
          error: 'Join session first',
          errors: [],
        });
        return;
      }

      const result = this.gameService.replaceRoundDraft(
        binding.sessionId,
        binding.playerId,
        message.roundNumber,
        message.intents,
      );
      if (!result.ok) {
        if (result.rejection) {
          this.send(socket, { type: 'roundDraft.rejected', ...result.rejection });
        } else {
          this.send(socket, { type: 'error', error: result.error });
        }
        return;
      }

      this.send(socket, { type: 'roundDraft.accepted', roundNumber: message.roundNumber });
      this.sendRoundDraftSnapshot(binding.sessionId, binding.playerId, socket);
      this.broadcastRoundStatus(binding.sessionId);
      return;
    }
    if (message.type === 'roundDraft.lock') {
      const binding = this.socketBindings.get(socket);
      if (!binding) {
        this.send(socket, {
          type: 'roundDraft.rejected',
          operation: 'lock',
          roundNumber: message.roundNumber,
          code: 'join_required',
          error: 'Join session first',
          errors: [],
        });
        return;
      }

      const result = this.gameService.lockRoundDraft(
        binding.sessionId,
        binding.playerId,
        message.roundNumber,
      );
      if (!result.ok) {
        if (result.rejection) {
          this.send(socket, { type: 'roundDraft.rejected', ...result.rejection });
        } else {
          this.send(socket, { type: 'error', error: result.error });
        }
        return;
      }

      this.sendRoundDraftSnapshot(binding.sessionId, binding.playerId, socket);
      this.broadcastRoundStatus(binding.sessionId);
      if (result.resolved) {
        await this.persistReplay(binding.sessionId, result.state);
        this.broadcast(binding.sessionId, { type: 'roundResolved', result: result.resolved });
        const stateSnapshot = this.gameService.getStateSnapshot(binding.sessionId);
        if (stateSnapshot) {
          this.broadcast(binding.sessionId, this.toStateMessage(binding.sessionId, stateSnapshot));
        }
        this.broadcastRoundDraftSnapshots(binding.sessionId);
        this.broadcastRoundStatus(binding.sessionId);
      }
    }
  }

  private toJoinRejected(
    sessionId: string,
    code: JoinRejectedMessage['code'],
    error: string,
  ): JoinRejectedMessage {
    return {
      type: 'join.rejected',
      sessionId,
      code,
      error,
    };
  }

  private toJoinRejectCode(error: string): JoinRejectedMessage['code'] {
    switch (error) {
      case 'Session is full':
        return 'session_full';
      case 'Character is already taken in this session':
        return 'duplicate_character';
      case 'Session already exists with a different seed':
        return 'seed_mismatch';
      default:
        return 'invalid_payload';
    }
  }

  private trackSessionJoin(sessionId: string, identity: AuthIdentity, deckId: string, seed: number): void {
    const userId = identity.userId;
    const now = new Date().toISOString();
    const existing = this.sessionMeta.get(sessionId);

    if (existing) {
      existing.players.set(userId, {
        userId,
        playerId: userId,
        username: identity.username,
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
            username: identity.username,
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

  private getPlayerLabels(sessionId: string): Record<string, string> | undefined {
    const meta = this.sessionMeta.get(sessionId);
    if (!meta) {
      return undefined;
    }

    const labels = Array.from(meta.players.values()).reduce<Record<string, string>>((acc, player) => {
      if (player.username) {
        acc[player.playerId] = player.username;
      }
      return acc;
    }, {});

    return Object.keys(labels).length > 0 ? labels : undefined;
  }

  private toStateMessage(sessionId: string, state: GameState): Extract<ServerMessageDto, { type: 'state' }> {
    return {
      type: 'state',
      state,
      playerLabels: this.getPlayerLabels(sessionId),
    };
  }

  private send(socket: WebSocket, message: ServerMessageDto): void {
    socket.send(JSON.stringify(message));
  }

  private sendRoundDraftSnapshot(sessionId: string, playerId: string, socket: WebSocket): void {
    const snapshot = this.gameService.getRoundDraftSnapshot(sessionId, playerId);
    this.send(socket, {
      type: 'roundDraft.snapshot',
      roundNumber: snapshot?.roundNumber ?? 0,
      locked: snapshot?.locked ?? false,
      intents: snapshot?.intents ?? [],
      boardModel: snapshot?.boardModel ?? undefined,
    });
  }

  private broadcastRoundDraftSnapshots(sessionId: string): void {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets) {
      return;
    }

    sockets.forEach((socket) => {
      const binding = this.socketBindings.get(socket);
      if (!binding) {
        return;
      }

      this.sendRoundDraftSnapshot(sessionId, binding.playerId, socket);
    });
  }

  private broadcastRoundStatus(sessionId: string): void {
    const sockets = this.sessionSockets.get(sessionId);
    if (!sockets) {
      return;
    }

    const session = this.gameService.getSession(sessionId);
    if (!session) {
      return;
    }

    const roundState = session.getState().round;
    sockets.forEach((socket) => {
      const binding = this.socketBindings.get(socket);
      if (!binding) {
        return;
      }
      const selfLocked = roundState.players[binding.playerId]?.locked ?? false;
      const opponentLocked = Object.values(roundState.players).some(
        (playerRoundState) => playerRoundState.playerId !== binding.playerId && playerRoundState.locked,
      );

      this.send(socket, {
        type: 'roundStatus',
        roundNumber: roundState.number,
        selfLocked,
        opponentLocked,
      });
    });
  }
}
