import { GameEvent, GameEventPayloadMap, GameEventType } from '../types';

type Handler<T extends GameEventType> = (event: GameEvent<T>) => void;

export class EventBus {
  private handlers: Map<GameEventType, Set<Handler<GameEventType>>> = new Map();
  private seq = 0;

  on<T extends GameEventType>(type: T, handler: Handler<T>): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler as Handler<GameEventType>);
    this.handlers.set(type, set);
    return () => set.delete(handler as Handler<GameEventType>);
  }

  emit<T extends GameEventType>(type: T, payload: GameEventPayloadMap[T]): GameEvent<T> {
    const event: GameEvent<T> = {
      type,
      payload,
      seq: ++this.seq,
    };
    const set = this.handlers.get(type);
    if (set) {
      set.forEach((handler) => handler(event));
    }
    return event;
  }
}
