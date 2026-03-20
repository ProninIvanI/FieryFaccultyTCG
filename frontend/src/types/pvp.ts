export type GameActionPayload = Record<string, unknown>;

export type GameStateSnapshot = Record<string, unknown>;

export interface JoinMatchMessage {
  type: 'join';
  sessionId: string;
  playerId: string;
  seed?: number;
}

export interface ActionMessage {
  type: 'action';
  action: GameActionPayload;
}

export type PvpClientMessage = JoinMatchMessage | ActionMessage;

export interface StateServerMessage {
  type: 'state';
  state: GameStateSnapshot;
}

export interface ErrorServerMessage {
  type: 'error';
  error: string;
}

export interface AckServerMessage {
  type: 'ack';
}

export type PvpServerMessage =
  | StateServerMessage
  | ErrorServerMessage
  | AckServerMessage;

export type PvpConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error';

export type PvpServiceEvent =
  | { type: 'status'; status: PvpConnectionStatus }
  | { type: 'state'; state: GameStateSnapshot }
  | { type: 'error'; error: string }
  | { type: 'ack' };
