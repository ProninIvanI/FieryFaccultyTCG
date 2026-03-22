# Архитектура хранения матчей

Документ фиксирует, как в проекте должны храниться завершённые и активные матчи, какие сущности для этого нужны и что именно должно сохраняться внутри матчевого контура.

## Цель

- разделить `live-runtime` матча и `persistent history`;
- зафиксировать минимальный набор сущностей для `backend + postgres`;
- определить, что сохраняем обязательно, что опционально и что не должно становиться источником истины;
- подготовить базу для `history`, `replay`, `debug` и будущей аналитики.

## Границы ответственности

### `game-core`

Источник истины для:
- правил матча;
- сериализуемого состояния матча;
- команд и их детерминированного применения;
- replay-переисполнения.

### `server`

Источник истины только для runtime:
- активной live-сессии;
- текущего state в памяти;
- связи `socket -> authenticated user`;
- временных runtime-метаданных подключения.

`server` не должен быть каноническим хранилищем истории матчей.

### `backend + postgres`

Источник истины для persistent-части:
- записи о матче;
- участников матча;
- результата матча;
- сохранённого replay/command log;
- снимков и метаданных, нужных для восстановления, истории и дебага.

## Что считаем матчем

Матч в persistent-слое это одна завершённая или ещё не завершённая игровая сессия с:
- уникальным `matchId`;
- фиксированным набором участников;
- зафиксированным стартовым контекстом;
- версией правил/движка;
- результатом или текущим статусом;
- материалом для replay.

## Жизненный цикл матча

1. Игроки подключаются к `server` и создают runtime-сессию.
2. `server` собирает стартовый контекст матча: игроков, выбранные `deckId`, seed, версию протокола/движка.
3. После успешного старта создаётся persistent-запись `matches`.
4. По ходу матча `server` накапливает command log и при необходимости промежуточные snapshots.
5. При завершении или аварийном обрыве `server` отправляет итог в `backend`.
6. `backend` сохраняет финальный статус матча, участников, результат и replay-данные.

## Основные сущности

### `matches`

Главная запись матча.

Минимальные поля:
- `id` - внутренний UUID записи.
- `match_id` - публичный/доменный идентификатор матча.
- `status` - `pending | active | finished | aborted`.
- `started_at`
- `finished_at`
- `created_by_user_id`
- `seed`
- `game_core_version`
- `rules_version`
- `start_state_json`
- `final_state_json`
- `winner_user_id` nullable
- `end_reason` - `victory | surrender | disconnect | abort | error`
- `turn_count`
- `action_count`
- `last_applied_action_at`
- `created_at`
- `updated_at`

Назначение:
- хранит мета-информацию и агрегированный итог матча;
- не должен раздуваться сырыми логами на сотни килобайт, если для этого есть отдельная replay-сущность.

### `match_players`

Состав участников матча.

Минимальные поля:
- `id`
- `match_id`
- `user_id`
- `player_slot` - например `1 | 2`
- `player_id_in_match` - доменный `player_1`, `player_2`
- `deck_id`
- `deck_version` nullable
- `is_winner`
- `finish_result` - `win | loss | draw | abandoned`
- `connected_at`
- `disconnected_at` nullable
- `created_at`

Назначение:
- фиксирует, кто именно играл;
- связывает матч с пользовательской колодой;
- позволяет строить историю матчей по пользователю и по колоде.

### `match_replays`

Replay и детерминированный журнал воспроизведения.

Минимальные поля:
- `id`
- `match_id`
- `format_version`
- `initial_context_json`
- `command_log_json`
- `snapshot_strategy` - `none | checkpoints | full`
- `checkpoints_json` nullable
- `final_hash` nullable
- `created_at`

Назначение:
- хранит всё, что нужно для переигрывания матча;
- отделяет тяжёлые replay-данные от основной таблицы `matches`.

## Что обязательно сохранять внутри матча

### 1. Стартовый контекст

