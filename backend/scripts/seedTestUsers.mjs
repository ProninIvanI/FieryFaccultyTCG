import { randomUUID, scryptSync, randomBytes } from 'node:crypto';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const DEFAULT_COUNT = 25;
const DEFAULT_PREFIX = 'friend_seed';
const DEFAULT_EMAIL_DOMAIN = 'example.test';
const DEFAULT_PASSWORD = 'FriendSeed2026!';
const DEFAULT_FRIEND_WITH = 'akela';

const getEnvString = (key, fallback) => process.env[key] || fallback;

const getEnvNumber = (key, fallback) => {
  const raw = process.env[key];
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const databaseUrl = getEnvString('DATABASE_URL', '');

const pool = new Pool(
  databaseUrl
    ? { connectionString: databaseUrl }
    : {
        user: getEnvString('POSTGRES_USER', 'postgres'),
        host: getEnvString('POSTGRES_HOST', 'localhost'),
        database: getEnvString('POSTGRES_DB', 'projectbot'),
        password: getEnvString('POSTGRES_PASSWORD', 'postgres'),
        port: getEnvNumber('POSTGRES_PORT', 5432),
      },
);

const count = Math.max(1, getEnvNumber('TEST_USERS_COUNT', DEFAULT_COUNT));
const prefix = getEnvString('TEST_USERS_PREFIX', DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
const emailDomain =
  getEnvString('TEST_USERS_EMAIL_DOMAIN', DEFAULT_EMAIL_DOMAIN).trim() || DEFAULT_EMAIL_DOMAIN;
const password = getEnvString('TEST_USERS_PASSWORD', DEFAULT_PASSWORD);
const friendWithUsername =
  getEnvString('TEST_USERS_FRIEND_WITH', DEFAULT_FRIEND_WITH).trim() || DEFAULT_FRIEND_WITH;

const hashPassword = (plainPassword) => {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(plainPassword, salt, 64).toString('hex');
  return `${salt}:${derived}`;
};

const ensureUsersSchema = async () => {
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
    CREATE TABLE IF NOT EXISTS friendships (
      id TEXT PRIMARY KEY,
      user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK (user_low_id < user_high_id),
      UNIQUE (user_low_id, user_high_id)
    )
  `);
};

const toCanonicalPair = (leftUserId, rightUserId) =>
  leftUserId.localeCompare(rightUserId, 'en') < 0
    ? { userLowId: leftUserId, userHighId: rightUserId }
    : { userLowId: rightUserId, userHighId: leftUserId };

const buildLogin = (index) => {
  const suffix = String(index + 1).padStart(2, '0');
  const username = `${prefix}_${suffix}`;
  const email = `${username}@${emailDomain}`;

  return { username, email };
};

const seedUsers = async () => {
  await ensureUsersSchema();

  const friendTargetResult = await pool.query(
    `
      SELECT id, username
      FROM users
      WHERE lower(username) = lower($1)
      LIMIT 1
    `,
    [friendWithUsername],
  );

  const friendTarget = friendTargetResult.rows[0];
  if (!friendTarget) {
    throw new Error(`Target user "${friendWithUsername}" was not found.`);
  }

  const created = [];
  const skipped = [];
  const friended = [];
  const alreadyFriended = [];

  for (let index = 0; index < count; index += 1) {
    const { username, email } = buildLogin(index);
    const passwordHash = hashPassword(password);

    const userResult = await pool.query(
      `
        INSERT INTO users (id, email, username, password_hash)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT DO NOTHING
        RETURNING id, username
      `,
      [`user_${randomUUID()}`, email, username, passwordHash],
    );

    let seededUser = userResult.rows[0];

    if ((userResult.rowCount ?? 0) > 0) {
      created.push(username);
    } else {
      skipped.push(username);
      const existingUserResult = await pool.query(
        `
          SELECT id, username
          FROM users
          WHERE lower(username) = lower($1)
          LIMIT 1
        `,
        [username],
      );
      seededUser = existingUserResult.rows[0];
    }

    if (!seededUser) {
      throw new Error(`Unable to resolve seeded user "${username}".`);
    }

    const pair = toCanonicalPair(friendTarget.id, seededUser.id);
    const friendshipResult = await pool.query(
      `
        INSERT INTO friendships (id, user_low_id, user_high_id)
        VALUES ($1, $2, $3)
        ON CONFLICT (user_low_id, user_high_id) DO NOTHING
        RETURNING id
      `,
      [`friendship_${randomUUID()}`, pair.userLowId, pair.userHighId],
    );

    if ((friendshipResult.rowCount ?? 0) > 0) {
      friended.push(username);
    } else {
      alreadyFriended.push(username);
    }
  }

  console.log(`Seeded test users: created ${created.length}, skipped ${skipped.length}.`);
  console.log(
    `Friendships for ${friendTarget.username}: created ${friended.length}, skipped ${alreadyFriended.length}.`,
  );
  console.log(`Shared password: ${password}`);
  console.log('Usernames:');

  for (let index = 0; index < count; index += 1) {
    console.log(`- ${buildLogin(index).username}`);
  }
};

try {
  await seedUsers();
} catch (error) {
  console.error('Failed to seed test users.');
  console.error(error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
