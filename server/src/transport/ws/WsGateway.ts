import { WebSocketServer, WebSocket } from 'ws';
import { GameService } from '../../application/GameService';
import { ClientMessageDto, parseClientMessage, ServerMessageDto } from './dto';

export class WsGateway {
  private wss?: WebSocketServer;
  private readonly sessionSockets = new Map<string, Set<WebSocket>>();
  private readonly socketBindings = new Map<WebSocket, { sessionId: string; playerId: string }>();

  constructor(private readonly gameService: GameService) {}

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
      const parsed = parseClientMessage(raw);
      if (!parsed.ok) {
        this.send(socket, { type: 'error', error: parsed.error });
        return;
      }
      this.routeMessage(socket, parsed.value);
    });
  }

  private routeMessage(socket: WebSocket, message: ClientMessageDto): void {
    if (message.type === 'join') {
      const result = this.gameService.join(message.sessionId, message.playerId, message.seed);
      if (!result.ok) {
        this.send(socket, { type: 'error', error: result.error });
        return;
      }
      this.attachSocket(message.sessionId, message.playerId, socket);
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
