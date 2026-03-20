import { EffectInstance, EffectId } from '../types';

export class EffectQueue {
  private queue: EffectId[] = [];
  private storage: Map<EffectId, EffectInstance> = new Map();

  enqueue(effect: EffectInstance): void {
    this.queue.push(effect.effectId);
    this.storage.set(effect.effectId, effect);
  }

  dequeue(): EffectInstance | null {
    const id = this.queue.shift();
    if (!id) {
      return null;
    }
    const effect = this.storage.get(id) ?? null;
    if (effect) {
      this.storage.delete(id);
    }
    return effect;
  }

  snapshot(): { queue: EffectId[]; effects: Record<EffectId, EffectInstance> } {
    const effects: Record<EffectId, EffectInstance> = {};
    this.storage.forEach((value, key) => {
      effects[key] = value;
    });
    return { queue: [...this.queue], effects };
  }
}
