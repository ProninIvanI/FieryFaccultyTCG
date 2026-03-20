import {
  Action,
  GameState,
  GameLogEntry,
  PhaseType,
} from '../types';
import { EventBus } from '../events/EventBus';
import { EffectQueue } from '../queues/EffectQueue';
import { IdFactory } from '../utils/IdFactory';
import { SeededRng } from '../rng/SeededRng';
import { CardRegistry } from '../cards/CardRegistry';
import { GameEngineContext } from './GameEngineContext';
import { PhaseStateMachine } from '../state-machine/PhaseStateMachine';
import { ActionCommand } from '../actions/ActionCommand';
import { AttackActionCommand } from '../actions/AttackActionCommand';
import { CastSpellActionCommand } from '../actions/CastSpellActionCommand';
import { SummonActionCommand } from '../actions/SummonActionCommand';
import { EvadeActionCommand } from '../actions/EvadeActionCommand';
import { PlayCardActionCommand } from '../actions/PlayCardActionCommand';
import { EndTurnActionCommand } from '../actions/EndTurnActionCommand';
import { EffectHandler } from '../effects/EffectHandler';
import { DamageEffect } from '../effects/DamageEffect';
import { HealEffect } from '../effects/HealEffect';
import { ShieldEffect } from '../effects/ShieldEffect';
import { BuffEffect } from '../effects/BuffEffect';
import { DebuffEffect } from '../effects/DebuffEffect';
import { SummonEffect } from '../effects/SummonEffect';

export class GameEngine {
  private readonly ctx: GameEngineContext;
  private readonly phaseMachine: PhaseStateMachine;
  private readonly commands: Map<Action['type'], ActionCommand>;
  private readonly effectHandlers: Map<string, EffectHandler>;

  constructor(private readonly state: GameState, cardRegistry: CardRegistry) {
    const events = new EventBus();
    const effects = new EffectQueue();
    const ids = new IdFactory();
    const rng = new SeededRng(state.rngSeed);
    this.ctx = new GameEngineContext(events, effects, ids, rng, cardRegistry);
    this.phaseMachine = new PhaseStateMachine(state.phase.current);
    this.commands = new Map<Action['type'], ActionCommand>([
      ['Attack', new AttackActionCommand()],
      ['CastSpell', new CastSpellActionCommand()],
      ['Summon', new SummonActionCommand()],
      ['Evade', new EvadeActionCommand()],
      ['PlayCard', new PlayCardActionCommand()],
      ['EndTurn', new EndTurnActionCommand()],
    ]);
    this.effectHandlers = new Map<string, EffectHandler>([
      ['DamageEffect', new DamageEffect()],
      ['HealEffect', new HealEffect()],
      ['ShieldEffect', new ShieldEffect()],
      ['BuffEffect', new BuffEffect()],
      ['DebuffEffect', new DebuffEffect()],
      ['SummonEffect', new SummonEffect()],
    ]);

    this.ctx.events.on('onDamage', (event) => this.log('damage', event.payload));
    this.ctx.events.on('onSummon', (event) => this.log('summon', event.payload));
    this.ctx.events.on('onEffectTrigger', (event) => this.log('effect', event.payload));
  }

  getState(): GameState {
    return this.state;
  }

  processAction(action: Action): { ok: boolean; errors?: string[] } {
    const command = this.commands.get(action.type);
    if (!command) {
      return { ok: false, errors: ['Unknown action'] };
    }
    const errors = command.validate(action, this.state, this.ctx);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    this.log('action', { action });
    this.state.actionLog.push(action);
    this.ctx.events.emit('onAction', { action });

    command.execute(action, this.state, this.ctx);
    this.resolveEffects();
    this.handleEndOfPhase();
    this.state.rngState = this.ctx.rng.getState();
    return { ok: true };
  }

  private resolveEffects(): void {
    let effect = this.ctx.effects.dequeue();
    while (effect) {
      const handler = this.effectHandlers.get(effect.type);
      if (handler) {
        handler.onApply(effect, this.state, this.ctx);
        handler.onResolve(effect, this.state, this.ctx);
        this.ctx.events.emit('onEffectTrigger', { effectId: effect.effectId });
        if (effect.duration && effect.duration > 0) {
          effect.duration -= 1;
          if (effect.duration === 0) {
            handler.onExpire(effect, this.state, this.ctx);
          } else {
            this.ctx.effects.enqueue(effect);
          }
        }
      }
      effect = this.ctx.effects.dequeue();
    }

    const snapshot = this.ctx.effects.snapshot();
    this.state.effectQueue = snapshot.queue;
    this.state.activeEffects = snapshot.effects;
  }

  private handleEndOfPhase(): void {
    if (this.state.phase.current !== 'EndPhase') {
      return;
    }
    this.ctx.events.emit('onTurnEnd', {
      turn: this.state.turn.number,
      activePlayerId: this.state.turn.activePlayerId,
    });
    this.advanceTurn();
  }

  advancePhase(): PhaseType {
    const next = this.phaseMachine.advance();
    this.state.phase.current = next;
    if (next === 'RecoveryPhase') {
      this.ctx.events.emit('onTurnStart', {
        turn: this.state.turn.number,
        activePlayerId: this.state.turn.activePlayerId,
      });
    }
    return next;
  }

  private advanceTurn(): void {
    const playerIds = Object.keys(this.state.players);
    const currentIndex = playerIds.indexOf(this.state.turn.activePlayerId);
    const nextIndex = (currentIndex + 1) % playerIds.length;
    this.state.turn = {
      number: this.state.turn.number + 1,
      activePlayerId: playerIds[nextIndex],
    };
    this.prepareTurn();
  }

  private prepareTurn(): void {
    const activePlayer = this.state.players[this.state.turn.activePlayerId];
    activePlayer.actionPoints = 2;
    activePlayer.mana = Math.min(activePlayer.maxMana, activePlayer.mana + 1);

    this.phaseMachine.reset();
    this.phaseMachine.advance();
    this.state.phase.current = this.phaseMachine.advance();
  }

  private log(type: GameLogEntry['type'], payload: Record<string, unknown>): void {
    const entry: GameLogEntry = {
      seq: this.state.log.length + 1,
      type,
      payload,
    };
    this.state.log.push(entry);
  }
}
