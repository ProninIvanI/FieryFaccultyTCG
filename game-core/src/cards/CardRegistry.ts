import { CardDefinition } from '../types';

export class CardRegistry {
  private definitions = new Map<string, CardDefinition>();

  constructor(defs: CardDefinition[] = []) {
    defs.forEach((def) => this.definitions.set(def.id, def));
  }

  add(def: CardDefinition): void {
    this.definitions.set(def.id, def);
  }

  get(definitionId: string): CardDefinition | undefined {
    return this.definitions.get(definitionId);
  }
}
