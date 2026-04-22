import { describe, expect, it } from 'vitest';
import { parseClientMessage } from './dto';

describe('parseClientMessage', () => {
  it('parses social.subscribe', () => {
    const result = parseClientMessage(JSON.stringify({
      type: 'social.subscribe',
      token: 'token_1',
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        type: 'social.subscribe',
        token: 'token_1',
      },
    });
  });

  it('parses social.presence.query', () => {
    const result = parseClientMessage(JSON.stringify({
      type: 'social.presence.query',
      userIds: ['user_alpha', 'user_bravo'],
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        type: 'social.presence.query',
        userIds: ['user_alpha', 'user_bravo'],
      },
    });
  });

  it('parses matchInvite.send', () => {
    const result = parseClientMessage(JSON.stringify({
      type: 'matchInvite.send',
      targetUserId: 'user_bravo',
    }));

    expect(result).toEqual({
      ok: true,
      value: {
        type: 'matchInvite.send',
        targetUserId: 'user_bravo',
      },
    });
  });

  it('rejects invalid matchInvite.respond payload', () => {
    const result = parseClientMessage(JSON.stringify({
      type: 'matchInvite.respond',
      inviteId: 12,
      action: 'accept',
    }));

    expect(result.ok).toBe(false);
    if (result.ok) {
      return;
    }

    expect(result.rejection).toEqual({
      type: 'transport.rejected',
      code: 'invalid_payload',
      error: 'Invalid matchInvite.respond payload',
      requestType: 'matchInvite.respond',
    });
  });
});
