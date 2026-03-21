import { WebSocketServer, WebSocket } from 'ws';
import { GameService } from '../../application/GameService';
import { ClientMessageDto, parseClientMessage, ServerMessageDto } from './dto';
import { AuthIdentity, resolveAuthIdentity } from '../../infrastructure/auth/AuthIdentityClient';
import { resolvePlayerDeck } from '../../infrastructure/decks/DeckCatalogClient';

type IdentityResolver = (token: string) => Promise<AuthIdentity | null>;

export class WsGateway {
  private wss?: WebSocketServer;
  private readonly sessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketBindings = new Map<WebSocket, { sessionId: string; playerId: string }>();

  constructor(
    private readonly gameService: GameService,
    private readonly identityResolver: IdentityResolver = resolveAuthIdentity,
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
      this.broadcast(binding.sessionId, { type: 'state', state: result.state });
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
