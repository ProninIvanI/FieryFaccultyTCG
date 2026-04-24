import { PoolClient } from 'pg';
import { pool } from '../config/database';
import type {
  CompleteMatchInput,
  CreateMatchRecordInput,
  MatchPlayerRecord,
  MatchRecord,
  MatchReplayRecord,
  MatchSummary,
  SaveMatchReplayInput,
} from '../types';

let schemaReady: Promise<void> | null = null;

const ensureMatchSchema = async (): Promise<void> => {
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
    CREATE TABLE IF NOT EXISTS decks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(128) NOT NULL,
      character_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_decks_user_id
    ON decks(user_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS matches (
      id TEXT PRIMARY KEY,
      match_id TEXT UNIQUE NOT NULL,
      status VARCHAR(32) NOT NULL CHECK (status IN ('pending', 'active', 'finished', 'aborted')),
      created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      winner_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      seed BIGINT NOT NULL,
      game_core_version VARCHAR(64) NOT NULL,
      rules_version VARCHAR(64) NOT NULL,
      end_reason VARCHAR(32),
      start_state_json JSONB NOT NULL,
      final_state_json JSONB,
      turn_count INTEGER NOT NULL DEFAULT 0 CHECK (turn_count >= 0),
      action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0),
      last_applied_action_at TIMESTAMPTZ,
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_status
    ON matches(status)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_created_by_user_id
    ON matches(created_by_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_winner_user_id
    ON matches(winner_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_matches_started_at
    ON matches(started_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_players (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      player_slot INTEGER NOT NULL CHECK (player_slot > 0),
      player_id_in_match TEXT NOT NULL,
      deck_id TEXT REFERENCES decks(id) ON DELETE SET NULL,
      deck_name_snapshot VARCHAR(128),
      deck_snapshot_json JSONB,
      is_winner BOOLEAN NOT NULL DEFAULT FALSE,
      finish_result VARCHAR(32) NOT NULL CHECK (finish_result IN ('pending', 'win', 'loss', 'draw', 'abandoned')),
      connected_at TIMESTAMPTZ,
      disconnected_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (match_id, player_slot),
      UNIQUE (match_id, player_id_in_match),
      UNIQUE (match_id, user_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_players_match_id
    ON match_players(match_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_players_user_id
    ON match_players(user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_match_players_deck_id
    ON match_players(deck_id)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_replays (
      id TEXT PRIMARY KEY,
      match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
      format_version VARCHAR(32) NOT NULL,
      initial_context_json JSONB NOT NULL,
      command_log_json JSONB NOT NULL,
      checkpoints_json JSONB,
      final_hash TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = ensureMatchSchema();
  }

  await schemaReady;
};

const withClient = async <T>(callback: (client: PoolClient) => Promise<T>): Promise<T> => {
  await ensureSchema();
  const client = await pool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
};

const toIsoString = (value: Date | null): string | null => (value ? value.toISOString() : null);

const mapMatchPlayerRow = (row: {
  id: string;
  match_id: string;
  user_id: string;
  username: string | null;
  player_slot: number;
  player_id_in_match: string;
  deck_id: string | null;
  deck_name_snapshot: string | null;
  deck_snapshot_json: unknown | null;
  is_winner: boolean;
  finish_result: MatchPlayerRecord['finishResult'];
  connected_at: Date | null;
  disconnected_at: Date | null;
  created_at: Date;
}): MatchPlayerRecord => ({
  id: row.id,
  matchId: row.match_id,
  userId: row.user_id,
  username: row.username ?? undefined,
  playerSlot: row.player_slot,
  playerIdInMatch: row.player_id_in_match,
  deckId: row.deck_id,
  deckNameSnapshot: row.deck_name_snapshot,
  deckSnapshot: row.deck_snapshot_json,
  isWinner: row.is_winner,
  finishResult: row.finish_result,
  connectedAt: toIsoString(row.connected_at),
  disconnectedAt: toIsoString(row.disconnected_at),
  createdAt: row.created_at.toISOString(),
});

const mapMatchReplayRow = (row: {
  id: string;
  match_id: string;
  format_version: string;
  initial_context_json: unknown;
  command_log_json: unknown;
  checkpoints_json: unknown | null;
  final_hash: string | null;
  created_at: Date;
}): MatchReplayRecord => ({
  id: row.id,
  matchId: row.match_id,
  formatVersion: row.format_version,
  initialContext: row.initial_context_json,
  commandLog: row.command_log_json,
  checkpoints: row.checkpoints_json,
  finalHash: row.final_hash,
  createdAt: row.created_at.toISOString(),
});

const mapMatchRow = (
  row: {
    id: string;
    match_id: string;
    status: MatchRecord['status'];
    created_by_user_id: string | null;
    winner_user_id: string | null;
    seed: string;
    game_core_version: string;
    rules_version: string;
    end_reason: MatchRecord['endReason'];
    start_state_json: unknown;
    final_state_json: unknown | null;
    turn_count: number;
    action_count: number;
    last_applied_action_at: Date | null;
    started_at: Date | null;
    finished_at: Date | null;
    created_at: Date;
    updated_at: Date;
  },
  players: MatchPlayerRecord[],
): MatchRecord => ({
  id: row.id,
  matchId: row.match_id,
  status: row.status,
  createdByUserId: row.created_by_user_id,
  winnerUserId: row.winner_user_id,
  seed: row.seed,
  gameCoreVersion: row.game_core_version,
  rulesVersion: row.rules_version,
  endReason: row.end_reason,
  startState: row.start_state_json,
  finalState: row.final_state_json,
  turnCount: row.turn_count,
  actionCount: row.action_count,
  lastAppliedActionAt: toIsoString(row.last_applied_action_at),
  startedAt: toIsoString(row.started_at),
  finishedAt: toIsoString(row.finished_at),
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
  players,
});

const loadPlayersByMatchIds = async (
  client: PoolClient,
  matchIds: string[],
): Promise<Map<string, MatchPlayerRecord[]>> => {
  if (matchIds.length === 0) {
    return new Map();
  }

  const result = await client.query<{
    id: string;
    match_id: string;
    user_id: string;
    username: string | null;
    player_slot: number;
    player_id_in_match: string;
    deck_id: string | null;
    deck_name_snapshot: string | null;
    deck_snapshot_json: unknown | null;
    is_winner: boolean;
    finish_result: MatchPlayerRecord['finishResult'];
    connected_at: Date | null;
    disconnected_at: Date | null;
    created_at: Date;
  }>(
    `
      SELECT
        mp.id,
        mp.match_id,
        mp.user_id,
        u.username,
        mp.player_slot,
        mp.player_id_in_match,
        mp.deck_id,
        mp.deck_name_snapshot,
        mp.deck_snapshot_json,
        mp.is_winner,
        mp.finish_result,
        mp.connected_at,
        mp.disconnected_at,
        mp.created_at
      FROM match_players mp
      LEFT JOIN users u ON u.id = mp.user_id
      WHERE mp.match_id = ANY($1::text[])
      ORDER BY match_id, player_slot
    `,
    [matchIds],
  );

  const playersByMatchId = new Map<string, MatchPlayerRecord[]>();
  result.rows.forEach((row) => {
    const players = playersByMatchId.get(row.match_id) ?? [];
    players.push(mapMatchPlayerRow(row));
    playersByMatchId.set(row.match_id, players);
  });

  return playersByMatchId;
};

type MatchDbRow = {
  id: string;
  match_id: string;
  status: MatchRecord['status'];
  created_by_user_id: string | null;
  winner_user_id: string | null;
  seed: string;
  game_core_version: string;
  rules_version: string;
  end_reason: MatchRecord['endReason'];
  start_state_json: unknown;
  final_state_json: unknown | null;
  turn_count: number;
  action_count: number;
  last_applied_action_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export const matchModel = {
  async createMatch(input: CreateMatchRecordInput): Promise<MatchRecord> {
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `
            INSERT INTO matches (
              id,
              match_id,
              status,
              created_by_user_id,
              seed,
              game_core_version,
              rules_version,
              start_state_json,
              last_applied_action_at,
              started_at
            )
            VALUES ($1, $2, $3, $4, $5::bigint, $6, $7, $8::jsonb, $9, $10)
          `,
          [
            input.id,
            input.matchId,
            input.status,
            input.createdByUserId,
            input.seed,
            input.gameCoreVersion,
            input.rulesVersion,
            JSON.stringify(input.startState),
            input.lastAppliedActionAt ?? null,
            input.startedAt ?? null,
          ],
        );

        for (const player of input.players) {
          await client.query(
            `
              INSERT INTO match_players (
                id,
                match_id,
                user_id,
                player_slot,
                player_id_in_match,
                deck_id,
                deck_name_snapshot,
                deck_snapshot_json,
                connected_at
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
            `,
            [
              player.id,
              input.id,
              player.userId,
              player.playerSlot,
              player.playerIdInMatch,
              player.deckId,
              player.deckNameSnapshot ?? null,
              player.deckSnapshot === undefined ? null : JSON.stringify(player.deckSnapshot),
              player.connectedAt ?? null,
            ],
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      const created = await matchModel.findById(input.id);
      if (!created) {
        throw new Error('Не удалось создать запись матча');
      }

      return created;
    });
  },

  async findById(id: string): Promise<MatchRecord | null> {
    return withClient(async (client) => {
      const result = await client.query<MatchDbRow>(
        `
          SELECT
            id,
            match_id,
            status,
            created_by_user_id,
            winner_user_id,
            seed::text AS seed,
            game_core_version,
            rules_version,
            end_reason,
            start_state_json,
            final_state_json,
            turn_count,
            action_count,
            last_applied_action_at,
            started_at,
            finished_at,
            created_at,
            updated_at
          FROM matches
          WHERE id = $1
          LIMIT 1
        `,
        [id],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const playersByMatchId = await loadPlayersByMatchIds(client, [row.id]);
      return mapMatchRow(row, playersByMatchId.get(row.id) ?? []);
    });
  },

  async findByPublicMatchId(matchId: string): Promise<MatchRecord | null> {
    return withClient(async (client) => {
      const result = await client.query<MatchDbRow>(
        `
          SELECT
            id,
            match_id,
            status,
            created_by_user_id,
            winner_user_id,
            seed::text AS seed,
            game_core_version,
            rules_version,
            end_reason,
            start_state_json,
            final_state_json,
            turn_count,
            action_count,
            last_applied_action_at,
            started_at,
            finished_at,
            created_at,
            updated_at
          FROM matches
          WHERE match_id = $1
          LIMIT 1
        `,
        [matchId],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const playersByMatchId = await loadPlayersByMatchIds(client, [row.id]);
      return mapMatchRow(row, playersByMatchId.get(row.id) ?? []);
    });
  },

  async listByUserId(userId: string): Promise<MatchSummary[]> {
    return withClient(async (client) => {
      const result = await client.query<MatchDbRow>(
        `
          SELECT
            m.id,
            m.match_id,
            m.status,
            m.created_by_user_id,
            m.winner_user_id,
            m.seed::text AS seed,
            m.game_core_version,
            m.rules_version,
            m.end_reason,
            m.start_state_json,
            m.final_state_json,
            m.turn_count,
            m.action_count,
            m.last_applied_action_at,
            m.started_at,
            m.finished_at,
            m.created_at,
            m.updated_at
          FROM matches m
          INNER JOIN match_players mp ON mp.match_id = m.id
          WHERE mp.user_id = $1
          ORDER BY COALESCE(m.finished_at, m.started_at, m.created_at) DESC, m.created_at DESC
        `,
        [userId],
      );

      const matchIds = result.rows.map((row) => row.id);
      const playersByMatchId = await loadPlayersByMatchIds(client, matchIds);

      return result.rows.map((row) => ({
        matchId: row.match_id,
        status: row.status,
        createdByUserId: row.created_by_user_id,
        winnerUserId: row.winner_user_id,
        seed: row.seed,
        gameCoreVersion: row.game_core_version,
        rulesVersion: row.rules_version,
        endReason: row.end_reason,
        turnCount: row.turn_count,
        actionCount: row.action_count,
        startedAt: toIsoString(row.started_at),
        finishedAt: toIsoString(row.finished_at),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        players: playersByMatchId.get(row.id) ?? [],
      }));
    });
  },

  async completeMatch(matchId: string, input: CompleteMatchInput): Promise<MatchRecord | null> {
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const updateResult = await client.query(
          `
            UPDATE matches
            SET status = $2,
                winner_user_id = $3,
                end_reason = $4,
                final_state_json = $5::jsonb,
                turn_count = $6,
                action_count = $7,
                finished_at = $8,
                last_applied_action_at = $9,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `,
          [
            matchId,
            input.status,
            input.winnerUserId,
            input.endReason,
            JSON.stringify(input.finalState),
            input.turnCount,
            input.actionCount,
            input.finishedAt ?? null,
            input.lastAppliedActionAt ?? null,
          ],
        );

        if ((updateResult.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK');
          return null;
        }

        for (const player of input.players) {
          await client.query(
            `
              UPDATE match_players
              SET is_winner = $3,
                  finish_result = $4,
                  disconnected_at = $5
              WHERE match_id = $1 AND user_id = $2
            `,
            [
              matchId,
              player.userId,
              player.isWinner,
              player.finishResult,
              player.disconnectedAt ?? null,
            ],
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      return matchModel.findById(matchId);
    });
  },

  async saveReplay(input: SaveMatchReplayInput): Promise<MatchReplayRecord> {
    return withClient(async (client) => {
      const result = await client.query<{
        id: string;
        match_id: string;
        format_version: string;
        initial_context_json: unknown;
        command_log_json: unknown;
        checkpoints_json: unknown | null;
        final_hash: string | null;
        created_at: Date;
      }>(
        `
          INSERT INTO match_replays (
            id,
            match_id,
            format_version,
            initial_context_json,
            command_log_json,
            checkpoints_json,
            final_hash
          )
          VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb, $7)
          ON CONFLICT (match_id)
          DO UPDATE SET
            format_version = EXCLUDED.format_version,
            initial_context_json = EXCLUDED.initial_context_json,
            command_log_json = EXCLUDED.command_log_json,
            checkpoints_json = EXCLUDED.checkpoints_json,
            final_hash = EXCLUDED.final_hash
          RETURNING
            id,
            match_id,
            format_version,
            initial_context_json,
            command_log_json,
            checkpoints_json,
            final_hash,
            created_at
        `,
        [
          input.id,
          input.matchId,
          input.formatVersion,
          JSON.stringify(input.initialContext),
          JSON.stringify(input.commandLog),
          input.checkpoints === undefined ? null : JSON.stringify(input.checkpoints),
          input.finalHash ?? null,
        ],
      );

      return mapMatchReplayRow(result.rows[0]);
    });
  },

  async findReplayByMatchId(matchId: string): Promise<MatchReplayRecord | null> {
    return withClient(async (client) => {
      const result = await client.query<{
        id: string;
        match_id: string;
        format_version: string;
        initial_context_json: unknown;
        command_log_json: unknown;
        checkpoints_json: unknown | null;
        final_hash: string | null;
        created_at: Date;
      }>(
        `
          SELECT
            id,
            match_id,
            format_version,
            initial_context_json,
            command_log_json,
            checkpoints_json,
            final_hash,
            created_at
          FROM match_replays
          WHERE match_id = $1
          LIMIT 1
        `,
        [matchId],
      );

      const row = result.rows[0];
      return row ? mapMatchReplayRow(row) : null;
    });
  },
};
