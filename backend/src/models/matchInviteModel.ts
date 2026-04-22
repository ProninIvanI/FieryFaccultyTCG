import { pool } from '../config/database';
import type { MatchInviteRecordDto, UpsertMatchInviteInput } from '../types';

let schemaReady: Promise<void> | null = null;

const ensureMatchInviteSchema = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      username VARCHAR(64) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_invites (
      id TEXT PRIMARY KEY,
      inviter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      inviter_username VARCHAR(64),
      target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'consumed', 'declined', 'cancelled', 'expired')),
      session_id TEXT,
      seed INTEGER,
      created_at TIMESTAMPTZ NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL,
      CHECK (inviter_user_id <> target_user_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_invites_inviter_user_id
    ON match_invites(inviter_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_invites_target_user_id
    ON match_invites(target_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_invites_status
    ON match_invites(status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_invites_updated_at
    ON match_invites(updated_at DESC)
  `);
};

const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = ensureMatchInviteSchema();
  }

  await schemaReady;
};

const mapRow = (row: {
  id: string;
  inviter_user_id: string;
  inviter_username: string | null;
  target_user_id: string;
  status: MatchInviteRecordDto['status'];
  session_id: string | null;
  seed: number | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
}): MatchInviteRecordDto => ({
  id: row.id,
  inviterUserId: row.inviter_user_id,
  inviterUsername: row.inviter_username ?? undefined,
  targetUserId: row.target_user_id,
  status: row.status,
  sessionId: row.session_id ?? undefined,
  seed: row.seed ?? undefined,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  expiresAt: row.expires_at.toISOString(),
});

export const matchInviteModel = {
  async upsertInvite(input: UpsertMatchInviteInput): Promise<MatchInviteRecordDto> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      inviter_user_id: string;
      inviter_username: string | null;
      target_user_id: string;
      status: MatchInviteRecordDto['status'];
      session_id: string | null;
      seed: number | null;
      created_at: Date;
      updated_at: Date;
      expires_at: Date;
    }>(
      `
        INSERT INTO match_invites (
          id,
          inviter_user_id,
          inviter_username,
          target_user_id,
          status,
          session_id,
          seed,
          created_at,
          updated_at,
          expires_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id)
        DO UPDATE SET
          inviter_user_id = EXCLUDED.inviter_user_id,
          inviter_username = EXCLUDED.inviter_username,
          target_user_id = EXCLUDED.target_user_id,
          status = EXCLUDED.status,
          session_id = EXCLUDED.session_id,
          seed = EXCLUDED.seed,
          created_at = EXCLUDED.created_at,
          updated_at = EXCLUDED.updated_at,
          expires_at = EXCLUDED.expires_at
        RETURNING
          id,
          inviter_user_id,
          inviter_username,
          target_user_id,
          status,
          session_id,
          seed,
          created_at,
          updated_at,
          expires_at
      `,
      [
        input.id,
        input.inviterUserId,
        input.inviterUsername ?? null,
        input.targetUserId,
        input.status,
        input.sessionId ?? null,
        input.seed ?? null,
        input.createdAt,
        input.updatedAt,
        input.expiresAt,
      ],
    );

    return mapRow(result.rows[0]);
  },

  async expirePendingInvites(now: string): Promise<void> {
    await ensureSchema();
    await pool.query(
      `
        UPDATE match_invites
        SET status = 'expired',
            updated_at = $2::timestamptz
        WHERE status = 'pending'
          AND expires_at <= $1::timestamptz
      `,
      [now, now],
    );
  },

  async listActiveInvitesForUser(userId: string, now: string): Promise<MatchInviteRecordDto[]> {
    await ensureSchema();
    await this.expirePendingInvites(now);

    const result = await pool.query<{
      id: string;
      inviter_user_id: string;
      inviter_username: string | null;
      target_user_id: string;
      status: MatchInviteRecordDto['status'];
      session_id: string | null;
      seed: number | null;
      created_at: Date;
      updated_at: Date;
      expires_at: Date;
    }>(
      `
        SELECT
          id,
          inviter_user_id,
          inviter_username,
          target_user_id,
          status,
          session_id,
          seed,
          created_at,
          updated_at,
          expires_at
        FROM match_invites
        WHERE (inviter_user_id = $1 OR target_user_id = $1)
          AND status IN ('pending', 'accepted')
        ORDER BY updated_at DESC, created_at DESC
      `,
      [userId],
    );

    return result.rows.map(mapRow);
  },
};
