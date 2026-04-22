import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { socialWsService } from './socialWsService';

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  readyState = FakeWebSocket.CONNECTING;
  sent: string[] = [];

  private listeners: Record<string, Array<(event?: unknown) => void>> = {
    open: [],
    message: [],
    error: [],
    close: [],
  };

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type]?.push(listener);
  }

  removeEventListener(type: string, listener: (event?: unknown) => void): void {
    this.listeners[type] = this.listeners[type]?.filter((item) => item !== listener) ?? [];
  }

  send(payload: string): void {
    this.sent.push(payload);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    this.emit('close');
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  emitMessage(payload: unknown): void {
    this.emit('message', { data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
  }

  private emit(type: string, event?: unknown): void {
    this.listeners[type]?.forEach((listener) => listener(event));
  }
}

const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

describe('socialWsService', () => {
  const originalWebSocket = globalThis.WebSocket;

  beforeEach(() => {
    FakeWebSocket.instances = [];
    socialWsService.disconnect();
    globalThis.WebSocket = FakeWebSocket as unknown as typeof WebSocket;
  });

  afterEach(() => {
    socialWsService.disconnect();
    globalThis.WebSocket = originalWebSocket;
    vi.restoreAllMocks();
  });

  it('subscribes with token after socket opens', async () => {
    const connectPromise = socialWsService.connect('token_1', 'ws://social.test');
    const socket = FakeWebSocket.instances[0];

    expect(socket).toBeDefined();

    socket.emitOpen();
    await connectPromise;

    expect(socket.sent).toContain(
      JSON.stringify({
        type: 'social.subscribe',
        token: 'token_1',
      }),
    );
  });

  it('emits presence events from social presence payload', async () => {
    const listener = vi.fn();
    const unsubscribe = socialWsService.subscribe(listener);
    const connectPromise = socialWsService.connect('token_1', 'ws://social.test');
    const socket = FakeWebSocket.instances[0];

    socket.emitOpen();
    await connectPromise;

    socket.emitMessage({
      type: 'social.presence',
      presences: [
        { userId: 'user_alpha', status: 'online' },
        { userId: 'user_bravo', status: 'in_match' },
      ],
    });
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledWith({
      type: 'presence',
      presences: [
        { userId: 'user_alpha', status: 'online' },
        { userId: 'user_bravo', status: 'in_match' },
      ],
    });

    unsubscribe();
  });

  it('emits invite snapshot events from social snapshot payload', async () => {
    const listener = vi.fn();
    const unsubscribe = socialWsService.subscribe(listener);
    const connectPromise = socialWsService.connect('token_1', 'ws://social.test');
    const socket = FakeWebSocket.instances[0];

    socket.emitOpen();
    await connectPromise;

    socket.emitMessage({
      type: 'social.invites.snapshot',
      invites: [
        {
          id: 'invite_1',
          inviterUserId: 'user_alpha',
          inviterUsername: 'Alpha',
          targetUserId: 'user_bravo',
          status: 'accepted',
          sessionId: 'invite_match_invite_1',
          seed: 77,
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:01:00.000Z',
          expiresAt: '2026-04-22T10:02:00.000Z',
        },
      ],
    });
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledWith({
      type: 'inviteSnapshot',
      invites: [
        {
          id: 'invite_1',
          inviterUserId: 'user_alpha',
          inviterUsername: 'Alpha',
          targetUserId: 'user_bravo',
          status: 'accepted',
          sessionId: 'invite_match_invite_1',
          seed: 77,
          createdAt: '2026-04-22T10:00:00.000Z',
          updatedAt: '2026-04-22T10:01:00.000Z',
          expiresAt: '2026-04-22T10:02:00.000Z',
        },
      ],
    });

    unsubscribe();
  });

  it('sends presence query for requested user ids', async () => {
    const connectPromise = socialWsService.connect('token_1', 'ws://social.test');
    const socket = FakeWebSocket.instances[0];

    socket.emitOpen();
    await connectPromise;

    await socialWsService.queryPresence(['user_alpha', 'user_bravo']);

    expect(socket.sent).toContain(
      JSON.stringify({
        type: 'social.presence.query',
        userIds: ['user_alpha', 'user_bravo'],
      }),
    );
  });

  it('parses accepted invite update with session assignment', async () => {
    const listener = vi.fn();
    const unsubscribe = socialWsService.subscribe(listener);
    const connectPromise = socialWsService.connect('token_1', 'ws://social.test');
    const socket = FakeWebSocket.instances[0];

    socket.emitOpen();
    await connectPromise;

    socket.emitMessage({
      type: 'matchInvite.updated',
      invite: {
        id: 'invite_1',
        inviterUserId: 'user_alpha',
        inviterUsername: 'Alpha',
        targetUserId: 'user_bravo',
        status: 'accepted',
        sessionId: 'invite_match_invite_1',
        seed: 77,
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:01:00.000Z',
        expiresAt: '2026-04-22T10:02:00.000Z',
      },
    });
    await flushMicrotasks();

    expect(listener).toHaveBeenCalledWith({
      type: 'inviteUpdated',
      invite: {
        id: 'invite_1',
        inviterUserId: 'user_alpha',
        inviterUsername: 'Alpha',
        targetUserId: 'user_bravo',
        status: 'accepted',
        sessionId: 'invite_match_invite_1',
        seed: 77,
        createdAt: '2026-04-22T10:00:00.000Z',
        updatedAt: '2026-04-22T10:01:00.000Z',
        expiresAt: '2026-04-22T10:02:00.000Z',
      },
    });

    unsubscribe();
  });
});
