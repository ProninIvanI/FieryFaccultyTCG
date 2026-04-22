-- Инициализация базы данных
-- Этот файл выполняется при первом запуске контейнера PostgreSQL

-- Создание расширений (если нужно)
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Пример создания таблицы (можно удалить или изменить)
-- CREATE TABLE IF NOT EXISTS users (
--     id SERIAL PRIMARY KEY,
--     email VARCHAR(255) UNIQUE NOT NULL,
--     name VARCHAR(255) NOT NULL,
--     created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
-- );

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);

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
);

CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_user_id ON friend_requests(sender_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_receiver_user_id ON friend_requests(receiver_user_id);
CREATE INDEX IF NOT EXISTS idx_friend_requests_pair ON friend_requests(user_low_id, user_high_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_friend_requests_pending_pair
    ON friend_requests(user_low_id, user_high_id)
    WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS friendships (
    id TEXT PRIMARY KEY,
    user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (user_low_id < user_high_id),
    UNIQUE (user_low_id, user_high_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_user_low_id ON friendships(user_low_id);
CREATE INDEX IF NOT EXISTS idx_friendships_user_high_id ON friendships(user_high_id);

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
);

CREATE INDEX IF NOT EXISTS idx_match_invites_inviter_user_id ON match_invites(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_match_invites_target_user_id ON match_invites(target_user_id);
CREATE INDEX IF NOT EXISTS idx_match_invites_status ON match_invites(status);
CREATE INDEX IF NOT EXISTS idx_match_invites_updated_at ON match_invites(updated_at DESC);

CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(128) NOT NULL,
    character_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deck_cards (
    deck_id TEXT NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    PRIMARY KEY (deck_id, card_id)
);

CREATE INDEX IF NOT EXISTS idx_decks_user_id ON decks(user_id);

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
);

CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_created_by_user_id ON matches(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_winner_user_id ON matches(winner_user_id);
CREATE INDEX IF NOT EXISTS idx_matches_started_at ON matches(started_at DESC);

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
);

CREATE INDEX IF NOT EXISTS idx_match_players_match_id ON match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user_id ON match_players(user_id);
CREATE INDEX IF NOT EXISTS idx_match_players_deck_id ON match_players(deck_id);

CREATE TABLE IF NOT EXISTS match_replays (
    id TEXT PRIMARY KEY,
    match_id TEXT NOT NULL UNIQUE REFERENCES matches(id) ON DELETE CASCADE,
    format_version VARCHAR(32) NOT NULL,
    initial_context_json JSONB NOT NULL,
    command_log_json JSONB NOT NULL,
    checkpoints_json JSONB,
    final_hash TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);






