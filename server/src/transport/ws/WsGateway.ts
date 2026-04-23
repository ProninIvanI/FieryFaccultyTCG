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
import { MatchInviteRecord, MatchInviteRegistry } from '../../domain/social/MatchInviteRegistry';
import { PresenceRegistry } from '../../domain/social/PresenceRegistry';
import { FriendshipClientLike, HttpFriendshipClient } from '../../infrastructure/social/FriendshipClient';
import {
  HttpMatchInvitePersistenceClient,
  MatchInvitePersistenceClientLike,
} from '../../infrastructure/social/MatchInvitePersistenceClient';
import {
  HttpSocialGraphClient,
  SocialGraphClientLike,
} from '../../infrastructure/social/SocialGraphClient';

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
type MatchInviteUpdatedMessage = Extract<ServerMessageDto, { type: 'matchInvite.updated' }>;

export class WsGateway {
  private static readonly PREPARED_INVITE_TTL_MS = 10 * 60_000;
  private wss?: WebSocketServer;
  private socketSequence = 0;
  private readonly sessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketBindings = new Map<WebSocket, { sessionId: string; playerId: string }>();
  private readonly socketIds = new Map<WebSocket, string>();
  private readonly socketIdentity = new Map<WebSocket, AuthIdentity>();
  private readonly userSockets = new Map<string, Set<WebSocket>>();
  private readonly sessionMeta = new Map<string, RuntimeSessionMeta>();
  private readonly presenceRegistry = new PresenceRegistry();
  private readonly inviteRegistry = new MatchInviteRegistry();

  constructor(
    private readonly gameService: GameService,
    private readonly identityResolver: IdentityResolver = resolveAuthIdentity,
    private readonly matchPersistence: MatchPersistenceClientLike = new NoopMatchPersistenceClient(),
    private readonly friendshipClient: FriendshipClientLike = new HttpFriendshipClient(),
    private readonly invitePersistence: MatchInvitePersistenceClientLike = new HttpMatchInvitePersistenceClient(),
    private readonly socialGraphClient: SocialGraphClientLike = new HttpSocialGraphClient(),
  ) {}

  start(port: number): void {
    this.wss = new WebSocketServer({ port });
    this.wss.on('connection', (socket) => this.handleConnection(socket));
  }

  stop(): void {
    this.wss?.close();
  }

