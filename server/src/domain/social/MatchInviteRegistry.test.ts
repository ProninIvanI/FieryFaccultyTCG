import { describe, expect, it } from 'vitest';
import { MatchInviteRegistry } from './MatchInviteRegistry';

const createInvite = (registry: MatchInviteRegistry) =>
  registry.createInvite({
    id: 'invite_1',
    inviterUserId: 'user_alpha',
    inviterUsername: 'Alpha',
    targetUserId: 'user_bravo',
    createdAt: '2026-04-22T10:00:00.000Z',
    expiresAt: '2026-04-22T10:02:00.000Z',
  });

describe('MatchInviteRegistry', () => {
  it('creates pending invite', () => {
    const registry = new MatchInviteRegistry();

    const result = createInvite(registry);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.invite.status).toBe('pending');
  });

  it('rejects self invite', () => {
    const registry = new MatchInviteRegistry();

    const result = registry.createInvite({
      id: 'invite_1',
      inviterUserId: 'user_alpha',
      targetUserId: 'user_alpha',
      createdAt: '2026-04-22T10:00:00.000Z',
      expiresAt: '2026-04-22T10:02:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'self_invite',
    });
  });

  it('rejects duplicate pending invite for same pair', () => {
    const registry = new MatchInviteRegistry();

    createInvite(registry);
    const duplicate = registry.createInvite({
      id: 'invite_2',
      inviterUserId: 'user_alpha',
      inviterUsername: 'Alpha',
      targetUserId: 'user_bravo',
      createdAt: '2026-04-22T10:01:00.000Z',
      expiresAt: '2026-04-22T10:03:00.000Z',
    });

    expect(duplicate).toEqual({
      ok: false,
      reason: 'duplicate_pending',
    });
  });

  it('accepts pending invite only for target user', () => {
    const registry = new MatchInviteRegistry();
    createInvite(registry);

    const result = registry.respondToInvite({
      inviteId: 'invite_1',
      actorUserId: 'user_bravo',
      action: 'accept',
      now: '2026-04-22T10:01:00.000Z',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.invite.status).toBe('accepted');
  });

  it('consumes accepted invite by prepared session id', () => {
    const registry = new MatchInviteRegistry();
    createInvite(registry);

    const accepted = registry.respondToInvite({
      inviteId: 'invite_1',
      actorUserId: 'user_bravo',
      action: 'accept',
      now: '2026-04-22T10:01:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }

    registry.upsertInvite({
      ...accepted.invite,
      sessionId: 'invite_match_invite_1',
      seed: 77,
      expiresAt: '2026-04-22T10:11:00.000Z',
    });

    const consumed = registry.consumeInviteBySessionId(
      'invite_match_invite_1',
      '2026-04-22T10:02:00.000Z',
    );

    expect(consumed?.status).toBe('consumed');
  });

  it('expires pending invites lazily', () => {
    const registry = new MatchInviteRegistry();
    createInvite(registry);

    const result = registry.respondToInvite({
      inviteId: 'invite_1',
      actorUserId: 'user_bravo',
      action: 'accept',
      now: '2026-04-22T10:03:00.000Z',
    });

    expect(result).toEqual({
      ok: false,
      reason: 'invite_not_pending',
    });
  });

  it('expires accepted invite lazily after prepared session ttl', () => {
    const registry = new MatchInviteRegistry();
    createInvite(registry);

    const accepted = registry.respondToInvite({
      inviteId: 'invite_1',
      actorUserId: 'user_bravo',
      action: 'accept',
      now: '2026-04-22T10:01:00.000Z',
    });

    expect(accepted.ok).toBe(true);
    if (!accepted.ok) {
      return;
    }

    registry.upsertInvite({
      ...accepted.invite,
      sessionId: 'invite_match_invite_1',
      seed: 77,
      expiresAt: '2026-04-22T10:03:00.000Z',
    });

    const activeInvites = registry.listActiveForUser(
      'user_bravo',
      '2026-04-22T10:04:00.000Z',
    );

    expect(activeInvites).toEqual([]);
  });
});
