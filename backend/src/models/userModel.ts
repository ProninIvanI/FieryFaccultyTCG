import { pool } from '../config/database';

export type UserRecord = {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUser = {
  id: string;
  email: string;
  username: string;
  createdAt: string;
};

let schemaReady: Promise<void> | null = null;

const ensureAuthSchema = async (): Promise<void> => {
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
    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id
    ON auth_sessions(user_id)
  `);
};

const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = ensureAuthSchema();
  }
  await schemaReady;
};

const mapUserRecord = (row: {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
}): UserRecord => ({
  id: row.id,
  email: row.email,
  username: row.username,
  passwordHash: row.password_hash,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export const toPublicUser = (user: UserRecord): PublicUser => ({
  id: user.id,
  email: user.email,
  username: user.username,
  createdAt: user.createdAt,
});

export const userModel = {
  async findByEmail(email: string): Promise<UserRecord | null> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        SELECT id, email, username, password_hash, created_at, updated_at
        FROM users
        WHERE lower(email) = lower($1)
        LIMIT 1
      `,
      [email],
    );

    return result.rows[0] ? mapUserRecord(result.rows[0]) : null;
  },

  async findByUsername(username: string): Promise<UserRecord | null> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        SELECT id, email, username, password_hash, created_at, updated_at
        FROM users
        WHERE lower(username) = lower($1)
        LIMIT 1
      `,
      [username],
    );

    return result.rows[0] ? mapUserRecord(result.rows[0]) : null;
  },

  async findBySessionTokenHash(tokenHash: string): Promise<UserRecord | null> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        SELECT u.id, u.email, u.username, u.password_hash, u.created_at, u.updated_at
        FROM auth_sessions s
        INNER JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = $1
        LIMIT 1
      `,
      [tokenHash],
    );

    return result.rows[0] ? mapUserRecord(result.rows[0]) : null;
  },

  async create(params: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
  }): Promise<UserRecord> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      email: string;
      username: string;
      password_hash: string;
      created_at: Date;
      updated_at: Date;
    }>(
      `
        INSERT INTO users (id, email, username, password_hash)
        VALUES ($1, $2, $3, $4)
        RETURNING id, email, username, password_hash, created_at, updated_at
      `,
      [params.id, params.email, params.username, params.passwordHash],
    );

    return mapUserRecord(result.rows[0]);
  },

  async createSession(params: {
    id: string;
    userId: string;
    tokenHash: string;
  }): Promise<{ id: string; userId: string; createdAt: string }> {
    await ensureSchema();
    const result = await pool.query<{
      id: string;
      user_id: string;
      created_at: Date;
    }>(
      `
        INSERT INTO auth_sessions (id, user_id, token_hash)
        VALUES ($1, $2, $3)
        RETURNING id, user_id, created_at
      `,
      [params.id, params.userId, params.tokenHash],
    );

    const row = result.rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: row.created_at.toISOString(),
    };
  },
};
