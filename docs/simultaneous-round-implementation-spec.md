# Спецификация: simultaneous resolution PvP

Дата: 2026-03-25
Статус: implemented baseline, living spec

## 1. Цель

Перевести PvP в `FieryFaccultyTCG` с немедленного `turn/action/endTurn` на скрытый раунд с одновременным выбором действий:

- оба игрока собирают свои действия независимо;
- до `lock-in` не видят содержимое очереди соперника;
- после `lock-in` обе очереди передаются в `game-core`;
- `game-core` валидирует, раскладывает действия по слоям и детерминированно резолвит раунд;
- frontend показывает порядок выбора, но не обещает FIFO-резолв по визуальному порядку.

## 2. Source of truth

- `frontend` отвечает только за локальное UI-состояние вокруг боевой ленты:
  - выбор карты или действия закреплённого объекта;
  - выбор цели через клики по подсвеченным сущностям на поле;
  - удаление собственного действия из боевой ленты до `lock-in`;
  - `lock-in`;
  - показ результата после server/core resolution.
- `server` отвечает за:
  - приём и валидацию DTO;
  - хранение скрытых draft-очередей по игрокам;
  - синхронизацию `lock-in`;
  - запуск резолва только когда оба игрока зафиксировали раунд;
  - рассылку скрытого статуса и итогового outcome.
- `game-core` отвечает за:
  - допустимость действия в рамках правил;
  - определение слоя резолва;
  - приоритет внутри слоя;
  - `summoning sickness`;
  - `fizzle/reject` поведение;
  - cleanup и итоговый `GameState`.

## 3. Финальные правила раунда

### 3.1. Жизненный цикл раунда

Раунд PvP проходит через состояния:

1. `draft`
2. `locked_waiting`
3. `resolving`
4. `resolved`
5. `next_round`

Правила:

- в `draft` игрок может свободно менять свою очередь;
- `lock-in` фиксирует очередь игрока для текущего номера раунда;
- если locked только один игрок, матч переходит в `locked_waiting`;
- резолв начинается только когда locked оба игрока;
- после резолва выполняется cleanup и открывается следующий раунд;
- отдельный `EndTurn` для PvP больше не является пользовательским действием.

### 3.2. Видимость и скрытая информация

- до завершения резолва frontend не получает содержимое очереди соперника;
- до завершения резолва соперник может видеть только:
  - `ready / not ready`;
  - опционально число действий в очереди, если это будет отдельно подтверждено позже;
- `server` не должен утекать скрытую очередь через:
  - полный snapshot;
  - debug payload;
  - replay feed до reveal;
  - служебные DTO.

### 3.3. Слои резолва

Фиксируем целевой порядок:

1. `summon`
2. `defensive_modifiers`
3. `defensive_spells`
4. `other_modifiers`
5. `offensive_control_spells`
6. `attacks`
7. `cleanup_end_of_round`

### 3.4. Порядок внутри слоя

Порядок внутри одного слоя должен быть детерминированным:

1. `priority/speed` по убыванию;
2. `queueIndex` по возрастанию;
3. `roundInitiativePlayerId`;
4. стабильный tie-breaker `game-core` по `actorId` и `intentId`.

Решение по инициативе:

- у раунда есть `roundInitiativePlayerId`;
- инициатива чередуется по раундам;
- инициатива нужна только как tie-breaker, а не как замена simultaneous-модели.

### 3.5. Summoning sickness

- существо, призванное в раунде `N`, не может попасть в слой `attacks` этого же раунда;
- такое существо может существовать на столе уже в текущем раунде и быть:
  - целью заклинаний;
  - целью модификаторов;
  - объектом cleanup;
- возможность контратаковать в тот же раунд не добавляется без отдельного правила.

### 3.6. Reject vs fizzle

Нужно разделять два класса неуспеха:

- `rejected`:
  - intent был недопустим уже на snapshot начала раунда;
  - пример: карта не в руке, не хватает маны, превышен лимит существ, некорректный источник;
  - такой раунд не должен тихо исполняться частично без явного решения;
  - первая реализация: отклоняем `lock-in` игрока и возвращаем ошибки до резолва.
