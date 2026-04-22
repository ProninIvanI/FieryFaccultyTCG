import type { MatchInviteRecordDto, UpsertMatchInviteInput } from '../types';
import { matchInviteModel } from '../models/matchInviteModel';

type MatchInviteServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const isNonEmptyString = (value: string | undefined): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoDate = (value: string | undefined): value is string =>
  isNonEmptyString(value) && !Number.isNaN(Date.parse(value));

const isValidStatus = (value: string): value is MatchInviteRecordDto['status'] =>
  ['pending', 'accepted', 'consumed', 'declined', 'cancelled', 'expired'].includes(value);

export class MatchInviteService {
  async upsertInvite(
    input: UpsertMatchInviteInput,
  ): Promise<MatchInviteServiceResult<MatchInviteRecordDto>> {
    if (
      !isNonEmptyString(input.id) ||
      !isNonEmptyString(input.inviterUserId) ||
      !isNonEmptyString(input.targetUserId) ||
      !isValidStatus(input.status) ||
      !isIsoDate(input.createdAt) ||
      !isIsoDate(input.updatedAt) ||
      !isIsoDate(input.expiresAt)
    ) {
      return { ok: false, error: 'Некорректный payload invite' };
    }

    const invite = await matchInviteModel.upsertInvite(input);
    return { ok: true, data: invite };
  }

  async listActiveInvitesForUser(
    userId: string,
    now: string,
  ): Promise<MatchInviteServiceResult<MatchInviteRecordDto[]>> {
    if (!isNonEmptyString(userId) || !isIsoDate(now)) {
      return { ok: false, error: 'Некорректные параметры invite query' };
    }

    const invites = await matchInviteModel.listActiveInvitesForUser(userId, now);
    return { ok: true, data: invites };
  }
}
