# Friends MVP Design

Дата: 2026-04-22
Статус: актуальный baseline по текущей реализации

## Цель

Сделать social-слой отдельно от матчевого движка:

- поиск пользователя по `username`;
- заявки в друзья;
- список друзей;
- realtime presence;
- live-инвайты в матч;
- мягкий handoff в PvP без изменений в `game-core`.

`game-core` не знает о друзьях, presence и invite flow.

## Границы ответственности

- `backend`: source of truth для `friend_requests`, `friendships`, `match_invites` и HTTP/internal API.
- `server`: realtime presence, live invites, подготовка invite-session, синхронизация с persistence.
- `frontend`: UI друзей, заявок, presence, invite confirm flow, вход в подготовленный матч.
- `game-core`: включается только после обычного PvP `join`.

## State Rules

### Friend Request

Начальное состояние: `pending`

Переходы:

- `pending -> accepted`
- `pending -> declined`
- `pending -> cancelled`

Из финальных статусов переходов больше нет.

### Friendship

- создаётся только через `accept`;
- хранится как одна каноническая пара пользователей;
- удаляется только через `delete friend`;
- не создаётся повторно, если уже существует.

### Match Invite

Начальное состояние: `pending`

Переходы:

- `pending -> accepted`
- `pending -> declined`
- `pending -> cancelled`
- `pending -> expired`
- `accepted -> consumed`
- `accepted -> expired`

Смысл статусов:

- `pending`: live invite отправлен и ждёт ответа;
- `accepted`: invite принят, `sessionId` и `seed` уже подготовлены, матч ждёт входа игроков;
- `consumed`: оба игрока уже вошли в подготовленную invite-session;
- `declined | cancelled | expired`: финальные неактивные состояния.

Accept live invite не меняет игровой state напрямую. Он только подготавливает invite-session и отдаёт клиентам данные для входа в обычный PvP flow.

## Инварианты

- нельзя отправить заявку себе;
- нельзя иметь `friendship` и `pending request` одновременно на одну пару;
- нельзя иметь два `pending` friend request между одной парой в любом направлении;
- `delete friend` удаляет только `friendship`;
- live invite доступен только между друзьями;
- live invite нельзя отправить пользователю со статусом `in_match`;
- подготовленный матч живёт ограниченное время и истекает, если игроки не вошли;
- вся логика, влияющая на исход матча, остаётся в `game-core`.

## Схема данных

### `friend_requests`

- `id TEXT PRIMARY KEY`
- `sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `receiver_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled'))`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`

Ограничения:

- `CHECK (sender_user_id <> receiver_user_id)`
- индексы по `sender_user_id`, `receiver_user_id`, `user_low_id, user_high_id`

### `friendships`

- `id TEXT PRIMARY KEY`
- `user_low_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `user_high_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`

Ограничения:

- `CHECK (user_low_id < user_high_id)`
- `UNIQUE (user_low_id, user_high_id)`

### `match_invites`

- `id TEXT PRIMARY KEY`
- `sender_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `receiver_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE`
- `status VARCHAR(16) NOT NULL CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'consumed'))`
- `session_id TEXT NULL`
- `seed TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP`
- `expires_at TIMESTAMPTZ NOT NULL`

Назначение:

- хранит активные и недавно завершённые live invites;
- позволяет восстановить `pending` и `accepted` invites после рестарта `server`;
- используется как persistence для confirm-flow и prepared invite-session.

Каноническая пара пользователей в friendship строится по лексикографическому порядку `userId`.

## Backend API

### Friends API

- `GET /api/friends?limit=50&cursor=...`
- `GET /api/friends/requests/incoming?limit=50&cursor=...`
- `GET /api/friends/requests/outgoing?limit=50&cursor=...`
- `POST /api/friends/requests`
- `POST /api/friends/requests/:requestId/accept`
- `POST /api/friends/requests/:requestId/decline`
- `POST /api/friends/requests/:requestId/cancel`
- `DELETE /api/friends/:friendUserId`

### Internal API для realtime policy и persistence

- `GET /api/internal/friends/status?userId=...&friendUserId=...`
- `GET /api/internal/social/invites?userId=...&now=...`
- `PUT /api/internal/social/invites/:inviteId`

Базовые error codes:

