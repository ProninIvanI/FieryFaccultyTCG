# Deck Rules v1

Текущая легальность колоды зафиксирована как общий доменный контракт в `game-core` и используется одинаково в `backend`, `server` и `frontend`.

## Источник истины

- `game-core/src/decks/rules.ts`
- `game-core/src/decks/validateDeckLegality.ts`

## Базовые правила

1. В колоде должно быть ровно `30` карт.
2. У колоды должен быть выбран ровно `1` персонаж.
3. Нельзя брать больше `2` копий одной карты.
4. `spell` и `summon` должны совпадать с факультетом выбранного персонажа.
5. `art` и `modifier` считаются нейтральными и разрешены для любого факультета.
6. В колоде может быть не больше `8` карт типа `art`.
7. В колоде может быть не больше `8` карт типа `modifier`.
8. Неизвестные `characterId` и `cardId` делают колоду нелегальной.

## Что считается при проверке

- `totalCards = sum(quantity)` по всем позициям
- `artCards = sum(quantity)` только для `type === 'art'`
- `modifierCards = sum(quantity)` только для `type === 'modifier'`
- `uniqueCards` считается для уникальных `cardId`

Валидатор не останавливается на первой ошибке и возвращает полный список проблем, чтобы UI мог показать игроку весь набор нарушений сразу.

## Коды ошибок

- `deck_size_invalid`
- `deck_character_required`
- `deck_character_unknown`
- `deck_card_unknown`
- `deck_card_copies_exceeded`
- `deck_card_school_mismatch`
- `deck_art_limit_exceeded`
- `deck_modifier_limit_exceeded`

## Где проверяется легальность

### Backend

- `backend/src/services/deckService.ts` валидирует колоду при `create/update`.
- Сохранение нелегальной колоды отклоняется на API-уровне.

### Server

- `server/src/infrastructure/decks/DeckCatalogClient.ts` повторно валидирует deck snapshot перед PvP-join.
- Если колода уже лежит в БД, но больше не проходит правила, `join` отклоняется кодом `deck_invalid`.

### Frontend

- `frontend/src/pages/DeckPage/DeckPage.tsx` использует тот же shared-валидатор.
- Deck Builder показывает live-summary `cards / art / modifier`, checklist правил, детали ошибок и блокирует `Save` или `+`, если следующее действие ломает легальность.
- Тестовые пресеты сразу собираются как легальные PvP-колоды и загружаются в локальный черновик.

## UX-ожидания для Deck Builder

- Игрок видит текущий прогресс по размеру колоды и нейтральным лимитам до сохранения.
- Нелегальная колода не должна доходить до PvP как сюрприз только на этапе матча.
- Правила в UI и на сервере не должны расходиться: источник истины всегда shared-валидатор из `game-core`.
