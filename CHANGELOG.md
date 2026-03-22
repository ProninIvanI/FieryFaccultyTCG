# Changelog

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
