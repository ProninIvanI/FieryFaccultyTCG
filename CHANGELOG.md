# Changelog

> 2026-04-07 update: hardened legacy deck HTTP routes in `backend`: protected deck endpoints now forward async failures into Express error handling instead of dropping the socket, `requireAuth` no longer turns storage/auth lookup failures into empty responses, and deck catalog loading was aligned with the current backend runtime so deck save/load failures surface as real API errors instead of `ERR_EMPTY_RESPONSE`.

> 2026-04-07 update: fixed local deck persistence wiring for the current split stack. Root `npm run dev` now starts `backend`, `server`, and `frontend` together, local HTTP/WS integrations default to `localhost` instead of Docker-only hostnames, and backend database config now supports both direct local Postgres settings and explicit `DATABASE_URL`, so deck CRUD no longer fails with a generic network error in the default local setup.

> 2026-04-07 update: synchronized project docs with the current `game-core` card-mechanics baseline. The shared card catalog now acts as an explicit source of truth via `targetType`, `resolutionRole`, structured `effects[]`, and real summon stats (`hp/attack`) instead of flat text-only spell descriptions and mana-derived summon stats. `game-core` now resolves the current safe mechanics end-to-end: mass effects, `ignoreShield`, `ignoreEvade`, `repeatNextTurn`, control effects (`cannot evade`, `skip action`, slow-spell interrupt, offensive trap), and the first safe `modifier/art` meta-rules for next-spell / next-attack / mana / speed changes. Problematic pipeline-breaking card ideas were replaced with safe variants in the catalog, while conditional effects, status layers (`burn`) and displacement were explicitly moved to future backlog docs instead of being silently implied by card text.

> 2026-03-26 update: closed the current PvP smoke-fix batch across `game-core`, `server`, and `frontend`: resolved cards now move between real zones, the next round restores mana/actions and draws cards, post-resolve personal snapshots are rebroadcast, `PlayPvpPage` gained ordered resolve playback with field highlights, diagnostics became opt-in, and the live match UI was compacted into replay-focused HUD panels with updated regression coverage.

> 2026-03-26 update: PvP `PlayPvpPage` was moved from the old draft/sidebar flow to a core-driven battle ribbon: `game-core` now derives `BoardItem`, `RoundAction`, placement, unified `ribbonEntries`, and initial hand/creature intents; server snapshots expose `boardView` plus personal `boardModel`; frontend now inserts actions directly into the ribbon, removes manual reorder and the right-side context panel, uses inline action/target indicators with field-click targeting, and documentation/specs were synchronized to the implemented model.

> 2026-03-25 update: `PlayPvpPage` PvP draft UX was polished on top of the new round-based flow: the creature panel now has a dedicated `Evade` action, the post-round area renders a reveal timeline in actual `roundResolved` order, target labels are resolved from the live snapshot instead of raw `targetId`, and frontend coverage now includes both `Evade` and self-target `PlayCard` draft scenarios.

> 2026-03-25 update: synchronized architecture docs with the actual simultaneous-round PvP implementation: `frontend/ARCHITECTURE.md` no longer describes legacy `join/action`, the stack architecture now reflects the implemented round lifecycle and public WebSocket contract (`roundDraft.replace`, `roundDraft.lock`, `roundDraft.snapshot`, `roundStatus`, `roundResolved`), and the simultaneous-round spec is marked as an implemented baseline/living spec.

> 2026-03-25 update: simultaneous-round PvP now restores the local player draft after join/reconnect via a new personal `roundDraft.snapshot` WebSocket message; the server exposes the caller's current round draft without revealing opponent data, and `PlayPvpPage` rehydrates the local action queue from that snapshot while preserving round sync/lock state.

> 2026-03-25 update: PvP WebSocket transport is now round-only: legacy client/server `action` messages were removed from the public frontend and server DTO flow, `WsGateway` no longer accepts turn-based immediate actions, and DTO coverage now asserts that old `action` payloads are rejected as unsupported transport messages.

