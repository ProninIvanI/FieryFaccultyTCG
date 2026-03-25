import {
  Action,
  GameState,
  PlayerBoardModel,
  PlayerRoundDraft,
  PublicBoardView,
  RoundActionIntent,
  RoundDraftValidationResult,
  RoundResolutionResult,
} from '../../../game-core/src/types';
import { SessionPlayerLoadout } from './session';

export interface GameEngineLike {
  getState(): GameState;
  getRoundDraft(playerId: string): PlayerRoundDraft | null;
  buildPlayerBoardModel(playerId: string): PlayerBoardModel | null;
  buildPublicBoardView(): PublicBoardView;
  processAction(action: Action): { ok: boolean; errors?: string[] };
  submitRoundDraft(
    playerId: string,
    roundNumber: number,
    intents: RoundActionIntent[],
  ): RoundDraftValidationResult;
  lockRoundDraft(playerId: string, roundNumber: number): RoundDraftValidationResult;
  resolveRoundIfReady(): RoundResolutionResult | null;
  syncPlayerLoadout(loadout: SessionPlayerLoadout): void;
}
