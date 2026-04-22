import { PoolClient } from 'pg';
import { pool } from '../config/database';
import { CursorPage, FriendRecordDto, FriendRequestRecordDto, FriendRequestStatus } from '../types';

type UserLookupRecord = {
  id: string;
  username: string;
};

type FriendCursor = {
  createdAt: string;
  id: string;
};

type FriendRequestRow = {
  id: string;
  sender_user_id: string;
  sender_username: string;
  receiver_user_id: string;
  receiver_username: string;
  status: FriendRequestStatus;
  created_at: Date;
  updated_at: Date;
};

let schemaReady: Promise<void> | null = null;

const ensureFriendSchema = async (): Promise<void> => {
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
    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      receiver_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (sender_user_id <> receiver_user_id),
      CHECK (user_low_id < user_high_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_user_id
    ON friend_requests(sender_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_user_id
    ON friend_requests(receiver_user_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_friend_requests_pair
    ON friend_requests(user_low_id, user_high_id)
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair
    ON friend_requests(user_low_id, user_high_id)
    WHERE status = 'pending'
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (user_low_id < user_high_id),
      UNIQUE (user_low_id, user_high_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_friendships_user_low_id
    ON friendships(user_low_id)
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_friendships_user_high_id
    ON friendships(user_high_id)
  `);
};

const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = ensureFriendSchema();
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

const mapFriendRequestRow = (row: FriendRequestRow): FriendRequestRecordDto => ({
  id: row.id,
  senderUserId: row.sender_user_id,
  senderUsername: row.sender_username,
  receiverUserId: row.receiver_user_id,
  receiverUsername: row.receiver_username,
  status: row.status,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const encodeCursor = (cursor: FriendCursor): string =>
  Buffer.from(JSON.stringify(cursor), 'utf-8').toString('base64url');

const decodeCursor = (cursor: string): FriendCursor | null => {
  try {
    const raw = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf-8')) as unknown;
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const parsed = raw as Record<string, unknown>;
    if (typeof parsed.createdAt !== 'string' || typeof parsed.id !== 'string') {
      return null;
    }

    return {
      createdAt: parsed.createdAt,
      id: parsed.id,
    };
  } catch {
    return null;
  }
};

const clampLimit = (limit: number): number => Math.max(1, Math.min(limit, 100));

export const toCanonicalPair = (leftUserId: string, rightUserId: string): { userLowId: string; userHighId: string } =>
  leftUserId.localeCompare(rightUserId, 'en') < 0
    ? { userLowId: leftUserId, userHighId: rightUserId }
    : { userLowId: rightUserId, userHighId: leftUserId };

export const friendModel = {
  async findUserByUsername(username: string): Promise<UserLookupRecord | null> {
    await ensureSchema();
    const result = await pool.query<UserLookupRecord>(
      `
        SELECT id, username
        FROM users
        WHERE lower(username) = lower($1)
        LIMIT 1
      `,
      [username],
    );

    return result.rows[0] ?? null;
  },

  async findFriendshipByPair(userLowId: string, userHighId: string): Promise<boolean> {
    await ensureSchema();
    const result = await pool.query(
      `
        SELECT 1
        FROM friendships
        WHERE user_low_id = $1 AND user_high_id = $2
        LIMIT 1
      `,
      [userLowId, userHighId],
    );

    return (result.rowCount ?? 0) > 0;
  },

  async findPendingRequestBetweenPair(userLowId: string, userHighId: string): Promise<FriendRequestRecordDto | null> {
    await ensureSchema();
    const result = await pool.query<FriendRequestRow>(
      `
        SELECT
          fr.id,
          fr.sender_user_id,
          sender.username AS sender_username,
          fr.receiver_user_id,
          receiver.username AS receiver_username,
          fr.status,
          fr.created_at,
          fr.updated_at
        FROM friend_requests fr
        INNER JOIN users sender ON sender.id = fr.sender_user_id
        INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
        WHERE fr.user_low_id = $1
          AND fr.user_high_id = $2
          AND fr.status = 'pending'
        LIMIT 1
      `,
      [userLowId, userHighId],
    );

    return result.rows[0] ? mapFriendRequestRow(result.rows[0]) : null;
  },

  async createFriendRequest(params: {
    id: string;
    senderUserId: string;
    receiverUserId: string;
    userLowId: string;
    userHighId: string;
  }): Promise<FriendRequestRecordDto> {
    return withClient(async (client) => {
      await client.query(
        `
          INSERT INTO friend_requests (id, sender_user_id, receiver_user_id, user_low_id, user_high_id, status)
          VALUES ($1, $2, $3, $4, $5, 'pending')
        `,
        [params.id, params.senderUserId, params.receiverUserId, params.userLowId, params.userHighId],
      );

      const created = await client.query<FriendRequestRow>(
        `
          SELECT
            fr.id,
            fr.sender_user_id,
            sender.username AS sender_username,
            fr.receiver_user_id,
            receiver.username AS receiver_username,
            fr.status,
            fr.created_at,
            fr.updated_at
          FROM friend_requests fr
          INNER JOIN users sender ON sender.id = fr.sender_user_id
          INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
          WHERE fr.id = $1
          LIMIT 1
        `,
        [params.id],
      );

      if (!created.rows[0]) {
        throw new Error('Не удалось создать заявку в друзья');
      }

      return mapFriendRequestRow(created.rows[0]);
    });
  },

  async findRequestById(requestId: string): Promise<FriendRequestRecordDto | null> {
    await ensureSchema();
    const result = await pool.query<FriendRequestRow>(
      `
        SELECT
          fr.id,
          fr.sender_user_id,
          sender.username AS sender_username,
          fr.receiver_user_id,
          receiver.username AS receiver_username,
          fr.status,
          fr.created_at,
          fr.updated_at
        FROM friend_requests fr
        INNER JOIN users sender ON sender.id = fr.sender_user_id
        INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
        WHERE fr.id = $1
        LIMIT 1
      `,
      [requestId],
    );

    return result.rows[0] ? mapFriendRequestRow(result.rows[0]) : null;
  },

  async updateRequestStatus(params: {
    requestId: string;
    status: Extract<FriendRequestStatus, 'declined' | 'cancelled'>;
  }): Promise<FriendRequestRecordDto | null> {
    await ensureSchema();
    const result = await pool.query<FriendRequestRow>(
      `
        UPDATE friend_requests fr
        SET status = $2,
            updated_at = CURRENT_TIMESTAMP
        FROM users sender, users receiver
        WHERE fr.id = $1
          AND sender.id = fr.sender_user_id
          AND receiver.id = fr.receiver_user_id
        RETURNING
          fr.id,
          fr.sender_user_id,
          sender.username AS sender_username,
          fr.receiver_user_id,
          receiver.username AS receiver_username,
          fr.status,
          fr.created_at,
          fr.updated_at
      `,
      [params.requestId, params.status],
    );

    return result.rows[0] ? mapFriendRequestRow(result.rows[0]) : null;
  },

  async acceptRequest(params: {
    requestId: string;
    friendshipId: string;
    actorUserId: string;
  }): Promise<
    | { ok: true; request: FriendRequestRecordDto }
    | { ok: false; reason: 'request_not_found' | 'forbidden' | 'request_not_pending' | 'already_friends' }
  > {
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const requestResult = await client.query<
          FriendRequestRow & { user_low_id: string; user_high_id: string }
        >(
          `
            SELECT
              fr.id,
              fr.sender_user_id,
              sender.username AS sender_username,
              fr.receiver_user_id,
              receiver.username AS receiver_username,
              fr.user_low_id,
              fr.user_high_id,
              fr.status,
              fr.created_at,
              fr.updated_at
            FROM friend_requests fr
            INNER JOIN users sender ON sender.id = fr.sender_user_id
            INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
            WHERE fr.id = $1
            FOR UPDATE
          `,
          [params.requestId],
        );

        const request = requestResult.rows[0];
        if (!request) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'request_not_found' };
        }

        if (request.receiver_user_id !== params.actorUserId) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'forbidden' };
        }

        if (request.status !== 'pending') {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'request_not_pending' };
        }

        const friendshipExists = await client.query(
          `
            SELECT 1
            FROM friendships
            WHERE user_low_id = $1 AND user_high_id = $2
            LIMIT 1
          `,
          [request.user_low_id, request.user_high_id],
        );

        if ((friendshipExists.rowCount ?? 0) > 0) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'already_friends' };
        }

        const updateResult = await client.query<FriendRequestRow>(
          `
            UPDATE friend_requests fr
            SET status = 'accepted',
                updated_at = CURRENT_TIMESTAMP
            FROM users sender, users receiver
            WHERE fr.id = $1
              AND fr.status = 'pending'
              AND sender.id = fr.sender_user_id
              AND receiver.id = fr.receiver_user_id
            RETURNING
              fr.id,
              fr.sender_user_id,
              sender.username AS sender_username,
              fr.receiver_user_id,
              receiver.username AS receiver_username,
              fr.status,
              fr.created_at,
              fr.updated_at
          `,
          [params.requestId],
        );

        if (!updateResult.rows[0]) {
          await client.query('ROLLBACK');
          return { ok: false, reason: 'request_not_pending' };
        }

        await client.query(
          `
            INSERT INTO friendships (id, user_low_id, user_high_id)
            VALUES ($1, $2, $3)
          `,
          [params.friendshipId, request.user_low_id, request.user_high_id],
        );

        await client.query('COMMIT');
        return {
          ok: true,
          request: mapFriendRequestRow(updateResult.rows[0]),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  },

  async deleteFriendship(userLowId: string, userHighId: string): Promise<boolean> {
    await ensureSchema();
    const result = await pool.query(
      `
        DELETE FROM friendships
        WHERE user_low_id = $1 AND user_high_id = $2
      `,
      [userLowId, userHighId],
    );

    return (result.rowCount ?? 0) > 0;
  },

  async listFriends(params: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRecordDto>> {
    return withClient(async (client) => {
      const limit = clampLimit(params.limit);
      const cursor = params.cursor ? decodeCursor(params.cursor) : null;
      const values: Array<string | Date | number> = [params.userId];
      let cursorClause = '';

      if (cursor) {
        values.push(new Date(cursor.createdAt), cursor.id);
        cursorClause = `
          AND (
            f.created_at < $2
            OR (f.created_at = $2 AND f.id < $3)
          )
        `;
      }

      values.push(limit + 1);
      const limitParam = values.length;

      const result = await client.query<{
        id: string;
        created_at: Date;
        friend_user_id: string;
        friend_username: string;
      }>(
        `
          SELECT
            f.id,
            f.created_at,
            friend_user.id AS friend_user_id,
            friend_user.username AS friend_username
          FROM friendships f
          INNER JOIN users friend_user
            ON friend_user.id = CASE
              WHEN f.user_low_id = $1 THEN f.user_high_id
              ELSE f.user_low_id
            END
          WHERE (f.user_low_id = $1 OR f.user_high_id = $1)
            ${cursorClause}
          ORDER BY f.created_at DESC, f.id DESC
          LIMIT $${limitParam}
        `,
        values,
      );

      const items = result.rows.slice(0, limit).map((row) => ({
        userId: row.friend_user_id,
        username: row.friend_username,
        createdAt: row.created_at.toISOString(),
      }));
      const nextRow = result.rows[limit];

      return {
        items,
        nextCursor: nextRow
          ? encodeCursor({ createdAt: nextRow.created_at.toISOString(), id: nextRow.id })
          : null,
      };
    });
  },

  async listIncomingRequests(params: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRequestRecordDto>> {
    return withClient(async (client) => {
      const limit = clampLimit(params.limit);
      const cursor = params.cursor ? decodeCursor(params.cursor) : null;
      const values: Array<string | Date | number> = [params.userId];
      let cursorClause = '';

      if (cursor) {
        values.push(new Date(cursor.createdAt), cursor.id);
        cursorClause = `
          AND (
            fr.created_at < $2
            OR (fr.created_at = $2 AND fr.id < $3)
          )
        `;
      }

      values.push(limit + 1);
      const limitParam = values.length;

      const result = await client.query<FriendRequestRow>(
        `
          SELECT
            fr.id,
            fr.sender_user_id,
            sender.username AS sender_username,
            fr.receiver_user_id,
            receiver.username AS receiver_username,
            fr.status,
            fr.created_at,
            fr.updated_at
          FROM friend_requests fr
          INNER JOIN users sender ON sender.id = fr.sender_user_id
          INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
          WHERE fr.receiver_user_id = $1
            AND fr.status = 'pending'
            ${cursorClause}
          ORDER BY fr.created_at DESC, fr.id DESC
          LIMIT $${limitParam}
        `,
        values,
      );

      const items = result.rows.slice(0, limit).map(mapFriendRequestRow);
      const nextRow = result.rows[limit];

      return {
        items,
        nextCursor: nextRow
          ? encodeCursor({ createdAt: nextRow.created_at.toISOString(), id: nextRow.id })
          : null,
      };
    });
  },

  async listOutgoingRequests(params: {
    userId: string;
    limit: number;
    cursor?: string;
  }): Promise<CursorPage<FriendRequestRecordDto>> {
    return withClient(async (client) => {
      const limit = clampLimit(params.limit);
      const cursor = params.cursor ? decodeCursor(params.cursor) : null;
      const values: Array<string | Date | number> = [params.userId];
      let cursorClause = '';

      if (cursor) {
        values.push(new Date(cursor.createdAt), cursor.id);
        cursorClause = `
          AND (
            fr.created_at < $2
            OR (fr.created_at = $2 AND fr.id < $3)
          )
        `;
      }

      values.push(limit + 1);
      const limitParam = values.length;

      const result = await client.query<FriendRequestRow>(
        `
          SELECT
            fr.id,
            fr.sender_user_id,
            sender.username AS sender_username,
            fr.receiver_user_id,
            receiver.username AS receiver_username,
            fr.status,
            fr.created_at,
            fr.updated_at
          FROM friend_requests fr
          INNER JOIN users sender ON sender.id = fr.sender_user_id
          INNER JOIN users receiver ON receiver.id = fr.receiver_user_id
          WHERE fr.sender_user_id = $1
            AND fr.status = 'pending'
            ${cursorClause}
          ORDER BY fr.created_at DESC, fr.id DESC
          LIMIT $${limitParam}
        `,
        values,
      );

      const items = result.rows.slice(0, limit).map(mapFriendRequestRow);
      const nextRow = result.rows[limit];

      return {
        items,
        nextCursor: nextRow
          ? encodeCursor({ createdAt: nextRow.created_at.toISOString(), id: nextRow.id })
          : null,
      };
    });
  },
};