> 2026-03-25 update: `frontend` PvP flow is now wired to simultaneous hidden rounds: `gameWsService` and frontend DTOs understand `roundDraft.replace` / `roundDraft.lock` plus `roundStatus` / `roundResolved`, `PlayPvpPage` keeps a local action queue with reorder/remove/lock-in, previews intended resolution layers without promising FIFO execution, supports targeted card draft and creature attack draft, and renders the latest resolved round with updated UI tests for the new flow.

> 2026-03-25 update: `server` now supports the simultaneous-round PvP transport and session flow with new WebSocket messages `roundDraft.replace` / `roundDraft.lock`, player-bound round-intent parsing, `GameSession`/`GameService` bridge methods for round drafts, personalized `roundStatus`, `roundResolved` broadcasts after both players lock, and integration coverage for the replace-lock-resolve cycle while keeping legacy `action` transport as a temporary fallback.

> 2026-03-25 update: `game-core` now has the first executable round pipeline for simultaneous PvP: private round-draft storage in `GameEngine`, `submitRoundDraft(...)`, `lockRoundDraft(...)`, barrier-based `resolveRoundIfReady()`, ordered layer resolution through existing action commands, round rollover with initiative rotation, and integration tests for lock/wait/resolve flow.

> 2026-03-25 update: `game-core` received the first simultaneous-round implementation slice with new `round` state in `GameState`, `RoundActionIntent`/`RoundState` types, pure `compile/sort/validate` round-draft utilities, summoning-sickness draft validation, and dedicated tests while keeping legacy turn-based `processAction(...)` intact.

> 2026-03-25 update: added `docs/simultaneous-round-implementation-spec.md` with the implementation plan for hidden-round simultaneous PvP, including round lifecycle, resolution layers, tie-breaker rules, `RoundActionIntent`/`RoundState` models, WebSocket contracts, and phased migration steps for `game-core -> server -> frontend`.

> 2026-03-25 update: `PlayPvpPage` now renders player portraits from the selected deck character and shows the opponent hand as a mirrored fan of card backs at the top of the board, while keeping card contents hidden.

> 2026-03-25 update: `PlayPvpPage` now uses a single shared side column for player/deck widgets ordered top-to-bottom as opponent, opponent deck, local deck, local player.

> 2026-03-25 update: `PlayPvpPage` battlefield layout now places both deck rails on side columns and gives the lower central zone to the player hand, moving the board closer to a lane-based card-table layout.

> 2026-03-25 update: `game-core` now deals a deterministic opening hand on match start, and the server sync path mirrors that behavior so PvP players immediately receive real cards in hand instead of an empty tray.

> 2026-03-25 update: `PlayPvpPage` hand cards and the selected-card panel now render richer card content from the shared catalog, including school/type badges, effect text, and summon stats (`HP / ATK / SPD`) in a layout closer to `DeckPage`.

> 2026-03-24 update: `PlayPvpPage` now reads deck size from `state.decks[playerId].cards`, and frontend PvP snapshots are typed via `GameState` from `game-core` to catch contract mismatches earlier.

## 2026-03-24

### Changed

- PvP-экран (`PlayPvpPage`) получил цельный tabletop-визуал: тёплую деревянную тему, отдельные панели игроков, декоративные полосы колод и более выраженную центральную арену вместо набора светлых utility-карточек.
- Центральное поле PvP уплотнено под боевую сцену: линии существ переведены в компактные горизонтальные боевые слоты, активная сторона матча подсвечивается, а рука локального игрока отображается веером.
- В PvP UI добавлен декоративный polish-слой без изменения игровой логики: орнаментальные рамки арены, сигилы на карточках/слотах, цветовые маркеры для `HP / ATK / SPD` и более выразительные avatar-placeholder блоки.

### Docs