Нужно сохранять:
- `matchId`;
- `seed`;
- список участников;
- соответствие `userId -> playerIdInMatch`;
- выбранные `deckId`;
- нормализованный стартовый loadout, если он важен для воспроизводимости;
- версию `game-core`;
- версию правил/контрактов матча.

Почему:
- без этого нельзя надёжно воспроизвести матч после изменения данных или кода.

### 2. Команды игроков

Нужно сохранять:
- порядковый номер команды;
- timestamp приёма на сервере;
- `playerIdInMatch`;
- тип команды;
- payload команды в валидированном нормализованном виде;
- результат применения: `accepted | rejected`;
- причину отказа, если команда не была принята.

Почему:
- это основа replay;
- это же база для дебага спорных ситуаций.

Примечание:
- в replay имеет смысл хранить только принятые команды;
- отклонённые команды можно хранить отдельно как debug-аудит, но не смешивать с каноническим replay.

### 3. Снимки состояния

Минимально сохраняем:
- стартовый state;
- финальный state.

Опционально сохраняем:
- checkpoint каждые `N` действий или на границе хода;
- hash state после каждого хода.

Почему:
- стартовый + лог достаточны для полного replay;
- checkpoints ускоряют восстановление и упрощают дебаг.

### 4. Итог матча

Нужно сохранять:
- финальный статус;
- победителя/победителей;
- причину завершения;
- длительность;
- число ходов;
- число принятых действий;
- служебный summary для UI истории матчей.

### 5. Связь с пользователем и колодой

Нужно сохранять:
- `userId`;
- `deckId`;
- при необходимости имя колоды или snapshot метаданных колоды на момент старта.

Почему:
- пользователь может позже изменить или удалить колоду;
- история матча не должна терять связь с фактом, чем именно играли.

## Что полезно сохранять дополнительно

Опциональный слой:
- `deck_snapshot_json` на каждого игрока;
- `match_summary_json` для быстрого UI-рендера без подъёма replay;
- `state_hash_chain` для проверки целостности;
- `server_build` / `client_build` для диагностики несовместимостей;
- `first_error_code` и `abort_details_json` для аварийно завершённых матчей.

## Что не нужно делать источником истины

Не нужно хранить как канон:
- frontend-derived UI-представления;
- локальные фильтры и открытые панели;
- сырые socket-события уровня транспорта;
- произвольные debug-логи без структуры;
- чувствительные auth-данные пользователя.

## Рекомендуемая схема хранения JSON

Храним в JSON-полях только то, что:
- уже существует как сериализуемая доменная структура;
- неудобно нормализовать без пользы;
- нужно переносить между версиями как единый blob.

Нормализуем в отдельные таблицы то, по чему будут частые выборки:
- участники матча;
- пользователь;
- колода;
- результат;
- статус;
- временные метки.

## Минимальная версия для первого внедрения

Для первого рабочего слоя достаточно:

### Таблица `matches`
- `match_id`
- `status`
- `seed`
- `created_by_user_id`
- `started_at`
- `finished_at`
- `winner_user_id`
- `end_reason`
- `game_core_version`
- `start_state_json`
- `final_state_json`
- `turn_count`
- `action_count`

### Таблица `match_players`
- `match_id`
- `user_id`
- `player_slot`
- `player_id_in_match`
- `deck_id`
- `is_winner`
- `finish_result`

### Таблица `match_replays`
- `match_id`
- `format_version`
- `initial_context_json`
- `command_log_json`

Этого уже хватает для:
- истории матчей пользователя;
- базового replay;
- дебага результатов;
- будущего UI страницы истории.

## SQL-схема v1

Ниже минимальный SQL-черновик под текущий стиль проекта.

```sql
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
```

### Что важно в этой схеме

