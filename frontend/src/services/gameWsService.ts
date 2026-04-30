import { WS_URL } from '@/constants';
import {
  GameStateSnapshot,
  JoinMatchMessage,
  LockRoundDraftMessage,
  PvpConnectionStatus,
  PvpServiceEvent,
  PvpServerMessage,
  ReplaceRoundDraftMessage,
  RoundActionIntentDraft,
} from '@/types';

type EventListener = (event: PvpServiceEvent) => void;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isOptionalString = (value: unknown): value is string | undefined =>
  value === undefined || typeof value === 'string';

const isPlaybackEntityRef = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.type === 'string' &&
  typeof value.id === 'string';

const isPlaybackChange = (value: unknown): boolean =>
  isRecord(value) &&
  isPlaybackEntityRef(value.entity) &&
  typeof value.field === 'string' &&
  (typeof value.from === 'string' ||
    typeof value.from === 'number' ||
    typeof value.from === 'boolean' ||
    value.from === null) &&
  (typeof value.to === 'string' ||
    typeof value.to === 'number' ||
    typeof value.to === 'boolean' ||
    value.to === null) &&
  (value.amount === undefined || typeof value.amount === 'number');

const isResolvePlaybackFrame = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.roundNumber === 'number' &&
  typeof value.kind === 'string' &&
  typeof value.label === 'string' &&
  isOptionalString(value.actionIntentId) &&
  (value.orderIndex === undefined || typeof value.orderIndex === 'number') &&
  (value.source === undefined || isPlaybackEntityRef(value.source)) &&
  (value.target === undefined || isPlaybackEntityRef(value.target)) &&
  Array.isArray(value.changes) &&
  value.changes.every(isPlaybackChange);

const isResolvedRoundActionSource = (value: unknown): boolean =>
  isRecord(value) &&
  (
    (value.type === 'card' &&
      typeof value.cardInstanceId === 'string' &&
      isOptionalString(value.definitionId)) ||
    (value.type === 'boardItem' && typeof value.boardItemId === 'string') ||
    (value.type === 'actor' && typeof value.actorId === 'string')
  );

const isResolvedRoundActionTarget = (value: unknown): boolean =>
  isRecord(value) &&
  isOptionalString(value.targetId) &&
  isOptionalString(value.targetType);

const isResolvedRoundAction = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.orderIndex === 'number' &&
  typeof value.intentId === 'string' &&
  typeof value.playerId === 'string' &&
  typeof value.kind === 'string' &&
  typeof value.actorId === 'string' &&
  typeof value.layer === 'string' &&
  typeof value.queueIndex === 'number' &&
  typeof value.priority === 'number' &&
  isResolvedRoundActionSource(value.source) &&
  (value.target === undefined || isResolvedRoundActionTarget(value.target)) &&
  typeof value.status === 'string' &&
  typeof value.reasonCode === 'string' &&
  typeof value.summary === 'string' &&
  isOptionalString(value.cardInstanceId) &&
  isOptionalString(value.definitionId);

const isStateMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'state' }> =>
  isRecord(value) && value.type === 'state' && isRecord(value.state);

const isTransportRejectedMessage = (
  value: unknown
): value is Extract<PvpServerMessage, { type: 'transport.rejected' }> =>
  isRecord(value) &&
  value.type === 'transport.rejected' &&
  typeof value.code === 'string' &&
  typeof value.error === 'string' &&
  typeof value.requestType === 'string';

const isJoinRejectedMessage = (
  value: unknown
): value is Extract<PvpServerMessage, { type: 'join.rejected' }> =>
  isRecord(value) &&
  value.type === 'join.rejected' &&
  typeof value.sessionId === 'string' &&
  typeof value.code === 'string' &&
  typeof value.error === 'string';

const isErrorMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'error' }> =>
  isRecord(value) && value.type === 'error' && typeof value.error === 'string';

const isAckMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'ack' }> =>
  isRecord(value) && value.type === 'ack';

const isRoundDraftAcceptedMessage = (
  value: unknown
): value is Extract<PvpServerMessage, { type: 'roundDraft.accepted' }> =>
  isRecord(value) && value.type === 'roundDraft.accepted' && typeof value.roundNumber === 'number';

const isRoundDraftRejectedMessage = (
  value: unknown
): value is Extract<PvpServerMessage, { type: 'roundDraft.rejected' }> =>
  isRecord(value) &&
  value.type === 'roundDraft.rejected' &&
  (value.operation === 'replace' || value.operation === 'lock') &&
  typeof value.roundNumber === 'number' &&
  typeof value.code === 'string' &&
  typeof value.error === 'string' &&
  Array.isArray(value.errors);

const isRoundDraftSnapshotMessage = (
  value: unknown
): value is Extract<PvpServerMessage, { type: 'roundDraft.snapshot' }> =>
  isRecord(value) &&
  value.type === 'roundDraft.snapshot' &&
  typeof value.roundNumber === 'number' &&
  typeof value.locked === 'boolean' &&
  Array.isArray(value.intents);

const isRoundStatusMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'roundStatus' }> =>
  isRecord(value) &&
  value.type === 'roundStatus' &&
  typeof value.roundNumber === 'number' &&
  typeof value.selfLocked === 'boolean' &&
  typeof value.opponentLocked === 'boolean' &&
  typeof value.selfDraftCount === 'number' &&
  typeof value.opponentDraftCount === 'number';

const isRoundResolvedMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'roundResolved' }> =>
  isRecord(value) &&
  value.type === 'roundResolved' &&
  isRecord(value.result) &&
  typeof value.result.roundNumber === 'number' &&
  Array.isArray(value.result.orderedActions) &&
  value.result.orderedActions.every(isResolvedRoundAction) &&
  (value.result.playbackFrames === undefined ||
    (Array.isArray(value.result.playbackFrames) && value.result.playbackFrames.every(isResolvePlaybackFrame)));

const isRoundAuditEvent = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.timestamp === 'string' &&
  typeof value.sessionId === 'string' &&
  (value.scope === 'public' || value.scope === 'private') &&
  typeof value.event === 'string';

const isRoundAuditMessage = (value: unknown): value is Extract<PvpServerMessage, { type: 'roundAudit' }> =>
  isRecord(value) &&
  value.type === 'roundAudit' &&
  isRoundAuditEvent(value.event);

const parseServerMessage = (raw: string): PvpServerMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isStateMessage(parsed)) {
      return parsed;
    }
    if (isTransportRejectedMessage(parsed)) {
      return parsed;
    }
    if (isJoinRejectedMessage(parsed)) {
      return parsed;
    }
    if (isErrorMessage(parsed)) {
      return parsed;
    }
    if (isAckMessage(parsed)) {
      return parsed;
    }
    if (isRoundDraftAcceptedMessage(parsed)) {
      return parsed;
    }
    if (isRoundDraftRejectedMessage(parsed)) {
      return parsed;
    }
    if (isRoundDraftSnapshotMessage(parsed)) {
      return parsed;
    }
    if (isRoundStatusMessage(parsed)) {
      return parsed;
    }
    if (isRoundResolvedMessage(parsed)) {
      return parsed;
    }
    if (isRoundAuditMessage(parsed)) {
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

  replaceRoundDraft(roundNumber: number, intents: RoundActionIntentDraft[]): void {
    const message: ReplaceRoundDraftMessage = {
      type: 'roundDraft.replace',
      roundNumber,
      intents,
    };
    this.send(message);
  }

  lockRound(roundNumber: number): void {
    const message: LockRoundDraftMessage = {
      type: 'roundDraft.lock',
      roundNumber,
    };
    this.send(message);
  }

  private send(message: JoinMatchMessage | ReplaceRoundDraftMessage | LockRoundDraftMessage): void {
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
      this.emit({
        type: 'state',
        state: parsed.state as GameStateSnapshot,
        playerLabels: parsed.playerLabels,
      });
      return;
    }

    if (parsed.type === 'transport.rejected') {
      this.emit({
        type: 'transportRejected',
        code: parsed.code,
        error: parsed.error,
        requestType: parsed.requestType,
      });
      return;
    }

    if (parsed.type === 'join.rejected') {
      this.emit({
        type: 'joinRejected',
        sessionId: parsed.sessionId,
        code: parsed.code,
        error: parsed.error,
      });
      return;
    }

    if (parsed.type === 'error') {
      this.emit({ type: 'error', error: parsed.error });
      return;
    }

    if (parsed.type === 'roundDraft.accepted') {
      this.emit({ type: 'roundDraftAccepted', roundNumber: parsed.roundNumber });
      return;
    }

    if (parsed.type === 'roundDraft.rejected') {
      this.emit({
        type: 'roundDraftRejected',
        operation: parsed.operation,
        roundNumber: parsed.roundNumber,
        code: parsed.code,
        error: parsed.error,
        errors: parsed.errors,
      });
      return;
    }

    if (parsed.type === 'roundDraft.snapshot') {
      this.emit({
        type: 'roundDraftSnapshot',
        roundNumber: parsed.roundNumber,
        locked: parsed.locked,
        intents: parsed.intents,
        boardModel: parsed.boardModel,
      });
      return;
    }

    if (parsed.type === 'roundStatus') {
      this.emit({
        type: 'roundStatus',
        roundNumber: parsed.roundNumber,
        selfLocked: parsed.selfLocked,
        opponentLocked: parsed.opponentLocked,
        selfDraftCount: parsed.selfDraftCount,
        opponentDraftCount: parsed.opponentDraftCount,
      });
      return;
    }

    if (parsed.type === 'roundResolved') {
      this.emit({ type: 'roundResolved', result: parsed.result });
      return;
    }

    if (parsed.type === 'roundAudit') {
      this.emit({ type: 'roundAudit', event: parsed.event });
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
