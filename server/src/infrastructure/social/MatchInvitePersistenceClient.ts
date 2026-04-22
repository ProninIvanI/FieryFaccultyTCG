import type { MatchInviteRecord } from '../../domain/social/MatchInviteRegistry';

type MatchInviteListResponse = {
  success: boolean;
  data?: {
    invites?: MatchInviteRecord[];
  };
};

type MatchInviteResponse = {
  success: boolean;
  data?: {
    invite?: MatchInviteRecord;
  };
};

const DEFAULT_BACKEND_URL = process.env.BACKEND_API_URL ?? 'http://localhost:3001';
const DEFAULT_INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN ?? 'dev-internal-token';

export interface MatchInvitePersistenceClientLike {
  listActiveInvitesForUser(userId: string, now: string): Promise<MatchInviteRecord[]>;
  saveInvite(invite: MatchInviteRecord): Promise<void>;
}

export class HttpMatchInvitePersistenceClient
  implements MatchInvitePersistenceClientLike
{
  async listActiveInvitesForUser(
    userId: string,
    now: string,
  ): Promise<MatchInviteRecord[]> {
    const searchParams = new URLSearchParams({
      userId,
      now,
    });
    const response = await fetch(
      `${DEFAULT_BACKEND_URL}/api/internal/social/invites?${searchParams.toString()}`,
      {
        method: 'GET',
        headers: {
          'x-internal-token': DEFAULT_INTERNAL_TOKEN,
        },
      },
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as MatchInviteListResponse;
    return Array.isArray(payload.data?.invites) ? payload.data.invites : [];
  }

  async saveInvite(invite: MatchInviteRecord): Promise<void> {
    const response = await fetch(
      `${DEFAULT_BACKEND_URL}/api/internal/social/invites/${encodeURIComponent(invite.id)}`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': DEFAULT_INTERNAL_TOKEN,
        },
        body: JSON.stringify(invite),
      },
    );

    if (!response.ok) {
      throw new Error(`Invite persistence request failed: ${response.status}`);
    }

    await response.json() as MatchInviteResponse;
  }
}

export class NoopMatchInvitePersistenceClient
  implements MatchInvitePersistenceClientLike
{
  async listActiveInvitesForUser(): Promise<MatchInviteRecord[]> {
    return [];
  }

  async saveInvite(_invite: MatchInviteRecord): Promise<void> {}
}
