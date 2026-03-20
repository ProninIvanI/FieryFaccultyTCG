import { EventBus } from '../events/EventBus';
import { EffectQueue } from '../queues/EffectQueue';
import { IdFactory } from '../utils/IdFactory';
import { SeededRng } from '../rng/SeededRng';
import { CardRegistry } from '../cards/CardRegistry';

export class GameEngineContext {
  constructor(
    readonly events: EventBus,
    readonly effects: EffectQueue,
    readonly ids: IdFactory,
    readonly rng: SeededRng,
    readonly cards: CardRegistry
  ) {}
}
