export type MatchInviteStatus =
  | 'pending'
  | 'accepted'
  | 'consumed'
  | 'declined'
  | 'cancelled'
  | 'expired';

export type MatchInviteRecord = {
  id: string;
  inviterUserId: string;
  inviterUsername?: string;
  targetUserId: string;
  status: MatchInviteStatus;
  sessionId?: string;
  seed?: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

type CreateInviteInput = {
  id: string;
  inviterUserId: string;
  inviterUsername?: string;
  targetUserId: string;
  createdAt: string;
  expiresAt: string;
};

type RespondInviteInput = {
  inviteId: string;
  actorUserId: string;
  action: 'accept' | 'decline';
  now: string;
};

type CancelInviteInput = {
  inviteId: string;
  actorUserId: string;
  now: string;
};

type InviteFailureReason =
  | 'self_invite'
  | 'duplicate_pending'
  | 'not_found'
  | 'forbidden'
  | 'invite_not_pending';

type InviteResult =
  | { ok: true; invite: MatchInviteRecord }
  | { ok: false; reason: InviteFailureReason };

const isExpired = (invite: MatchInviteRecord, now: string): boolean => invite.expiresAt <= now;

export class MatchInviteRegistry {
  private readonly invites = new Map<string, MatchInviteRecord>();

  upsertInvite(invite: MatchInviteRecord): MatchInviteRecord {
    this.invites.set(invite.id, { ...invite });
    return { ...invite };
  }

  createInvite(input: CreateInviteInput): InviteResult {
    if (input.inviterUserId === input.targetUserId) {
      return { ok: false, reason: 'self_invite' };
    }

    const now = input.createdAt;
    this.expirePendingInvites(now);

    for (const invite of this.invites.values()) {
      if (
        invite.status === 'pending' &&
        invite.inviterUserId === input.inviterUserId &&
        invite.targetUserId === input.targetUserId
      ) {
        return { ok: false, reason: 'duplicate_pending' };
      }
    }

    const invite: MatchInviteRecord = {
      id: input.id,
      inviterUserId: input.inviterUserId,
      inviterUsername: input.inviterUsername,
      targetUserId: input.targetUserId,
      status: 'pending',
      createdAt: input.createdAt,
      updatedAt: input.createdAt,
      expiresAt: input.expiresAt,
    };

    this.invites.set(invite.id, invite);
    return { ok: true, invite };
  }

  respondToInvite(input: RespondInviteInput): InviteResult {
    const invite = this.invites.get(input.inviteId);
    if (!invite) {
      return { ok: false, reason: 'not_found' };
    }

    this.expireInviteIfNeeded(invite, input.now);

    if (invite.targetUserId !== input.actorUserId) {
      return { ok: false, reason: 'forbidden' };
    }

    if (invite.status !== 'pending') {
      return { ok: false, reason: 'invite_not_pending' };
    }

    invite.status = input.action === 'accept' ? 'accepted' : 'declined';
    invite.updatedAt = input.now;

    return { ok: true, invite: { ...invite } };
  }

  cancelInvite(input: CancelInviteInput): InviteResult {
    const invite = this.invites.get(input.inviteId);
    if (!invite) {
      return { ok: false, reason: 'not_found' };
    }

    this.expireInviteIfNeeded(invite, input.now);

    if (invite.inviterUserId !== input.actorUserId) {
      return { ok: false, reason: 'forbidden' };
    }

    if (invite.status !== 'pending') {
      return { ok: false, reason: 'invite_not_pending' };
    }

    invite.status = 'cancelled';
    invite.updatedAt = input.now;

    return { ok: true, invite: { ...invite } };
  }

  consumeInviteBySessionId(
    sessionId: string,
    now: string,
  ): MatchInviteRecord | null {
    for (const invite of this.invites.values()) {
      this.expireInviteIfNeeded(invite, now);

      if (invite.sessionId === sessionId && invite.status === 'accepted') {
        invite.status = 'consumed';
        invite.updatedAt = now;
        return { ...invite };
      }
    }

    return null;
  }

  listPendingForUser(userId: string, now: string): MatchInviteRecord[] {
    this.expirePendingInvites(now);

    return Array.from(this.invites.values())
      .filter(
        (invite) =>
          invite.status === 'pending' &&
          (invite.inviterUserId === userId || invite.targetUserId === userId),
      )
      .map((invite) => ({ ...invite }));
  }

  listActiveForUser(userId: string, now: string): MatchInviteRecord[] {
    this.expirePendingInvites(now);

    return Array.from(this.invites.values())
      .filter(
        (invite) =>
          (invite.inviterUserId === userId || invite.targetUserId === userId) &&
          (invite.status === 'pending' || invite.status === 'accepted'),
      )
      .map((invite) => ({ ...invite }));
  }

  private expirePendingInvites(now: string): void {
    for (const invite of this.invites.values()) {
      this.expireInviteIfNeeded(invite, now);
    }
  }

  private expireInviteIfNeeded(invite: MatchInviteRecord, now: string): void {
    if (
      (invite.status === 'pending' || invite.status === 'accepted') &&
      isExpired(invite, now)
    ) {
      invite.status = 'expired';
      invite.updatedAt = now;
    }
  }
}
