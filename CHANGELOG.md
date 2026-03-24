# Changelog

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
