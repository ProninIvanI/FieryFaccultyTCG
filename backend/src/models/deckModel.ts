import { PoolClient } from 'pg';
import { pool } from '../config/database';

export type DeckCardRecord = {
  cardId: string;
  quantity: number;
};

export type DeckRecord = {
  id: string;
  userId: string;
  name: string;
  characterId: string | null;
  createdAt: string;
  updatedAt: string;
  cards: DeckCardRecord[];
};

let schemaReady: Promise<void> | null = null;

const ensureDeckSchema = async (): Promise<void> => {
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
    CREATE TABLE IF NOT EXISTS deck_cards (
      deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
      card_id TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      PRIMARY KEY (deck_id, card_id)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_decks_user_id
    ON decks(user_id)
  `);
};

const ensureSchema = async (): Promise<void> => {
  if (!schemaReady) {
    schemaReady = ensureDeckSchema();
  }

  await schemaReady;
};

const mapDeckBase = (row: {
  id: string;
  user_id: string;
  name: string;
  character_id: string | null;
  created_at: Date;
  updated_at: Date;
}): Omit<DeckRecord, 'cards'> => ({
  id: row.id,
  userId: row.user_id,
  name: row.name,
  characterId: row.character_id,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const loadDeckCardsByDeckIds = async (
  client: PoolClient,
  deckIds: string[],
): Promise<Map<string, DeckCardRecord[]>> => {
  if (deckIds.length === 0) {
    return new Map();
  }

  const result = await client.query<{
    deck_id: string;
    card_id: string;
    quantity: number;
  }>(
    `
      SELECT deck_id, card_id, quantity
      FROM deck_cards
      WHERE deck_id = ANY($1::text[])
      ORDER BY card_id
    `,
    [deckIds],
  );

  const cardsByDeckId = new Map<string, DeckCardRecord[]>();
  result.rows.forEach((row) => {
    const cards = cardsByDeckId.get(row.deck_id) ?? [];
    cards.push({
      cardId: row.card_id,
      quantity: row.quantity,
    });
    cardsByDeckId.set(row.deck_id, cards);
  });

  return cardsByDeckId;
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

export const deckModel = {
  async listByUserId(userId: string): Promise<DeckRecord[]> {
    return withClient(async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        name: string;
        character_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          SELECT id, user_id, name, character_id, created_at, updated_at
          FROM decks
          WHERE user_id = $1
          ORDER BY updated_at DESC, created_at DESC
        `,
        [userId],
      );

      const decks = result.rows.map(mapDeckBase);
      const cardsByDeckId = await loadDeckCardsByDeckIds(
        client,
        decks.map((deck) => deck.id),
      );

      return decks.map((deck) => ({
        ...deck,
        cards: cardsByDeckId.get(deck.id) ?? [],
      }));
    });
  },

  async findByIdAndUserId(deckId: string, userId: string): Promise<DeckRecord | null> {
    return withClient(async (client) => {
      const result = await client.query<{
        id: string;
        user_id: string;
        name: string;
        character_id: string | null;
        created_at: Date;
        updated_at: Date;
      }>(
        `
          SELECT id, user_id, name, character_id, created_at, updated_at
          FROM decks
          WHERE id = $1 AND user_id = $2
          LIMIT 1
        `,
        [deckId, userId],
      );

      const row = result.rows[0];
      if (!row) {
        return null;
      }

      const cardsByDeckId = await loadDeckCardsByDeckIds(client, [deckId]);
      return {
        ...mapDeckBase(row),
        cards: cardsByDeckId.get(deckId) ?? [],
      };
    });
  },

  async create(params: {
    id: string;
    userId: string;
    name: string;
    characterId: string | null;
    cards: DeckCardRecord[];
  }): Promise<DeckRecord> {
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        await client.query(
          `
            INSERT INTO decks (id, user_id, name, character_id)
            VALUES ($1, $2, $3, $4)
          `,
          [params.id, params.userId, params.name, params.characterId],
        );

        for (const card of params.cards) {
          await client.query(
            `
              INSERT INTO deck_cards (deck_id, card_id, quantity)
              VALUES ($1, $2, $3)
            `,
            [params.id, card.cardId, card.quantity],
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      const created = await deckModel.findByIdAndUserId(params.id, params.userId);
      if (!created) {
        throw new Error('Не удалось создать колоду');
      }

      return created;
    });
  },

  async update(params: {
    id: string;
    userId: string;
    name: string;
    characterId: string | null;
    cards: DeckCardRecord[];
  }): Promise<DeckRecord | null> {
    return withClient(async (client) => {
      await client.query('BEGIN');
      try {
        const updateResult = await client.query(
          `
            UPDATE decks
            SET name = $3,
                character_id = $4,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $1 AND user_id = $2
          `,
          [params.id, params.userId, params.name, params.characterId],
        );

        if ((updateResult.rowCount ?? 0) === 0) {
          await client.query('ROLLBACK');
          return null;
        }

        await client.query(
          `
            DELETE FROM deck_cards
            WHERE deck_id = $1
          `,
          [params.id],
        );

        for (const card of params.cards) {
          await client.query(
            `
              INSERT INTO deck_cards (deck_id, card_id, quantity)
              VALUES ($1, $2, $3)
            `,
            [params.id, card.cardId, card.quantity],
          );
        }

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }

      return deckModel.findByIdAndUserId(params.id, params.userId);
    });
  },

  async deleteByIdAndUserId(deckId: string, userId: string): Promise<boolean> {
    return withClient(async (client) => {
      const result = await client.query(
        `
          DELETE FROM decks
          WHERE id = $1 AND user_id = $2
        `,
        [deckId, userId],
      );

      return (result.rowCount ?? 0) > 0;
    });
  },
};
