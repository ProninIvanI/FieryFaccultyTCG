import { WS_URL } from '@/constants';
import {
  GameActionPayload,
  GameStateSnapshot,
  JoinMatchMessage,
  PvpConnectionStatus,
  PvpServiceEvent,
  PvpServerMessage,
} from '@/types';

type EventListener = (event: PvpServiceEvent) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStateMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'state' }> =>
  isRecord(value) && value.type === 'state' && isRecord(value.state);

const isErrorMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'error' }> =>
  isRecord(value) && value.type === 'error' && typeof value.error === 'string';

const isAckMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'ack' }> =>
  isRecord(value) && value.type === 'ack';

const parseServerMessage = (raw: string): PvpServerMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStateMessage(parsed)) {
      return parsed;
    }
    if (isErrorMessage(parsed)) {
      return parsed;
    }
    if (isAckMessage(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
};

class GameWsService {
  private socket: WebSocket | null = null;
  private status: PvpConnectionStatus = 'idle';
  private listeners = new Set<EventListener>();

  getStatus(): PvpConnectionStatus {
    return this.status;
  }

  subscribe(listener: EventListener): () => void {
    this.listeners.add(listener);
    listener({ type: 'status', status: this.status });
    return () => {
      this.listeners.delete(listener);
    };
  }

  async connect(url = WS_URL): Promise<void> {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return;
    }

    if (this.socket && this.socket.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.updateStatus('connecting');

    await new Promise<void>((resolve, reject) => {
      const socket = new WebSocket(url);
      this.socket = socket;

      socket.addEventListener('open', () => {
        this.updateStatus('connected');
        resolve();
      });

      socket.addEventListener('message', (event) => {
        this.handleMessage(event.data);
      });

      socket.addEventListener('error', () => {
        this.updateStatus('error');
        this.emit({ type: 'error', error: 'WebSocket connection error' });
        reject(new Error('WebSocket connection error'));
      });

      socket.addEventListener('close', () => {
        this.socket = null;
        this.updateStatus('disconnected');
      });
    });
  }

  disconnect(): void {
    this.socket?.close();
    this.socket = null;
    this.updateStatus('disconnected');
  }

  async joinSession(payload: JoinMatchMessage): Promise<void> {
    await this.connect();
    this.send(payload);
  }

  sendAction(action: GameActionPayload): void {
    this.send({
      type: 'action',
      action,
    });
  }

  private send(message: { type: 'join'; sessionId: string; playerId: string; seed?: number } | { type: 'action'; action: GameActionPayload }): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(JSON.stringify(message));
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.emit({ type: 'error', error: 'Unsupported non-text WebSocket message' });
      return;
    }

    const parsed = parseServerMessage(data);
    if (!parsed) {
      this.emit({ type: 'error', error: 'Unexpected server message format' });
      return;
    }

    if (parsed.type === 'state') {
      this.emit({ type: 'state', state: parsed.state as GameStateSnapshot });
      return;
    }

    if (parsed.type === 'error') {
      this.emit({ type: 'error', error: parsed.error });
      return;
    }

    this.emit({ type: 'ack' });
  }

  private updateStatus(status: PvpConnectionStatus): void {
    this.status = status;
    this.emit({ type: 'status', status });
  }

  private emit(event: PvpServiceEvent): void {
    this.listeners.forEach((listener) => listener(event));
  }
}

export const gameWsService = new GameWsService();
