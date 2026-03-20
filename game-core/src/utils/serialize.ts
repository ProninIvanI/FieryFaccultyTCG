import { GameState } from '../types';

export const serializeState = (state: GameState): string => {
  return JSON.stringify(state);
};

export const deserializeState = (raw: string): GameState => {
  return JSON.parse(raw) as GameState;
};