- `fizzled`:
  - intent был валиден на старте раунда, но цель стала невалидной во время резолва;
  - пример: цель умерла раньше своего слоя;
  - действие остаётся в истории раунда как `fizzled`, а не исчезает.

### 3.7. Ресурсы и лимиты

- число действий за раунд ограничивается не UI, а правилами `game-core`;
- базовые ограничения:
  - мана;
  - action budget на раунд;
  - лимиты зон, например число существ на столе;
- frontend может предупреждать о проблеме, но авторитетная проверка всегда в `game-core`.

## 4. Модель данных для реализации

### 4.1. Новые типы `game-core`

```ts
export type ResolutionLayer =
  | 'summon'
  | 'defensive_modifiers'
  | 'defensive_spells'
  | 'other_modifiers'
  | 'offensive_control_spells'
  | 'attacks'
  | 'cleanup_end_of_round';

export type RoundStatus =
  | 'draft'
  | 'locked_waiting'
  | 'resolving'
  | 'resolved';

export interface RoundActionIntentTarget {
  targetId?: string;
  targetType?: string;
}

export interface RoundActionIntentBase {
  intentId: string;
  roundNumber: number;
  playerId: string;
  actorId: string;
  queueIndex: number;
  kind: 'Summon' | 'CastSpell' | 'PlayCard' | 'Attack' | 'Evade';
  priority?: number;
}

export interface SummonRoundActionIntent extends RoundActionIntentBase {
  kind: 'Summon';
  cardInstanceId: string;
}

export interface CastSpellRoundActionIntent extends RoundActionIntentBase {
  kind: 'CastSpell';
  cardInstanceId: string;
  target: RoundActionIntentTarget;
}

export interface PlayCardRoundActionIntent extends RoundActionIntentBase {
  kind: 'PlayCard';
  cardInstanceId: string;
  target: RoundActionIntentTarget;
}

export interface AttackRoundActionIntent extends RoundActionIntentBase {
  kind: 'Attack';
  sourceCreatureId: string;
  target: RoundActionIntentTarget;
}

export interface EvadeRoundActionIntent extends RoundActionIntentBase {
  kind: 'Evade';
}

export type RoundActionIntent =
  | SummonRoundActionIntent
  | CastSpellRoundActionIntent
  | PlayCardRoundActionIntent
  | AttackRoundActionIntent
  | EvadeRoundActionIntent;

export interface PlayerRoundDraft {
  playerId: string;
  roundNumber: number;
  locked: boolean;
  intents: RoundActionIntent[];
}

export interface CompiledRoundAction {
  intent: RoundActionIntent;
  layer: ResolutionLayer;
  priority: number;
  roundInitiativePlayerId: string;
}

export interface ResolvedRoundAction {
  intentId: string;
  playerId: string;
  layer: ResolutionLayer;
  status: 'resolved' | 'fizzled';
  summary: string;
}

export interface RoundResolutionResult {
  roundNumber: number;
  orderedActions: ResolvedRoundAction[];
  state: GameState;
}
```

### 4.2. Изменения в `GameState`

Для PvP нужно добавить отдельный раздел round-state:

```ts
export interface PublicRoundPlayerState {
  playerId: string;
  locked: boolean;
  draftCount: number;
}

export interface RoundState {
  number: number;
  status: RoundStatus;
  initiativePlayerId: string;
  players: Record<string, PublicRoundPlayerState>;
  lastResolution?: RoundResolutionResult;
}
```

Дополнительно:

- `turn.activePlayerId` перестаёт быть primary source of truth для PvP;
- для backward compatibility можно временно оставить `turn`, но новый PvP flow должен опираться на `round`;
- существа на столе должны знать `summonedAtRound`.

Пример:

```ts
export interface CreatureState {
  creatureId: string;
  ownerId: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  summonedAtRound?: number;
}
```

## 5. Pipeline в `game-core`

Новый pipeline должен быть отдельным от старого немедленного `processAction(...)`.

### 5.1. API первой итерации

```ts
submitRoundDraft(playerId: string, roundNumber: number, intents: RoundActionIntent[]): ValidationResult
lockRoundDraft(playerId: string, roundNumber: number): ValidationResult
resolveRoundIfReady(): RoundResolutionResult | null
```