- Внешние ключи идут на внутренний `matches.id`, а не на публичный `match_id`.
- `match_id` остаётся публичным доменным идентификатором, который можно показывать в API и логах.
- `deck_snapshot_json` пока опционален, но я рекомендую заложить его сразу: потом это спасёт историю матчей от дрейфа данных после редактирования колоды.
- `command_log_json` пока одним `JSONB`, потому что для первого этапа вам важнее быстро получить replay, чем нормализовать каждое действие в отдельную таблицу.

## Что именно должно лежать в JSON-полях

### `matches.start_state_json`

Сохраняем канонический сериализованный стартовый state из `game-core`:
- фаза;
- активный игрок;
- стартовые ресурсы;
- стартовые зоны;
- всё, что требуется для детерминированного воспроизведения.

### `matches.final_state_json`

Сохраняем финальный сериализованный state:
- итоговые зоны;
- итоговые hp/ресурсы;
- победное состояние;
- служебный финальный state для дебага.

### `match_replays.initial_context_json`

Сохраняем минимальный вход replay:
- `matchId`;
- `seed`;
- `gameCoreVersion`;
- `rulesVersion`;
- список игроков;
- `playerIdInMatch`;
- `userId`;
- `deckId`;
- при необходимости `deckSnapshot`.

Пример формы:

```json
{
  "matchId": "match-123",
  "seed": 123,
  "gameCoreVersion": "0.1.0",
  "rulesVersion": "pvp-v1",
  "players": [
    {
      "playerId": "player_1",
      "userId": "user_1",
      "deckId": "deck_1"
    },
    {
      "playerId": "player_2",
      "userId": "user_2",
      "deckId": "deck_2"
    }
  ]
}
```

### `match_replays.command_log_json`

Храним массив принятых команд:

```json
[
  {
    "seq": 1,
    "acceptedAt": "2026-03-21T10:00:00.000Z",
    "playerId": "player_1",
    "type": "EndTurn",
    "payload": {}
  }
]
```

Для первого прохода этого достаточно.

Если позже понадобится расширение, можно добавлять:
- `stateHashAfter`;
- `turnNumber`;
- `phase`;
- `clientRequestId`.

## Backend-слои для первой реализации

Под текущую структуру backend рекомендую такой набор файлов.

### `backend/src/types/index.ts`

Добавить:
- `MatchStatus`
- `MatchEndReason`
- `MatchPlayerFinishResult`
- `MatchRecord`
- `MatchPlayerRecord`
- `MatchReplayRecord`
- `MatchSummary`
- `CreateMatchRecordInput`
- `CompleteMatchInput`

### `backend/src/models/matchModel.ts`

Ответственность:
- `ensureMatchSchema()`
- `createMatch(...)`
- `findById(...)`
- `findByPublicMatchId(...)`
- `completeMatch(...)`
- `listByUserId(...)`
- `saveReplay(...)`
- `findReplayByMatchId(...)`

Почему один model на первом этапе:
- схема ещё маленькая;
- быстрее внедрить и проще рефакторить потом.

Если сущность разрастётся, позже можно разделить на:
- `matchModel`
- `matchReplayModel`
- `matchHistoryQueryModel`

### `backend/src/services/matchService.ts`

Ответственность:
- принять доменный payload от `server`;
- провалидировать структуру persistent-записи;
- создать матч;
- завершить матч;
- отдать историю матчей пользователя;
- отдать replay по `matchId`.

### `backend/src/controllers/matchController.ts`

HTTP-слой:
- `getMyMatches`
- `getMatchById`
- `getMatchReplay`

Важно:
- создавать/закрывать матч через публичный пользовательский API пока не нужно;
- запись матча должна приходить из доверенного server-to-backend контура, а не напрямую с клиента.

### `backend/src/routes/matchRoutes.ts`

Первый набор read-only роутов для пользователя:
- `GET /api/matches`
- `GET /api/matches/:matchId`
- `GET /api/matches/:matchId/replay`

И отдельно внутренние серверные роуты:
- `POST /api/internal/matches`
- `POST /api/internal/matches/:matchId/complete`
- `POST /api/internal/matches/:matchId/replay`

