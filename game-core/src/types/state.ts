import { Action } from './actions';
import { CardInstance } from './cards';
import { PhaseType } from './enums';
import { EffectInstance } from './effects';
import { RoundState } from './round';
import {
  CardInstanceId,
  CharacterId,
  CreatureId,
  PlayerId,
} from './ids';

export interface ShieldState {
  energy: number;
  concentrationCost: number;
}

export interface PlayerState {
  playerId: PlayerId;
  characterId: CharacterId;
  mana: number;
  maxMana: number;
  actionPoints: number;
}

export interface CharacterState {
  characterId: CharacterId;
  ownerId: PlayerId;
  hp: number;
  maxHp: number;
  dexterity: number;
  concentration: number;
  shield?: ShieldState;
}

export interface CreatureState {
  creatureId: CreatureId;
  ownerId: PlayerId;
  sourceCardInstanceId?: CardInstanceId;
  definitionId?: string;
  hp: number;
  maxHp: number;
  attack: number;
  speed: number;
  summonedAtRound?: number;
}

export interface DeckState {
  ownerId: PlayerId;
  cards: CardInstanceId[];
}

export interface TurnState {
  number: number;
  activePlayerId: PlayerId;
}

export interface PhaseState {
  current: PhaseType;
}

export interface GameLogEntry {
  seq: number;
  type: 'action' | 'damage' | 'summon' | 'effect';
  payload: Record<string, unknown>;
}

export interface GameState {
  players: Record<PlayerId, PlayerState>;
  characters: Record<CharacterId, CharacterState>;
  creatures: Record<CreatureId, CreatureState>;
  hands: Record<PlayerId, CardInstanceId[]>;
  decks: Record<PlayerId, DeckState>;
  discardPiles: Record<PlayerId, CardInstanceId[]>;
  cardInstances: Record<CardInstanceId, CardInstance>;
  activeEffects: Record<string, EffectInstance>;
  effectQueue: string[];
  actionLog: Action[];
  log: GameLogEntry[];
  turn: TurnState;
  round: RoundState;
  phase: PhaseState;
  rngSeed: number;
  rngState: number;
}
