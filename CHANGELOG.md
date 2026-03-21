# Changelog

## 2026-03-21

### Fixed

- Frontend logout переведён на единый `authService.logout(...)` вместо дублированных запросов из `HomePage`.
- `POST /api/auth/logout` теперь документирован как обязательный шаг для удаления серверной auth-сессии по bearer token.
- Smoke-check для staging дополнен проверкой logout после успешного login.

### Changed

- `PlayPvpPage` теперь показывает derived PvP-данные из реального server snapshot: список игроков, размеры `deck/hand/discard` и руку локального игрока.
- PvP UI продолжает опираться на server state как source of truth, а не на локальную сборку матчевого состояния во frontend.
- `DeckPage` объединяет выбор сохранённой колоды, её редактирование и сохранение в одном блоке конструктора.

### Docs

- Обновлены `docs/data-architecture.md`, `frontend/ARCHITECTURE.md` и `FUTURE_TODO.md` под текущий статус server-backed decks и PvP UI.
- Зафиксирован frontend-техдолг: `act(...)` warnings в тестах `PlayPvpPage` считаются `important`, но не блокируют текущий шаг, пока `lint`, `type-check`, `build` и тесты остаются зелёными.
