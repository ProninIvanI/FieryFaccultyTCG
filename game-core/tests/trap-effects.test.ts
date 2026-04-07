import { describe, expect, it } from 'vitest';
import { CardRegistry } from '../src/cards/CardRegistry';
import { GameEngine } from '../src/engine/GameEngine';
import { createInitialState } from '../src/engine/createInitialState';
import { CardDefinition, CastSpellAction, EndTurnAction } from '../src/types';

const definitions: CardDefinition[] = [
  {
    id: 'trap',
    name: 'Trap',
    type: 'spell',
    manaCost: 1,
    speed: 3,
    targetType: 'enemyCharacter',
    resolutionRole: 'control_spell',
    effects: [{ type: 'TrapOnOffensiveActionEffect', value: 3 }],
  },
  {
    id: 'fireball',
    name: 'Fireball',
    type: 'spell',
    manaCost: 1,
    speed: 5,
    targetType: 'enemyCharacter',
    resolutionRole: 'offensive_spell',
    effects: [{ type: 'DamageEffect', value: 4, attackType: 'spell' }],
  },
];

describe('game-core trap effects', () => {
  it('damages trapped mage on the next offensive action', () => {
    const registry = new CardRegistry(definitions);
    const state = createInitialState(1, [
      { playerId: 'player_1', characterId: 'char_1', deck: [] },
      { playerId: 'player_2', characterId: 'char_2', deck: [] },
    ]);

    state.players.player_1.mana = 10;
    state.players.player_2.mana = 10;
    state.cardInstances.card_trap = {
      instanceId: 'card_trap',
      ownerId: 'player_1',
      definitionId: 'trap',
      location: 'hand',
    };
    state.cardInstances.card_fireball = {
      instanceId: 'card_fireball',
      ownerId: 'player_2',
      definitionId: 'fireball',
      location: 'hand',
    };
    state.hands.player_1 = ['card_trap'];
    state.hands.player_2 = ['card_fireball'];

    const engine = new GameEngine(state, registry);

    const trapAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_1',
      playerId: 'player_1',
      cardInstanceId: 'card_trap',
      targetId: 'char_2',
      targetType: 'enemyCharacter',
    };
    const fireballAction: CastSpellAction = {
      type: 'CastSpell',
      actorId: 'char_2',
      playerId: 'player_2',
      cardInstanceId: 'card_fireball',
      targetId: 'char_1',
      targetType: 'enemyCharacter',
    };
    const endTurn: EndTurnAction = {
      type: 'EndTurn',
      actorId: 'char_1',
      playerId: 'player_1',
    };

    expect(engine.processAction(trapAction)).toEqual({ ok: true });
    expect(engine.processAction(endTurn)).toEqual({ ok: true });
    expect(engine.processAction(fireballAction)).toEqual({ ok: true });

    expect(state.characters.char_2.hp).toBe(17);
    expect(state.characters.char_1.hp).toBe(16);
    expect(state.characters.char_2.trapOnOffensiveActionCharges).toBe(0);
  });
});