### 5.2. Шаги резолва

1. Зафиксировать snapshot начала раунда.
2. Провалидировать оба locked draft на этом snapshot.
3. Если есть ошибки, вернуть ошибки владельцу draft и не начинать резолв.
4. Скомпилировать intents в `CompiledRoundAction`.
5. Для каждого intent определить `ResolutionLayer`.
6. Отсортировать по общим правилам слоя.
7. Последовательно исполнить действия.
8. Для каждого действия записать `resolved` или `fizzled`.
9. Выполнить cleanup слоя `cleanup_end_of_round`.
10. Сохранить `RoundResolutionResult`.
11. Открыть следующий раунд.

### 5.3. Что должно остаться в `game-core`

- классификация карт по слоям;
- разрешение спорных кейсов;
- target invalidation;
- порядок смерти и cleanup;
- детерминированный replay.

В `server` и `frontend` это не дублируется.

## 6. Новый WebSocket-контракт

### 6.1. Клиент -> сервер

```ts
type ClientMessageDto =
  | { type: 'join'; sessionId: string; token: string; deckId: string; seed?: number }
  | { type: 'roundDraft.replace'; roundNumber: number; intents: RoundActionIntentDto[] }
  | { type: 'roundDraft.lock'; roundNumber: number };
```

Первая реализация сознательно не вводит отдельные сетевые команды:

- `add`;
- `remove`;
- `reorder`;
- `unlock`.

Вместо этого frontend локально редактирует свой hidden-round draft за боевой лентой и отправляет целиком `roundDraft.replace`.

### 6.2. Сервер -> клиент

```ts
type ServerMessageDto =
  | { type: 'state'; state: PublicMatchStateDto }
  | { type: 'roundDraft.accepted'; roundNumber: number }
  | { type: 'roundStatus'; roundNumber: number; selfLocked: boolean; opponentLocked: boolean }
  | { type: 'roundResolved'; result: PublicRoundResolutionResultDto }
  | { type: 'error'; error: string };
```

Правила:

- `state` не содержит скрытую очередь соперника;
- `state` для локального игрока может содержать только его собственный draft;
- `roundResolved` содержит уже открытый порядок фактического резолва;
- ошибки `lock-in` должны приходить до `roundResolved`.

### 6.3. Server-side сессия

`GameSession` должен хранить:

- `currentRoundNumber`;
- скрытые `PlayerRoundDraft` по игрокам;
- флаги `locked`;
- публичный round-status;
- последний `RoundResolutionResult`.

## 7. Изменения по слоям

### 7.1. `game-core`

Сначала меняем:

- [game-core/src/types/actions.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/game-core/src/types/actions.ts)
- [game-core/src/types/state.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/game-core/src/types/state.ts)
- [game-core/src/engine/GameEngine.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/game-core/src/engine/GameEngine.ts)

Предлагаемый новый модульный срез:

- `game-core/src/types/round.ts`
- `game-core/src/rounds/compileRoundActions.ts`
- `game-core/src/rounds/sortRoundActions.ts`
- `game-core/src/rounds/resolveRound.ts`
- `game-core/src/rounds/validateRoundDraft.ts`

### 7.2. `server`

Меняем:

- [server/src/transport/ws/dto.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/server/src/transport/ws/dto.ts)
- [server/src/application/GameService.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/server/src/application/GameService.ts)
- [server/src/domain/game/GameSession.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/server/src/domain/game/GameSession.ts)
- [server/src/transport/ws/WsGateway.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/server/src/transport/ws/WsGateway.ts)

Новый server flow:

1. принять `roundDraft.replace`;
2. провалидировать DTO;
3. обновить скрытый draft игрока;
4. принять `roundDraft.lock`;
5. если оба locked, вызвать `game-core.resolveRoundIfReady()`;
6. разослать итоговый `state` и `roundResolved`.

### 7.3. `frontend`

Меняем:

- [frontend/src/types/pvp.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/frontend/src/types/pvp.ts)
- [frontend/src/services/gameWsService.ts](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/frontend/src/services/gameWsService.ts)
- [frontend/src/pages/PlayPvpPage/PlayPvpPage.tsx](/Users/Rumpel/Desktop/проекты/FieryFaccultyTCG/frontend/src/pages/PlayPvpPage/PlayPvpPage.tsx)

Новый frontend flow:

1. игрок собирает локальную боевую ленту как пользовательское представление hidden-round draft;
2. клик по карте из руки сразу добавляет действие в ленту на место, рассчитанное по `game-core`;
3. если действию нужна цель, UI включает режим таргетинга с уже выставленным initial intent из `game-core`;
4. смена цели происходит кликами по подсвеченным сущностям на поле, без отдельной правой панели и без ручного reorder;
5. frontend отправляет `roundDraft.replace` целиком;
6. по кнопке `lock-in` отправляет `roundDraft.lock`;
7. пока нет резолва, UI показывает только:
   - свою боевую ленту;
   - свой locked state;
   - готовность соперника;
8. после `roundResolved` UI показывает фактический порядок резолва и outcome.

## 8. Переходный план внедрения

### Этап 0. Rule freeze

Нужно зафиксировать до кодинга:

- initiative policy;
- видим ли `draftCount` соперника;
- сохраняем ли `actionPoints` как round-budget или заменяем отдельной сущностью;
- как именно `Evade` ложится в resolution layer.

### Этап 1. `game-core`

- ввести новые типы раунда;
- добавить `round` в `GameState`;
- реализовать валидацию draft;
- реализовать compile/sort/resolve pipeline;
- сохранить determinism и replay-пригодность.

### Этап 2. `server`

- заменить `action`-ориентированный PvP contract на round contract;
- хранить скрытые drafts;
- синхронизировать lock обоих игроков;
- слать клиентам только публичный статус и итог.

### Этап 3. `frontend`

- вынести локальный draft-state из немедленного action dispatch;
- собрать core-driven боевую ленту вместо отдельной `action queue`;
- добавить remove/lock UX без ручного reorder;
- показать слой резолва, target и action indicators на карточках ленты;
- после резолва показывать не локальный порядок, а фактический resolved order.

### Этап 4. Cleanup

- удалить legacy `EndTurn` flow из PvP;
- обновить архитектурную документацию;
- обновить replay/debug-представление;
- вычистить старые тесты turn-based PvP.

## 9. План тестирования

### 9.1. `game-core`

Обязательные тесты:

- одинаковый seed + одинаковые drafts => одинаковый итог;
- `summon` всегда раньше `attack`;
- defensive слой раньше offensive;
- `summoning sickness` запрещает атаку в текущем раунде;
- невалидный draft отклоняется до резолва;
- валидный draft может `fizzle` по исчезнувшей цели;
- tie-breaker стабилен между одинаковыми запусками.

### 9.2. `server`

Обязательные тесты:

- сервер не раскрывает очередь соперника;
- `roundResolved` не приходит, пока не locked оба игрока;
- второй `roundDraft.replace` заменяет предыдущий draft игрока;
- reconnect не ломает скрытый draft;
- lock с неправильным `roundNumber` отклоняется.

### 9.3. `frontend`

Обязательные тесты:

- игрок может добавить действие в боевую ленту;
- клик по карте из руки сразу создаёт intent с initial state из `game-core`;
- выбор цели происходит кликом по подсвеченной сущности на поле;
- lock disables дальнейшее редактирование;
- UI не показывает draft соперника;
- UI различает `боевую ленту` и фактический `слой резолва`;
- после резолва показывается фактический порядок исполнения.

## 10. Что делать следующим коммитом

Базовый перевод PvP на hidden-round модель уже реализован сквозным пакетом `game-core -> server -> frontend`.

Текущий практический next step:

1. пройти ручной smoke round-flow в двух реальных клиентах;
2. расширить post-round battle log, если текущего reveal timeline окажется недостаточно для чтения резолва;
3. продолжить rule-completeness в `game-core` для edge cases и cleanup/end-of-round;
4. вернуться к replay/debug поверх уже подготовленного `boardView / boardModel / ribbonEntries`, когда это станет отдельным фокусом.
