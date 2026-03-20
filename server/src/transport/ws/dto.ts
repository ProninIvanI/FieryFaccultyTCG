export type ClientMessageDto =
  | { type: 'join'; sessionId: string; token: string; seed?: number }
  | { type: 'action'; action: unknown };

export type ServerMessageDto =
  | { type: 'state'; state: unknown }
  | { type: 'error'; error: string }
  | { type: 'ack' };

const isString = (value: unknown): value is string => typeof value === 'string';
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

export const parseClientMessage = (raw: string): { ok: true; value: ClientMessageDto } | { ok: false; error: string } => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Invalid payload' };
  }
  const data = parsed as { type?: unknown; sessionId?: unknown; token?: unknown; seed?: unknown; action?: unknown };
  if (data.type === 'join') {
    if (!isString(data.sessionId) || !isString(data.token)) {
      return { ok: false, error: 'Invalid join payload' };
    }
    if (data.seed !== undefined && !isNumber(data.seed)) {
      return { ok: false, error: 'Invalid seed' };
    }
    return { ok: true, value: { type: 'join', sessionId: data.sessionId, token: data.token, seed: data.seed } };
  }
  if (data.type === 'action') {
    if (!data.action || typeof data.action !== 'object') {
      return { ok: false, error: 'Invalid action payload' };
    }
    return { ok: true, value: { type: 'action', action: data.action } };
  }
  return { ok: false, error: 'Unknown message type' };
};
