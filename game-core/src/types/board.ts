import { TargetType } from './enums';
import {
  CardInstanceId,
  CharacterId,
  CreatureId,
  EffectId,
  PlayerId,
} from './ids';
import { ResolutionLayer, RoundActionIntent, RoundActionReasonCode } from './round';

export type BoardItemId = string;
export type BoardItemSubtype = 'creature' | 'effect';
export type BoardItemLifetimeType = 'temporary' | 'persistent';

export interface TargetSelection {
  targetId?: CharacterId | CreatureId;
  targetType?: TargetType;
}

export interface BoardItemStateView {
  hp?: number;
  maxHp?: number;
  attack?: number;
  speed?: number;
  duration?: number;
}

export interface BoardItem {
  id: BoardItemId;
  runtimeId: CreatureId | EffectId;
  ownerId: PlayerId;
  controllerId: PlayerId;
  subtype: BoardItemSubtype;
  lifetimeType: BoardItemLifetimeType;
  sourceCardInstanceId?: CardInstanceId;
  definitionId?: string;
  createdAtRound?: number;
  createdAtTurn?: number;
  placement: ResolutionPlacement;
  state: BoardItemStateView;
}

export type RoundActionSource =
  | {
      type: 'card';
      cardInstanceId: CardInstanceId;
      definitionId?: string;
    }
  | {
      type: 'boardItem';
      boardItemId: BoardItemId;
    }
  | {
      type: 'actor';
      actorId: CharacterId | CreatureId;
    };

export interface ResolutionPlacement {
  layer: ResolutionLayer;
  orderIndex: number;
  queueIndex: number;
}

export type RoundActionStatus = 'draft' | 'locked' | 'resolved' | 'fizzled';

export interface RoundAction {
  id: string;
  roundNumber: number;
  playerId: PlayerId;
  actorId: CharacterId | CreatureId;
  kind: RoundActionIntent['kind'];
  source: RoundActionSource;
  target?: TargetSelection;
  placement: ResolutionPlacement;
  status: RoundActionStatus;
  reasonCode?: RoundActionReasonCode;
  summary?: string;
}

export interface BoardItemRibbonEntry {
  id: string;
  kind: 'boardItem';
  orderIndex: number;
  layer: ResolutionLayer;
  boardItemId: BoardItemId;
  attachedRoundActionIds: string[];
}

export interface RoundActionRibbonEntry {
  id: string;
  kind: 'roundAction';
  orderIndex: number;
  layer: ResolutionLayer;
  roundActionId: string;
}

export type PlayerRibbonEntry = BoardItemRibbonEntry | RoundActionRibbonEntry;

export interface PublicBoardItemRibbonEntry {
  id: string;
  kind: 'boardItem';
  orderIndex: number;
  layer: ResolutionLayer;
  boardItemId: BoardItemId;
}

export interface PlayerBoardModel {
  playerId: PlayerId;
  boardItems: BoardItem[];
  roundActions: RoundAction[];
  ribbonEntries: PlayerRibbonEntry[];
}

export interface PublicPlayerBoardView {
  playerId: PlayerId;
  boardItems: BoardItem[];
  ribbonEntries: PublicBoardItemRibbonEntry[];
}

export interface PublicBoardView {
  players: Record<PlayerId, PublicPlayerBoardView>;
}