- `user_not_found`
- `self_request_forbidden`
- `already_friends`
- `outgoing_request_exists`
- `incoming_request_exists`
- `request_not_found`
- `request_not_pending`
- `forbidden`
- `friendship_not_found`
- `validation_error`

## Realtime Contract

Client -> server:

- `social.subscribe`
- `social.presence.query`
- `matchInvite.send`
- `matchInvite.respond`
- `matchInvite.cancel`

Server -> client:

- `social.subscribed`
- `social.presence`
- `social.invites.snapshot`
- `matchInvite.received`
- `matchInvite.updated`
- `matchInvite.rejected`

Presence states:

- `offline`
- `online`
- `in_match`

Invite rejection codes:

- `unauthorized`
- `target_offline`
- `target_in_match`
- `not_friends`
- `self_invite`
- `duplicate_pending`
- `not_found`
- `forbidden`
- `invite_not_pending`

## Текущий UX Flow

### Friends MVP

- пользователь отправляет заявку по `username`;
- получает входящие и исходящие заявки;
- принимает, отклоняет или отменяет заявку;
- видит список друзей;
- может удалить друга.

### Presence

- frontend подписывается через `social.subscribe`;
- server ведёт глобальный `PresenceRegistry`;
- список друзей получает live-статусы `Не в сети / Онлайн / В матче`.

### Match Invite

1. Игрок A отправляет `matchInvite.send`.
2. `server` проверяет:
   - пользователь авторизован;
   - цель онлайн;
   - цель не в активном матче;
   - пользователи являются друзьями.
3. `server` создаёт invite в realtime registry и сохраняет его в `backend`.
4. Игрок B получает live invite.
5. При `accept` сервер переводит invite в `accepted` и подготавливает:
   - `sessionId`
   - `seed`
   - новый `expiresAt` для prepared session
6. Оба клиента получают `matchInvite.updated`.
7. На главной появляется confirm-card `Матч готов`.
8. Переход в PvP происходит только по явному действию пользователя.
9. `PlayPvpPage` входит в уже подготовленный PvP flow через обычный `join`.
10. После входа обоих игроков invite переходит в `consumed`.

## Persisted UI State

- pending confirm-card хранится в `sessionStorage`;
- после refresh главной страницы карточка восстанавливается;
- при `social.subscribe` frontend получает `social.invites.snapshot`;
- если snapshot не содержит ранее сохранённый `accepted` invite, stale confirm-state очищается;
- состояние очищается после перехода в матч, явного `Позже` или финализации invite.

## Recovery и lifecycle

- `server` восстанавливает активные invites из `backend` при `social.subscribe`;
- после рестарта `server` клиенты снова получают актуальные `pending` и `accepted` invites;
- prepared invite-session живёт ограниченное время;
- `accepted` invite может истечь и перейти в `expired`, если матч не стартовал;
- после реального входа обоих игроков invite помечается как `consumed`.

## Пользовательские сообщения

HomePage сообщает причину, если prepared match больше недоступен:

- `consumed`: матч уже запущен;
- `expired`: подготовленная сессия истекла;
- `cancelled`: приглашение отменено;
- `declined`: приглашение отклонено;
- отсутствует в snapshot: сессия больше недоступна.

`PlayPvpPage` для invite-entry показывает отдельные подсказки, если пользователь открыл устаревшую или уже занятую invite-session вручную.

## Что уже реализовано

- backend friends schema/model/service/controller/routes;
- backend tests для friends API и internal endpoints;
- frontend friends UI и social actions;
- realtime presence в `server`;
- live invites в `server`;
- server-side guard `friends only` и `target not in match`;
- persistence live invites через `backend` internal API;
- recovery invites после рестарта `server`;
- confirm-screen перед входом в матч;
- handoff в PvP через `sessionId` и `seed` без изменений в `game-core`;
- lifecycle `accepted -> consumed`;
- snapshot reconciliation для stale confirm-state;
- invite-specific UX-подсказки на главной и на PvP-входе.

## Что ещё не закрыто

- отдельная продуктовая политика cleanup для очень старых неактивных `match_invites`;
- возможная серверная очистка persistence-слоя по расписанию;
- дополнительный product polish для invite-entry и повторного входа в уже подготовленный матч.
