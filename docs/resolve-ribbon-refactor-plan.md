# План рефактора: private draft ribbon -> public resolution ribbon

Дата: 2026-04-08
Статус: draft for implementation
Назначение: зафиксировать целевую модель раунда и конкретные шаги рефактора перед кодовыми правками

## 1. Цель

Привести текущую PvP-модель к явному разделению:

- `private draft ribbon` — личная скрытая лента игрока до `lock-in`;
- `public resolution ribbon` — общая открытая лента после `lock-in` обоих игроков;
- `playback` — пошаговый просмотр той же `public resolution ribbon`, а не отдельный порядок;
- `board state` — состояние поля, которое не является очередью исполнения.

Главный принцип:

- игровой резолв происходит один раз в `game-core`;
- `public resolution ribbon` и `orderedActions` должны быть одной и той же канонической сущностью;
- `playback` не должен пересчитывать порядок сам.

## 2. Терминология

### 2.1. `private draft ribbon`

- используется до `lock-in`;
- показывает личные действия игрока в текущем раунде;
- может честно показывать локальные слои и preview;
- не является общим порядком раунда, потому что скрыты действия соперника.

### 2.2. `public resolution ribbon`

- появляется после `lock-in` обоих игроков;
- строится из уже рассчитанного server/core порядка;
- читается слева направо как реальная последовательность исполнения;
- является основным публичным представлением раунда.

### 2.3. `playback`

- не является вторым резолвом;
- не имеет собственного source of truth;
- просто проходит курсором по `public resolution ribbon`.

### 2.4. `board state`

- описывает, что сейчас существует на поле;
- включает `BoardItem`, persistent-объекты, существа, эффекты;
- не должен притворяться очередью исполнения.

## 3. Каноническая модель

После рефактора источник истины должен быть таким:

- до `lock-in`:
  - source of truth для личной ленты: `roundDraft` + `PlayerBoardModel`;
- после `lock-in` и общего резолва:
  - source of truth для публичного порядка: `RoundResolutionResult.orderedActions`.

Следствие:

- `orderedActions` должны содержать достаточно данных, чтобы фронтенд мог построить полную открытую ленту без дополнительных догадок;
- `PlayerBoardModel.ribbonEntries` больше не трактуется как глобальная лента резолва;
- `PlayerBoardModel` остаётся private draft/board view.

## 4. Что именно считается проблемой сейчас

- в документации смешаны private draft ribbon и публичный порядок раунда;
- `orderedActions` содержат outcome, но пока недостаточно богаты для роли полной публичной ленты;
- фронтенд держит отдельную ленту и отдельный playback как разные представления;
- `boardModel` местами воспринимается как будто это и есть порядок общего раунда, хотя это private draft/board view.

## 5. Целевые изменения по коду

### 5.1. `game-core`: расширить публичный шаг раунда

Файл:

- `game-core/src/types/round.ts`

Нужно расширить `ResolvedRoundAction`, чтобы это был полноценный публичный шаг:

- `orderIndex`
- `intentId`
- `playerId`
- `kind`
- `actorId`
- `layer`
- `queueIndex`
- `priority`
- `source`
- `target`
- `status`
- `reasonCode`
- `summary`
- опционально `cardInstanceId`
- опционально `definitionId`

Идея:

- `RoundResolutionResult.orderedActions` должен уже быть готовой `public resolution ribbon`.

### 5.2. `game-core`: строить канонический публичный порядок в `GameEngine`

Файл:

- `game-core/src/engine/GameEngine.ts`

Нужно:

- на этапе `compiled -> orderedActions` собирать полный публичный шаг;
- брать `orderIndex` из позиции элемента в отсортированном `compiled`;
- пробрасывать в `orderedActions` все данные шага, а не только итоговый статус;
- оставить сам игровой резолв одинарным, без второй логики исполнения.

### 5.3. `game-core`: понизить статус `boardModel`

Файлы:

- `game-core/src/types/board.ts`
- `game-core/src/board/buildPlayerBoardModel.ts`

Нужно:

- оставить `boardModel` как private draft/board view;
- не считать `ribbonEntries` каноническим порядком общего раунда;
- `attachedRoundActionIds` использовать только как draft/UI affordance для сущности на поле.

### 5.4. `server`: оставить transport, но протянуть новый канон

Файлы:

- `server/src/transport/ws/dto.ts`
- `server/src/application/GameService.ts`
- при необходимости `server/src/domain/game/GameSession.ts`

Нужно:

- не вводить новый event без необходимости;
- считать `roundResolved.result.orderedActions` канонической общей публичной лентой;
- сохранить `roundDraft.snapshot.boardModel` как private draft/board view.

### 5.5. `frontend`: явно развести private и public стадии

Файлы:

- `frontend/src/types/pvp.ts`
- `frontend/src/pages/PlayPvpPage/PlayPvpPage.tsx`

Нужно:

- до `roundResolved` показывать private draft ribbon;
- после `roundResolved` переключать основной открытый UI на `lastResolvedRound.orderedActions`;
- сделать `playback` курсором по этому же массиву;
- не рассчитывать отдельный публичный порядок во фронтенде.

### 5.6. `frontend`: отделить действие существа от объекта поля

Файл:

- `frontend/src/pages/PlayPvpPage/PlayPvpPage.tsx`

Нужно:

- оставить существо на поле как `BoardItem`;
- показывать его атаку в `public resolution ribbon` как отдельный шаг;
- связывать шаг с существом через source/target highlight, а не через слияние в один и тот же элемент.

## 6. Порядок реализации

1. `game-core/src/types/round.ts`
2. `game-core/src/engine/GameEngine.ts`
3. `server/src/transport/ws/dto.ts`
4. `frontend/src/types/pvp.ts`
5. `frontend/src/pages/PlayPvpPage/PlayPvpPage.tsx`
6. тесты `game-core`
7. тесты `server`
8. тесты `frontend`
9. синхронизация MD-документации

## 7. Тестовый план

### 7.1. `game-core`

Проверить:

- `orderedActions` содержат все данные для публичной ленты;
- порядок `orderedActions` совпадает с реальным резолвом;
- `orderIndex` стабилен и соответствует отсортированному `compiled` pipeline.

### 7.2. `server`

Проверить:

- до `roundResolved` hidden draft не утекает сопернику;
- после `roundResolved` оба клиента получают один и тот же публичный порядок;
- `roundResolved.result.orderedActions` достаточно богат для прямого UI-рендера.

### 7.3. `frontend`

Проверить:

- до lock игрок видит только private draft ribbon;
- после `roundResolved` UI переключается на public resolution ribbon;
- playback использует тот же массив, что и публичная лента;
- порядок шагов не вычисляется отдельно во фронтенде;
- атака существа видна как отдельный шаг общей ленты.

## 8. Первый безопасный батч

Первым пакетом правок сделать только:

- расширение `ResolvedRoundAction`;
- перевод `orderedActions` в каноническую `public resolution ribbon`;
- переключение `playback` на тот же массив без второй логики порядка.

Этот батч уже убирает главный логический разрыв:

- один резолв;
- один публичный порядок;
- один playback поверх того же порядка.

## 9. Что не делать в первом батче

- не сносить радикально `boardModel`;
- не делать большой rename всех `ribbonEntries`;
- не переносить сразу всю визуальную модель поля;
- не смешивать этот рефактор с дополнительными rule changes.

## 10. Критерий готовности

Рефактор можно считать успешно проведённым, когда:

- private draft ribbon и public resolution ribbon явно разделены;
- `orderedActions` является каноническим публичным порядком раунда;
- playback строится только по `orderedActions`;
- фронтенд не придумывает отдельный публичный порядок поверх `game-core`;
- документация больше не конфликтует по этому вопросу.