## API-контракт v1

### Пользовательские ручки

#### `GET /api/matches`

Возвращает список матчей текущего пользователя.

Минимальный ответ:

```json
{
  "matches": [
    {
      "matchId": "match-123",
      "status": "finished",
      "startedAt": "2026-03-21T10:00:00.000Z",
      "finishedAt": "2026-03-21T10:12:00.000Z",
      "endReason": "victory",
      "winnerUserId": "user_1",
      "turnCount": 9,
      "actionCount": 17,
      "players": [
        {
          "userId": "user_1",
          "playerSlot": 1,
          "deckId": "deck_1",
          "finishResult": "win"
        },
        {
          "userId": "user_2",
          "playerSlot": 2,
          "deckId": "deck_2",
          "finishResult": "loss"
        }
      ]
    }
  ]
}
```

#### `GET /api/matches/:matchId`

Возвращает детальную запись матча без тяжёлого replay.

#### `GET /api/matches/:matchId/replay`

Возвращает replay-данные матча, только если текущий пользователь был участником матча или имеет будущие админские права.

### Внутренние server-to-backend ручки

#### `POST /api/internal/matches`

Создаёт persistent-запись матча в момент успешного старта.

Тело:
- `matchId`
- `seed`
- `createdByUserId`
- `gameCoreVersion`
- `rulesVersion`
- `startState`
- `players`

#### `POST /api/internal/matches/:matchId/complete`

Фиксирует завершение матча.

Тело:
- `status`
- `winnerUserId`
- `endReason`
- `finalState`
- `turnCount`
- `actionCount`
- `finishedAt`
- `players`

#### `POST /api/internal/matches/:matchId/replay`

Сохраняет replay.

Тело:
- `formatVersion`
- `initialContext`
- `commandLog`
- `checkpoints`
- `finalHash`

## Порядок внедрения в код

1. Добавить таблицы в `docker/postgres/init.sql`.
2. Добавить `matchModel.ts` с `ensureMatchSchema()`.
3. Добавить `matchService.ts`.
4. Добавить read-only пользовательские роуты истории матчей.
5. Добавить внутренние server-to-backend ручки сохранения матча.
6. После этого уже интегрировать сохранение из `server` при старте и завершении PvP.

Текущий статус:
- пункты `1-5` уже реализованы;
- сохранение из `server` при старте live-сессии и обновление replay уже реализованы;
- сохранение финального результата матча остаётся следующим шагом после появления явного определения завершения матча в runtime/game-core.

## Решение по scope первого прохода

В первый проход не делаем:
- отдельную таблицу `match_actions`;
- сложную аналитику по картам;
- полнотекстовые debug-логи по каждому ws-событию;
- публичное создание матча через backend REST.

В первый проход делаем:
- историю матчей;
- детальный просмотр матча;
- replay как `initial_context + command_log`;
- связь `match <-> users <-> decks`.

Фактически уже сделано:
- SQL-схема `matches / match_players / match_replays`;
- `matchModel`, `matchService`, user-facing read-only API;
- внутренние ручки `POST /api/internal/matches` и `POST /api/internal/matches/:matchId/replay`;
- сохранение старта матча и replay из `server`.

## Предлагаемый порядок реализации

1. Ввести backend-модели `matches`, `match_players`, `match_replays`.
2. Сохранять запись матча при успешном старте live-сессии.
3. На завершении матча сохранять финальный итог и участников.
4. Добавить сохранение replay command log.
5. После этого отдельно решить, нужны ли checkpoints и `deck_snapshot_json`.

## Решения по умолчанию

- Канонический replay = `initial_context + accepted command log`.
- Отклонённые команды не входят в канонический replay.
- `server` хранит матч в памяти только пока матч активен.
- После завершения матча persistent-истина живёт в `backend + postgres`.
- `frontend` получает историю матчей только через backend API.