- `frontend/ARCHITECTURE.md` синхронизирован с текущим состоянием PvP presentation-layer: зафиксирован новый visual board layout, веер руки и выделение активной стороны поля как часть derived UI над server snapshot.

## 2026-03-23

### Changed

- PvP-экран (`PlayPvpPage`) переведён на более читаемый battlefield-layout: компактная панель матча, центральное игровое поле, focus/context panel, нижний hand tray и spotlight по ходу матча.
- В PvP UI добавлены выбор карты/существа, focus-состояния и рабочий target-draft flow для target-heavy карт с отправкой `CastSpell` / `PlayCard`.
- `targetType` для PvP действий больше не выбирается вручную во frontend и определяется из общего карточного каталога.
- Карточный каталог (`cards + characters`) нормализован в `game-core`, а `server`, `PlayPvpPage`, `CardsPage` и `DeckPage` переведены на единый shared-layer вместо локального разбора `cards.json`.
- В `game-core` вынесены общие metadata/helper-слои для каталога: `normalizeCatalog(...)`, `buildCatalogCardSummaries(...)`, `buildCatalogCharacterSummaries(...)`, label-helper’ы для школ и типов карт.
- `CardsPage` и `DeckPage` больше не держат локальные `buildCardPool/buildCharacters`, ручные валидаторы raw-каталога и локальные словари для школ/типов карт.

### Docs

- Обновлена архитектурная документация frontend под текущий shared catalog flow между `game-core`, PvP UI, `CardsPage` и `DeckPage`.
- Зафиксирован следующий возможный шаг: вынести в общий слой UI-label/helper’ы для `targetType` и, при необходимости, фаз матча, чтобы `PlayPvpPage` тоже отказался от локальных словарей строк.

## 2026-03-21

### Fixed

- Frontend logout переведён на единый `authService.logout(...)` вместо дублированных запросов из `HomePage`.
- `POST /api/auth/logout` теперь документирован как обязательный шаг для удаления серверной auth-сессии по bearer token.
- Smoke-check для staging дополнен проверкой logout после успешного login.

### Changed

- `PlayPvpPage` теперь показывает derived PvP-данные из реального server snapshot: список игроков, размеры `deck/hand/discard` и руку локального игрока.
- `PlayPvpPage` расширен до базового battlefield UI: на экране есть spotlight по состоянию матча, линии `соперник/ты`, duel-strip, event feed, debug-блок для raw state и summon-flow из руки для карт типа `summon`.
- PvP UI продолжает опираться на server state как source of truth, а не на локальную сборку матчевого состояния во frontend.
- `DeckPage` объединяет выбор сохранённой колоды, её редактирование и сохранение в одном блоке конструктора.
- Сохранение колоды теперь требует валидный `characterId`: frontend не даёт отправить запрос без выбранного персонажа, а backend отклоняет пустой или несуществующий идентификатор персонажа.
- Staging backend теперь собирается с `game-core`, чтобы server-backed сохранение колод не падало на чтении `game-core/data/cards.json`.
- Backend deck catalog теперь корректно читает `cards.json` с UTF-8 BOM, поэтому сохранение колод не падает на `JSON.parse`.
- Выбор `Черновик` в `DeckPage` теперь действительно сбрасывает активную колоду, поэтому новая колода создаётся, а не перезаписывает последнюю выбранную.
- В `DeckPage` добавлена явная кнопка `Сохранить как новую`, чтобы текущую сборку можно было сохранить отдельной колодой без перезаписи выбранной.

### Docs

- Обновлены `docs/data-architecture.md`, `frontend/ARCHITECTURE.md` и `FUTURE_TODO.md` под текущий статус server-backed decks и PvP UI.
- Документация по PvP UI синхронизирована с новым battlefield-слоем и cleanup в тестах `PlayPvpPage`: `act(...)` и React Router warnings больше не считаются открытым техдолгом.