  private handleConnection(socket: WebSocket): void {
    const socketId = `socket_${++this.socketSequence}`;
    this.socketIds.set(socket, socketId);

    socket.on('message', (data) => {
      const raw = data.toString();
      void this.handleIncomingMessage(socket, raw);
    });

    socket.on('close', () => {
      this.detachSocket(socket);
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
    if (message.type === 'social.subscribe') {
      const identity = await this.identityResolver(message.token);
      if (!identity) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'unauthorized',
          error: 'Unauthorized',
        });
        return;
      }

      this.bindAuthenticatedSocket(socket, identity);
      const now = new Date().toISOString();
      await this.syncInviteState([identity.userId], now);
      this.send(socket, {
        type: 'social.subscribed',
        userId: identity.userId,
        username: identity.username,
      });
      await this.sendSocialSnapshot(identity.userId, socket);
      this.send(socket, {
        type: 'social.presence',
        presences: this.presenceRegistry.getPresences([identity.userId]),
      });
      const activeInvites = this.inviteRegistry.listActiveForUser(identity.userId, now);
      this.send(socket, {
        type: 'social.invites.snapshot',
        invites: activeInvites,
      });
      activeInvites.forEach((invite) => {
        this.send(socket, {
          type: 'matchInvite.updated',
          invite,
        });
      });
      return;
    }
    if (message.type === 'social.friends.query') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'social.friends.query', 'Unauthorized');
        return;
      }

      await this.sendSocialSnapshot(identity.userId, socket);
      return;
    }
    if (message.type === 'social.presence.query') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'unauthorized',
          error: 'Unauthorized',
        });
        return;
      }

      this.send(socket, {
        type: 'social.presence',
        presences: this.presenceRegistry.getPresences(message.userIds),
      });
      return;
    }
    if (message.type === 'friendRequest.send') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'friendRequest.send', 'Unauthorized');
        return;
      }

      try {
        const request = await this.socialGraphClient.sendFriendRequest(identity.userId, message.username);
        await this.broadcastSocialSnapshots([request.senderUserId, request.receiverUserId]);
      } catch (error) {
        this.sendSocialRejected(socket, 'friendRequest.send', this.toErrorMessage(error));
      }
      return;
    }
    if (message.type === 'friendRequest.accept') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'friendRequest.accept', 'Unauthorized', {
          requestId: message.requestId,
        });
        return;
      }

      try {
        const request = await this.socialGraphClient.acceptFriendRequest(identity.userId, message.requestId);
        await this.broadcastSocialSnapshots([request.senderUserId, request.receiverUserId]);
      } catch (error) {
        this.sendSocialRejected(socket, 'friendRequest.accept', this.toErrorMessage(error), {
          requestId: message.requestId,
        });
      }
      return;
    }
    if (message.type === 'friendRequest.decline') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'friendRequest.decline', 'Unauthorized', {
          requestId: message.requestId,
        });
        return;
      }

      try {
        const request = await this.socialGraphClient.declineFriendRequest(identity.userId, message.requestId);
        await this.broadcastSocialSnapshots([request.senderUserId, request.receiverUserId]);
      } catch (error) {
        this.sendSocialRejected(socket, 'friendRequest.decline', this.toErrorMessage(error), {
          requestId: message.requestId,
        });
      }
      return;
    }
    if (message.type === 'friendRequest.cancel') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'friendRequest.cancel', 'Unauthorized', {
          requestId: message.requestId,
        });
        return;
      }

      try {
        const request = await this.socialGraphClient.cancelFriendRequest(identity.userId, message.requestId);
        await this.broadcastSocialSnapshots([request.senderUserId, request.receiverUserId]);
      } catch (error) {
        this.sendSocialRejected(socket, 'friendRequest.cancel', this.toErrorMessage(error), {
          requestId: message.requestId,
        });
      }
      return;
    }
    if (message.type === 'friend.delete') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.sendSocialRejected(socket, 'friend.delete', 'Unauthorized', {
          friendUserId: message.friendUserId,
        });
        return;
      }

      try {
        await this.socialGraphClient.deleteFriend(identity.userId, message.friendUserId);
        await this.broadcastSocialSnapshots([identity.userId, message.friendUserId]);
      } catch (error) {
        this.sendSocialRejected(socket, 'friend.delete', this.toErrorMessage(error), {
          friendUserId: message.friendUserId,
        });
      }
      return;
    }
    if (message.type === 'join') {
      const identity = await this.identityResolver(message.token);
      if (!identity) {
        this.send(socket, this.toJoinRejected(message.sessionId, 'unauthorized', 'Unauthorized'));
        return;
      }

      const deck = await resolvePlayerDeck(message.token, message.deckId);
      if (deck.status === 'unavailable') {
        this.send(socket, this.toJoinRejected(message.sessionId, 'deck_unavailable', 'Deck not found or unavailable'));
        return;
      }
      if (deck.status === 'invalid') {
        this.send(socket, this.toJoinRejected(message.sessionId, 'deck_invalid', deck.error));
        return;
      }

      const result = this.gameService.join(message.sessionId, {
        playerId: identity.userId,
        characterId: deck.deck.characterId,
        deck: deck.deck.cards,
      }, message.seed);
      if (!result.ok) {
        this.send(socket, this.toJoinRejected(message.sessionId, this.toJoinRejectCode(result.error), result.error));
        return;
      }

      this.bindAuthenticatedSocket(socket, identity);
      this.trackSessionJoin(message.sessionId, identity, deck.deck.deckId, result.session.getSeed());
      this.markSocketInMatch(socket, true);
      await this.persistMatchIfReady(message.sessionId, result.session.getState());

      this.attachSocket(message.sessionId, identity.userId, socket);
      await this.consumeInviteIfMatchReady(message.sessionId);
      const stateSnapshot = this.gameService.getStateSnapshot(message.sessionId);
      if (stateSnapshot) {
        this.broadcast(message.sessionId, this.toStateMessage(message.sessionId, stateSnapshot));
      }
      this.broadcastRoundStatus(message.sessionId);
      this.sendRoundDraftSnapshot(message.sessionId, identity.userId, socket);
      return;
    }
    if (message.type === 'matchInvite.send') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'unauthorized',
          error: 'Unauthorized',
        });
        return;
      }

      const now = new Date().toISOString();
      await this.syncInviteState([identity.userId, message.targetUserId], now);

      if (!this.presenceRegistry.isOnline(message.targetUserId)) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'target_offline',
          error: 'Target user is offline',
        });
        return;
      }

      if (this.presenceRegistry.getPresences([message.targetUserId])[0]?.status === 'in_match') {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'target_in_match',
          error: 'Target user is already in a match',
        });
        return;
      }

      const areFriends = await this.friendshipClient.areFriends(
        identity.userId,
        message.targetUserId,
      );
      if (!areFriends) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'not_friends',
          error: 'Invite is available only for friends',
        });
        return;
      }

      const expiresAt = new Date(Date.now() + 2 * 60_000).toISOString();
      const result = this.inviteRegistry.createInvite({
        id: `invite_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        inviterUserId: identity.userId,
        inviterUsername: identity.username,
        targetUserId: message.targetUserId,
        createdAt: now,
        expiresAt,
      });

      if (!result.ok) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: result.reason,
          error: this.toInviteErrorMessage(result.reason),
        });
        return;
      }

      await this.saveInviteSafely(result.invite);
      this.send(socket, { type: 'matchInvite.updated', invite: result.invite });
      this.sendToUser(message.targetUserId, { type: 'matchInvite.received', invite: result.invite });
      return;
    }
    if (message.type === 'matchInvite.respond') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'unauthorized',
          error: 'Unauthorized',
        });
        return;
      }

      const now = new Date().toISOString();
      await this.syncInviteState([identity.userId], now);

      const result = this.inviteRegistry.respondToInvite({
        inviteId: message.inviteId,
        actorUserId: identity.userId,
        action: message.action,
        now,
      });

      if (!result.ok) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: result.reason,
          error: this.toInviteErrorMessage(result.reason),
          inviteId: message.inviteId,
        });
        return;
      }

      if (result.invite.status === 'accepted') {
        const invite = this.attachInviteMatchSession(result.invite);
        this.inviteRegistry.upsertInvite(invite);
        await this.saveInviteSafely(invite);
        this.broadcastInviteUpdate(invite);
        return;
      }

      await this.saveInviteSafely(result.invite);
      this.broadcastInviteUpdate(result.invite);
      return;
    }
    if (message.type === 'matchInvite.cancel') {
      const identity = this.socketIdentity.get(socket);
      if (!identity) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: 'unauthorized',
          error: 'Unauthorized',
        });
        return;
      }

      const now = new Date().toISOString();
      await this.syncInviteState([identity.userId], now);

      const result = this.inviteRegistry.cancelInvite({
        inviteId: message.inviteId,
        actorUserId: identity.userId,
        now,
      });

      if (!result.ok) {
        this.send(socket, {
          type: 'matchInvite.rejected',
          code: result.reason,
          error: this.toInviteErrorMessage(result.reason),
          inviteId: message.inviteId,
        });
        return;
      }

      await this.saveInviteSafely(result.invite);
      this.broadcastInviteUpdate(result.invite);
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
    this.detachSessionBinding(socket);
    const set = this.sessionSockets.get(sessionId) ?? new Set<WebSocket>();
    set.add(socket);
    this.sessionSockets.set(sessionId, set);
    this.socketBindings.set(socket, { sessionId, playerId });
  }

  private detachSocket(socket: WebSocket): void {
    this.detachSessionBinding(socket);

    const identity = this.socketIdentity.get(socket);
    if (identity) {
      const userSet = this.userSockets.get(identity.userId);
      userSet?.delete(socket);
      if (userSet && userSet.size === 0) {
        this.userSockets.delete(identity.userId);
      }
      this.socketIdentity.delete(socket);
    }

    const socketId = this.socketIds.get(socket);
    if (socketId) {
      this.presenceRegistry.unbindSocket(socketId);
      this.socketIds.delete(socket);
    }
  }

  private detachSessionBinding(socket: WebSocket): void {
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

  private bindAuthenticatedSocket(socket: WebSocket, identity: AuthIdentity): void {
    const socketId = this.socketIds.get(socket);
    if (!socketId) {
      return;
    }

    const previousIdentity = this.socketIdentity.get(socket);
    if (previousIdentity && previousIdentity.userId !== identity.userId) {
      const previousUserSockets = this.userSockets.get(previousIdentity.userId);
      previousUserSockets?.delete(socket);
      if (previousUserSockets && previousUserSockets.size === 0) {
        this.userSockets.delete(previousIdentity.userId);
      }
    }

    this.socketIdentity.set(socket, identity);
    const userSet = this.userSockets.get(identity.userId) ?? new Set<WebSocket>();
    userSet.add(socket);
    this.userSockets.set(identity.userId, userSet);
    this.presenceRegistry.bindSocket(socketId, identity.userId);
  }

  private markSocketInMatch(socket: WebSocket, inMatch: boolean): void {
    const socketId = this.socketIds.get(socket);
    if (!socketId) {
      return;
    }

    this.presenceRegistry.setSocketInMatch(socketId, inMatch);
  }

  private sendToUser(userId: string, message: ServerMessageDto): void {
    const sockets = this.userSockets.get(userId);
    if (!sockets) {
      return;
    }

    sockets.forEach((socket) => this.send(socket, message));
  }

  private async sendSocialSnapshot(userId: string, socket: WebSocket): Promise<void> {
    try {
      const snapshot = await this.socialGraphClient.getSnapshot(userId);
      this.send(socket, {
        type: 'social.friends.snapshot',
        friends: snapshot.friends,
        incomingRequests: snapshot.incomingRequests,
        outgoingRequests: snapshot.outgoingRequests,
      });
    } catch (error) {
      this.sendSocialRejected(socket, 'social.friends.query', this.toErrorMessage(error));
    }
  }

  private async broadcastSocialSnapshots(userIds: string[]): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds.filter((userId) => userId.length > 0)));

    await Promise.all(
      uniqueUserIds.map(async (userId) => {
        const sockets = this.userSockets.get(userId);
        if (!sockets || sockets.size === 0) {
          return;
        }

        try {
          const snapshot = await this.socialGraphClient.getSnapshot(userId);
          sockets.forEach((socket) =>
            this.send(socket, {
              type: 'social.friends.snapshot',
              friends: snapshot.friends,
              incomingRequests: snapshot.incomingRequests,
              outgoingRequests: snapshot.outgoingRequests,
            }),
          );
        } catch (error) {
          sockets.forEach((socket) =>
            this.sendSocialRejected(socket, 'social.friends.query', this.toErrorMessage(error)),
          );
        }
      }),
    );
  }

  private sendSocialRejected(
    socket: WebSocket,
    requestType: Extract<
      Extract<ServerMessageDto, { type: 'social.friends.rejected' }>['requestType'],
      string
    >,
    error: string,
    extra: Partial<Extract<ServerMessageDto, { type: 'social.friends.rejected' }>> = {},
  ): void {
    this.send(socket, {
      type: 'social.friends.rejected',
      code: error === 'Unauthorized' ? 'unauthorized' : 'internal_error',
      error,
      requestType,
      ...extra,
    });
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private broadcastInviteUpdate(invite: MatchInviteRecord): void {
    this.sendToUser(invite.inviterUserId, { type: 'matchInvite.updated', invite });
    this.sendToUser(invite.targetUserId, { type: 'matchInvite.updated', invite });
  }

  private async syncInviteState(userIds: string[], now: string): Promise<void> {
    const uniqueUserIds = Array.from(new Set(userIds.filter((userId) => userId.length > 0)));
    const inviteGroups = await Promise.all(
      uniqueUserIds.map((userId) =>
        this.invitePersistence.listActiveInvitesForUser(userId, now),
      ),
    );

    inviteGroups.flat().forEach((invite) => {
      this.inviteRegistry.upsertInvite(invite);
    });
  }

  private async saveInviteSafely(invite: MatchInviteRecord): Promise<void> {
    try {
      await this.invitePersistence.saveInvite(invite);
    } catch (error) {
      logger.warn(
        `Failed to persist invite ${invite.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private attachInviteMatchSession(invite: MatchInviteRecord): MatchInviteUpdatedMessage['invite'] {
    const sessionId = `invite_match_${invite.id}`;
    const preparedAt = new Date().toISOString();
    return {
      ...invite,
      updatedAt: preparedAt,
      expiresAt: new Date(
        Date.parse(preparedAt) + WsGateway.PREPARED_INVITE_TTL_MS,
      ).toISOString(),
      sessionId,
      seed: this.toInviteSeed(sessionId),
    };
  }

  private async consumeInviteIfMatchReady(sessionId: string): Promise<void> {
    const meta = this.sessionMeta.get(sessionId);
    if (!meta || meta.players.size < 2) {
      return;
    }

    const consumedInvite = this.inviteRegistry.consumeInviteBySessionId(
      sessionId,
      new Date().toISOString(),
    );
    if (!consumedInvite) {
      return;
    }

    await this.saveInviteSafely(consumedInvite);
    this.broadcastInviteUpdate(consumedInvite);
  }

  private toInviteSeed(sessionId: string): number {
    let hash = 0;

    for (let index = 0; index < sessionId.length; index += 1) {
      hash = ((hash << 5) - hash + sessionId.charCodeAt(index)) | 0;
    }

    return Math.abs(hash) || 1;
  }

  private toInviteErrorMessage(
    reason: 'self_invite' | 'duplicate_pending' | 'not_found' | 'forbidden' | 'invite_not_pending',
  ): string {
    switch (reason) {
      case 'self_invite':
        return 'Cannot invite yourself';
      case 'duplicate_pending':
        return 'Invite already pending';
      case 'not_found':
        return 'Invite not found';
      case 'forbidden':
        return 'Invite does not belong to current user';
      case 'invite_not_pending':
        return 'Invite is no longer pending';
    }
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
      const selfRoundPlayer = roundState.players[binding.playerId];
      const opponentRoundPlayer = Object.values(roundState.players).find(
        (playerRoundState) => playerRoundState.playerId !== binding.playerId,
      );
      const selfLocked = selfRoundPlayer?.locked ?? false;
      const opponentLocked = opponentRoundPlayer?.locked ?? false;
      const selfDraftCount = selfRoundPlayer?.draftCount ?? 0;
      const opponentDraftCount = opponentRoundPlayer?.draftCount ?? 0;

      this.send(socket, {
        type: 'roundStatus',
        roundNumber: roundState.number,
        selfLocked,
        opponentLocked,
        selfDraftCount,
        opponentDraftCount,
      });
    });
  }
}
