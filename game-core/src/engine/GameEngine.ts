import {
  Action,
  AttackAction,
  CastSpellAction,
  EvadeAction,
  GameState,
  GameLogEntry,
  PhaseType,
  PlayCardAction,
  PlayerRoundDraft,
  ResolvedRoundAction,
  RoundActionIntent,
  RoundActionReasonCode,
  RoundDraftValidationResult,
  RoundResolutionResult,
  PlayerBoardModel,
  PublicBoardView,
  SummonAction,
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
import { CannotEvadeEffect } from '../effects/CannotEvadeEffect';
import { SkipActionEffect } from '../effects/SkipActionEffect';
import { InterruptSlowSpellEffect } from '../effects/InterruptSlowSpellEffect';
import { TrapOnOffensiveActionEffect } from '../effects/TrapOnOffensiveActionEffect';
import { NextSpellDamageBoostEffect } from '../effects/NextSpellDamageBoostEffect';
import { NextSpellSpeedBoostEffect } from '../effects/NextSpellSpeedBoostEffect';
import { NextSpellIgnoreShieldEffect } from '../effects/NextSpellIgnoreShieldEffect';
import { NextSpellIgnoreEvadeEffect } from '../effects/NextSpellIgnoreEvadeEffect';
import { NextSpellManaDiscountEffect } from '../effects/NextSpellManaDiscountEffect';
import { NextSpellRepeatEffect } from '../effects/NextSpellRepeatEffect';
import { RestoreManaEffect } from '../effects/RestoreManaEffect';
import { DrawCardEffect } from '../effects/DrawCardEffect';
import { NextAttackDamageBoostEffect } from '../effects/NextAttackDamageBoostEffect';
import { RoundSpeedBuffEffect } from '../effects/RoundSpeedBuffEffect';
import { drawCards, STARTING_ACTION_POINTS } from './createInitialState';
import { compileRoundActions } from '../rounds/compileRoundActions';
import { sortRoundActions } from '../rounds/sortRoundActions';
import { validateRoundDraft } from '../rounds/validateRoundDraft';
import { validateTargetType } from '../validation/validators';
import {
  buildBoardItems,
  buildPlayerBoardModel as buildPlayerBoardModelView,
  buildPublicRibbonEntries,
} from '../board/buildPlayerBoardModel';

export class GameEngine {
  private readonly ctx: GameEngineContext;
  private readonly phaseMachine: PhaseStateMachine;
  private readonly commands: Map<Action['type'], ActionCommand>;
  private readonly effectHandlers: Map<string, EffectHandler>;
  private readonly roundDrafts = new Map<string, PlayerRoundDraft>();

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
      ['CannotEvadeEffect', new CannotEvadeEffect()],
      ['SkipActionEffect', new SkipActionEffect()],
      ['InterruptSlowSpellEffect', new InterruptSlowSpellEffect()],
      ['TrapOnOffensiveActionEffect', new TrapOnOffensiveActionEffect()],
      ['NextSpellDamageBoostEffect', new NextSpellDamageBoostEffect()],
      ['NextSpellSpeedBoostEffect', new NextSpellSpeedBoostEffect()],
      ['NextSpellIgnoreShieldEffect', new NextSpellIgnoreShieldEffect()],
      ['NextSpellIgnoreEvadeEffect', new NextSpellIgnoreEvadeEffect()],
      ['NextSpellManaDiscountEffect', new NextSpellManaDiscountEffect()],
      ['NextSpellRepeatEffect', new NextSpellRepeatEffect()],
      ['RestoreManaEffect', new RestoreManaEffect()],
      ['DrawCardEffect', new DrawCardEffect()],
      ['NextAttackDamageBoostEffect', new NextAttackDamageBoostEffect()],
      ['RoundSpeedBuffEffect', new RoundSpeedBuffEffect()],
    ]);

    this.ctx.events.on('onDamage', (event) => this.log('damage', event.payload));
    this.ctx.events.on('onSummon', (event) => this.log('summon', event.payload));
    this.ctx.events.on('onEffectTrigger', (event) => this.log('effect', event.payload));
  }

  getState(): GameState {
    return this.state;
  }

  getRoundDraft(playerId: string): PlayerRoundDraft | null {
    const draft = this.roundDrafts.get(playerId);
    return draft ? this.cloneDraft(draft) : null;
  }

  buildPlayerBoardModel(playerId: string): PlayerBoardModel | null {
    if (!this.state.players[playerId]) {
      return null;
    }

    const currentDraft = this.roundDrafts.get(playerId);
    const fallbackDraft: PlayerRoundDraft = {
      playerId,
      roundNumber: this.state.round.number,
      locked: this.state.round.players[playerId]?.locked ?? false,
      intents: [],
    };

    return buildPlayerBoardModelView(
      this.state,
      this.ctx.cards,
      currentDraft ? this.cloneDraft(currentDraft) : fallbackDraft,
      this.state.round.lastResolution,
    );
  }

  buildPublicBoardView(): PublicBoardView {
    const players = Object.keys(this.state.players).reduce<PublicBoardView['players']>(
      (acc, playerId) => {
        const boardItems = buildBoardItems(this.state, this.ctx.cards, playerId);
        acc[playerId] = {
          playerId,
          boardItems,
          ribbonEntries: buildPublicRibbonEntries(boardItems),
        };
        return acc;
      },
      {},
    );

    return { players };
  }

  submitRoundDraft(
    playerId: string,
    roundNumber: number,
    intents: RoundActionIntent[],
  ): RoundDraftValidationResult {
    if (!this.state.players[playerId]) {
      return {
        ok: false,
        errors: [{ code: 'player_not_found', message: 'Player not found for round draft' }],
      };
    }

    if (this.state.round.status === 'resolving') {
      return {
        ok: false,
        errors: [{ code: 'round_resolving', message: 'Round is currently resolving' }],
      };
    }

    const publicRoundState = this.state.round.players[playerId];
    if (publicRoundState?.locked) {
      return {
        ok: false,
        errors: [{ code: 'draft_locked', message: 'Locked round draft cannot be replaced' }],
      };
    }

    const draft: PlayerRoundDraft = {
      playerId,
      roundNumber,
      locked: false,
      intents: intents.map((intent) => this.cloneIntent(intent)),
    };

    const validation = validateRoundDraft(this.state, this.ctx.cards, draft);
    if (!validation.ok) {
      return validation;
    }

    this.roundDrafts.set(playerId, draft);
    this.syncPublicRoundState(playerId, draft.intents.length, false);
    this.refreshRoundStatus();
    return { ok: true };
  }

  lockRoundDraft(playerId: string, roundNumber: number): RoundDraftValidationResult {
    if (!this.state.players[playerId]) {
      return {
        ok: false,
        errors: [{ code: 'player_not_found', message: 'Player not found for round draft' }],
      };
    }

    const existingDraft = this.roundDrafts.get(playerId) ?? {
      playerId,
      roundNumber,
      locked: false,
      intents: [],
    };

    if (existingDraft.roundNumber !== roundNumber) {
      return {
        ok: false,
        errors: [{
          code: 'round_number',
          message: `Round draft number ${roundNumber} does not match stored round ${existingDraft.roundNumber}`,
        }],
      };
    }

    if (existingDraft.locked) {
      return { ok: true };
    }

    const validation = validateRoundDraft(this.state, this.ctx.cards, existingDraft);
    if (!validation.ok) {
      return validation;
    }

    const lockedDraft: PlayerRoundDraft = {
      ...existingDraft,
      locked: true,
      intents: existingDraft.intents.map((intent) => this.cloneIntent(intent)),
    };
    this.roundDrafts.set(playerId, lockedDraft);
    this.syncPublicRoundState(playerId, lockedDraft.intents.length, true);
    this.refreshRoundStatus();
    return { ok: true };
  }

  resolveRoundIfReady(): RoundResolutionResult | null {
    const playerIds = Object.keys(this.state.players);
    if (
      playerIds.length === 0 ||
      playerIds.some((playerId) => !this.roundDrafts.get(playerId)?.locked)
    ) {
      return null;
    }

    this.state.round.status = 'resolving';

    const allIntents = playerIds.flatMap((playerId) => {
      const draft = this.roundDrafts.get(playerId);
      return draft ? draft.intents.map((intent) => this.cloneIntent(intent)) : [];
    });

    const compiled = sortRoundActions(
      compileRoundActions(
        allIntents,
        this.state,
        this.ctx.cards,
        this.state.round.initiativePlayerId,
      ),
    );

    const orderedActions = compiled.map((compiledAction) =>
      this.resolveCompiledRoundAction(compiledAction.intent, compiledAction.layer),
    );

    this.cleanupDefeatedCreatures();

    const result: RoundResolutionResult = {
      roundNumber: this.state.round.number,
      orderedActions,
    };

    this.finishResolvedRound(result);
    this.state.rngState = this.ctx.rng.getState();
    return result;
  }

  processAction(action: Action): { ok: boolean; errors?: string[] } {
    const command = this.commands.get(action.type);
    if (!command) {
      return { ok: false, errors: ['Unknown action'] };
    }
    if (
      action.type === 'CastSpell' &&
      this.consumeInterruptedSpell(action.actorId, action.cardInstanceId)
    ) {
      return { ok: false, errors: ['Spell was interrupted'] };
    }
    if (action.type !== 'EndTurn' && this.consumeSkippedAction(action.actorId, action.playerId)) {
      return { ok: false, errors: ['Actor skips this action'] };
    }
    const errors = command.validate(action, this.state, this.ctx);
    if (errors.length > 0) {
      return { ok: false, errors };
    }

    this.executeValidatedAction(action, command);
    return { ok: true };
  }

  private resolveEffects(): void {
    const deferredEffects = [];
    let effect = this.ctx.effects.dequeue();
    while (effect) {
      const triggerOnTurn = Number(effect.data?.triggerOnTurn ?? 0);
      if (triggerOnTurn > this.state.turn.number) {
        deferredEffects.push(effect);
        effect = this.ctx.effects.dequeue();
        continue;
      }

      const handler = this.effectHandlers.get(effect.type);
      if (handler) {
        handler.onApply(effect, this.state, this.ctx);
        handler.onResolve(effect, this.state, this.ctx);
        this.ctx.events.emit('onEffectTrigger', { effectId: effect.effectId });
        if (effect.data?.repeatNextTurn === true) {
          this.ctx.effects.enqueue({
            ...effect,
            effectId: this.ctx.ids.next('effect'),
            createdAtTurn: this.state.turn.number + 1,
            data: {
              ...effect.data,
              repeatNextTurn: false,
              triggerOnTurn: this.state.turn.number + 1,
            },
          });
        }
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

    deferredEffects.forEach((deferredEffect) => {
      this.ctx.effects.enqueue(deferredEffect);
    });

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
    this.state.round.number = this.state.turn.number;
    this.state.round.status = 'draft';
    this.state.round.initiativePlayerId = playerIds[(this.state.round.number - 1) % playerIds.length] ?? playerIds[0];
    Object.values(this.state.round.players).forEach((playerRoundState) => {
      playerRoundState.locked = false;
      playerRoundState.draftCount = 0;
    });
    this.state.round.lastResolution = undefined;
    this.cleanupRoundSpeedBonuses(this.state.turn.number);
    this.prepareTurn();
    this.resolveEffects();
  }

  private prepareTurn(): void {
    const activePlayer = this.state.players[this.state.turn.activePlayerId];
    activePlayer.actionPoints = 3;
    activePlayer.mana = Math.min(activePlayer.maxMana, activePlayer.mana + 1);

    this.phaseMachine.reset();
    this.phaseMachine.advance();
    this.state.phase.current = this.phaseMachine.advance();
  }

  private executeValidatedAction(action: Action, command: ActionCommand): void {
    this.log('action', { action });
    this.state.actionLog.push(action);
    this.ctx.events.emit('onAction', { action });

    this.applyTrapOnOffensiveAction(action);
    command.execute(action, this.state, this.ctx);
    this.resolveEffects();
    this.handleEndOfPhase();
    this.state.rngState = this.ctx.rng.getState();
  }

  private resolveCompiledRoundAction(
    intent: RoundActionIntent,
    layer: ResolvedRoundAction['layer'],
  ): ResolvedRoundAction {
    const fizzleReason = this.getIntentFizzleReason(intent);
    if (fizzleReason) {
      return {
        intentId: intent.intentId,
        playerId: intent.playerId,
        layer,
        status: 'fizzled',
        reasonCode: fizzleReason,
        summary: `${intent.kind} fizzled before resolution`,
      };
    }

    const action = this.buildActionFromIntent(intent);
    if (!action) {
      return {
        intentId: intent.intentId,
        playerId: intent.playerId,
        layer,
        status: 'fizzled',
        reasonCode: 'invalid_intent',
        summary: `${intent.kind} fizzled before resolution`,
      };
    }

    const command = this.commands.get(action.type);
    if (!command) {
      return {
        intentId: intent.intentId,
        playerId: intent.playerId,
        layer,
        status: 'fizzled',
        reasonCode: 'command_unavailable',
        summary: `${intent.kind} has no command handler`,
      };
    }

    this.executeValidatedAction(action, command);
    return {
      intentId: intent.intentId,
      playerId: intent.playerId,
      layer,
      status: 'resolved',
      reasonCode: 'resolved',
      summary: `${intent.kind} resolved in layer ${layer}`,
    };
  }

  private buildActionFromIntent(intent: RoundActionIntent): Action | null {
    switch (intent.kind) {
      case 'Summon': {
        const action: SummonAction = {
          type: 'Summon',
          actorId: String(intent.actorId),
          playerId: intent.playerId,
          cardInstanceId: intent.cardInstanceId,
        };
        return action;
      }
      case 'CastSpell': {
        const instance = this.state.cardInstances[intent.cardInstanceId];
        const definition = instance ? this.ctx.cards.get(instance.definitionId) : undefined;
        const action: CastSpellAction = {
          type: 'CastSpell',
          actorId: String(intent.actorId),
          playerId: intent.playerId,
          cardInstanceId: intent.cardInstanceId,
          targetId: intent.target.targetId,
          targetType: intent.target.targetType ?? definition?.targetType ?? 'any',
        };
        return action;
      }
      case 'PlayCard': {
        const instance = this.state.cardInstances[intent.cardInstanceId];
        const definition = instance ? this.ctx.cards.get(instance.definitionId) : undefined;
        const action: PlayCardAction = {
          type: 'PlayCard',
          actorId: String(intent.actorId),
          playerId: intent.playerId,
          cardInstanceId: intent.cardInstanceId,
          targetId: intent.target.targetId,
          targetType: intent.target.targetType ?? definition?.targetType ?? 'any',
        };
        return action;
      }
      case 'Attack': {
        const source = this.state.creatures[intent.sourceCreatureId];
        const targetId = intent.target.targetId;
        if (!source || !targetId) {
          return null;
        }
        const action: AttackAction = {
          type: 'Attack',
          actorId: String(intent.actorId),
          playerId: intent.playerId,
          targetId,
          attackType: 'creature',
          speed: source.speed,
          power: source.attack,
        };
        return action;
      }
      case 'Evade': {
        const action: EvadeAction = {
          type: 'Evade',
          actorId: String(intent.actorId),
          playerId: intent.playerId,
        };
        return action;
      }
    }
  }

  private getIntentFizzleReason(
    intent: RoundActionIntent,
  ): Exclude<RoundActionReasonCode, 'resolved' | 'invalid_intent' | 'command_unavailable'> | null {
    switch (intent.kind) {
      case 'Summon': {
        if (this.consumeSkippedAction(String(intent.actorId), intent.playerId)) {
          return 'action_skipped';
        }
        const instance = this.state.cardInstances[intent.cardInstanceId];
        if (!instance || instance.ownerId !== intent.playerId || instance.location !== 'hand') {
          return 'card_unavailable';
        }

        const definition = this.ctx.cards.get(instance.definitionId);
        if (!definition) {
          return 'card_definition_missing';
        }

        return definition.type === 'creature' ? null : 'card_unavailable';
      }
      case 'CastSpell':
      case 'PlayCard': {
        if (this.consumeSkippedAction(String(intent.actorId), intent.playerId)) {
          return 'action_skipped';
        }
        const instance = this.state.cardInstances[intent.cardInstanceId];
        if (!instance || instance.ownerId !== intent.playerId || instance.location !== 'hand') {
          return 'card_unavailable';
        }
        const definition = this.ctx.cards.get(instance.definitionId);
        if (!definition) {
          return 'card_definition_missing';
        }
        if (
          intent.kind === 'CastSpell' &&
          this.consumeInterruptedSpell(String(intent.actorId), intent.cardInstanceId)
        ) {
          return 'interrupted';
        }
        return validateTargetType(
          this.state,
          String(intent.actorId),
          intent.target.targetId,
          definition.targetType,
        ).length === 0
          ? null
          : 'target_invalidated';
      }
      case 'Attack': {
        if (this.consumeSkippedAction(String(intent.actorId), intent.playerId)) {
          return 'action_skipped';
        }
        const source = this.state.creatures[intent.sourceCreatureId];
        const targetId = intent.target.targetId;
        if (!source || source.ownerId !== intent.playerId) {
          return 'attack_source_unavailable';
        }

        if (source.summonedAtRound === this.state.round.number) {
          return 'summoning_sickness';
        }

        if (!targetId) {
          return 'target_invalidated';
        }

        return this.state.characters[targetId] || this.state.creatures[targetId]
          ? null
          : 'target_invalidated';
      }
      case 'Evade': {
        if (this.consumeSkippedAction(String(intent.actorId), intent.playerId)) {
          return 'action_skipped';
        }
        const character = this.state.characters[String(intent.actorId)];
        const creature = this.state.creatures[String(intent.actorId)];
        if (
          (character && character.ownerId === intent.playerId) ||
          (creature && creature.ownerId === intent.playerId)
        ) {
          if (
            character &&
            typeof character.cannotEvadeUntilTurn === 'number' &&
            this.state.turn.number <= character.cannotEvadeUntilTurn
          ) {
            return 'evade_disabled';
          }

          return null;
        }
        return 'actor_unavailable';
      }
    }
  }

  private consumeSkippedAction(actorId: string, playerId: string): boolean {
    const character = this.state.characters[actorId];
    if (character && character.ownerId === playerId && character.skipNextAction === true) {
      character.skipNextAction = false;
      const player = this.state.players[playerId];
      if (player) {
        player.actionPoints = Math.max(0, player.actionPoints - 1);
      }
      return true;
    }

    const creature = this.state.creatures[actorId];
    if (creature && creature.ownerId === playerId && creature.skipNextAction === true) {
      creature.skipNextAction = false;
      return true;
    }

    return false;
  }

  private consumeInterruptedSpell(actorId: string, cardInstanceId: string): boolean {
    const character = this.state.characters[actorId];
    if (!character) {
      return false;
    }

    if (
      character.interruptSpellUntilRound !== this.state.round.number ||
      Number(character.interruptSpellCharges ?? 0) <= 0
    ) {
      return false;
    }

    const instance = this.state.cardInstances[cardInstanceId];
    const definition = instance ? this.ctx.cards.get(instance.definitionId) : undefined;
    if (!definition) {
      return false;
    }

    const threshold = Number(character.interruptSpellBelowSpeed ?? 0);
    if (definition.speed >= threshold) {
      return false;
    }

    character.interruptSpellCharges = Math.max(0, Number(character.interruptSpellCharges ?? 0) - 1);
    if (character.interruptSpellCharges === 0) {
      character.interruptSpellBelowSpeed = undefined;
      character.interruptSpellUntilRound = undefined;
    }

    return true;
  }

  private applyTrapOnOffensiveAction(action: Action): void {
    if (action.type !== 'CastSpell' && action.type !== 'PlayCard') {
      return;
    }

    const character = this.state.characters[action.actorId];
    if (
      !character ||
      Number(character.trapOnOffensiveActionCharges ?? 0) <= 0 ||
      !this.isOffensiveAction(action)
    ) {
      return;
    }

    const damage = Number(character.trapOnOffensiveActionDamage ?? 0);
    if (damage > 0) {
      this.ctx.effects.enqueue({
        effectId: this.ctx.ids.next('effect'),
        type: 'DamageEffect',
        sourceId: action.actorId,
        targetId: action.actorId,
        createdAtTurn: this.state.turn.number,
        data: {
          value: damage,
          attackType: 'spell',
        },
      });
    }

    character.trapOnOffensiveActionCharges = Math.max(
      0,
      Number(character.trapOnOffensiveActionCharges ?? 0) - 1,
    );
    if (character.trapOnOffensiveActionCharges === 0) {
      character.trapOnOffensiveActionDamage = undefined;
    }
  }

  private isOffensiveAction(action: Extract<Action, { type: 'CastSpell' | 'PlayCard' }>): boolean {
    const instance = this.state.cardInstances[action.cardInstanceId];
    const definition = instance ? this.ctx.cards.get(instance.definitionId) : undefined;
    if (!definition) {
      return false;
    }

    if (action.type === 'CastSpell') {
      return definition.resolutionRole === 'offensive_spell';
    }

    return definition.modifierKind === 'offense' || definition.artKind === 'attack_art';
  }

  private cleanupRoundSpeedBonuses(currentRound: number): void {
    Object.values(this.state.creatures).forEach((creature) => {
      if (
        typeof creature.roundSpeedBonusUntilRound === 'number' &&
        creature.roundSpeedBonusUntilRound < currentRound &&
        Number(creature.roundSpeedBonus ?? 0) !== 0
      ) {
        creature.speed = Math.max(0, creature.speed - Number(creature.roundSpeedBonus ?? 0));
        creature.roundSpeedBonus = undefined;
        creature.roundSpeedBonusUntilRound = undefined;
      }
    });
  }

  private cleanupDefeatedCreatures(): void {
    Object.entries(this.state.creatures).forEach(([creatureId, creature]) => {
      if (creature.hp <= 0) {
        delete this.state.creatures[creatureId];
      }
    });
  }

  private finishResolvedRound(result: RoundResolutionResult): void {
    const playerIds = Object.keys(this.state.players);
    const nextRoundNumber = this.state.round.number + 1;
    const nextInitiativePlayerId = playerIds[(nextRoundNumber - 1) % playerIds.length] ?? playerIds[0];

    this.roundDrafts.clear();
    Object.values(this.state.round.players).forEach((playerRoundState) => {
      playerRoundState.locked = false;
      playerRoundState.draftCount = 0;
    });
    Object.values(this.state.players).forEach((player) => {
      player.actionPoints = STARTING_ACTION_POINTS;
      player.mana = Math.min(player.maxMana, player.mana + 1);
      drawCards(this.state, player.playerId, 1);
    });

    this.state.round.number = nextRoundNumber;
    this.state.round.status = 'draft';
    this.state.round.initiativePlayerId = nextInitiativePlayerId;
    this.state.round.lastResolution = result;
    this.state.turn.number = nextRoundNumber;
    this.state.turn.activePlayerId = nextInitiativePlayerId;
    this.cleanupRoundSpeedBonuses(nextRoundNumber);
    this.resolveEffects();
  }

  private refreshRoundStatus(): void {
    const publicStates = Object.values(this.state.round.players);
    if (this.state.round.status === 'resolving') {
      return;
    }
    this.state.round.status = publicStates.some((playerState) => playerState.locked)
      ? 'locked_waiting'
      : 'draft';
  }

  private syncPublicRoundState(playerId: string, draftCount: number, locked: boolean): void {
    this.state.round.players[playerId] = {
      playerId,
      locked,
      draftCount,
    };
  }

  private cloneDraft(draft: PlayerRoundDraft): PlayerRoundDraft {
    return {
      playerId: draft.playerId,
      roundNumber: draft.roundNumber,
      locked: draft.locked,
      intents: draft.intents.map((intent) => this.cloneIntent(intent)),
    };
  }

  private cloneIntent(intent: RoundActionIntent): RoundActionIntent {
    switch (intent.kind) {
      case 'Summon':
        return { ...intent };
      case 'CastSpell':
      case 'PlayCard':
        return { ...intent, target: { ...intent.target } };
      case 'Attack':
        return { ...intent, target: { ...intent.target } };
      case 'Evade':
        return { ...intent };
    }
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
