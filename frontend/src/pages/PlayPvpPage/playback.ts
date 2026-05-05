import type { ResolvePlaybackFrame, RoundResolutionResult } from '@game-core/types';

export type PlaybackFieldValue = string | number | boolean | null;
export type HeroPlaybackEffectTone = 'damage' | 'heal' | 'shield' | 'shieldBreak';
export type BoardItemPlaybackEffectTone = 'summon' | 'destroy' | 'damage' | 'heal';
export type PlayerResourcePlaybackEffectTone = 'gain' | 'spend';

export interface HeroPlaybackEffect {
  tone: HeroPlaybackEffectTone;
  floatingText?: string;
}

export interface BoardItemPlaybackEffect {
  tone: BoardItemPlaybackEffectTone;
  floatingText?: string;
}

export interface PlayerResourcePlaybackEffect {
  tone: PlayerResourcePlaybackEffectTone;
  floatingText: string;
}

const getPlaybackFieldKey = (entityType: string, entityId: string, field: string): string =>
  `${entityType}:${entityId}:${field}`;

export const getPlaybackFrames = (round: RoundResolutionResult | null): ResolvePlaybackFrame[] =>
  round?.playbackFrames?.filter(
    (frame) =>
      frame.kind === 'damage' ||
      frame.kind === 'heal' ||
      frame.kind === 'shield' ||
      frame.kind === 'summon' ||
      frame.kind === 'destroy' ||
      frame.kind === 'resource' ||
      frame.kind === 'fizzle',
  ) ?? [];

export const getPlaybackStepCount = (round: RoundResolutionResult | null): number => {
  const playbackFrameCount = getPlaybackFrames(round).length;
  return playbackFrameCount > 0 ? playbackFrameCount : round?.orderedActions.length ?? 0;
};

export const buildPlaybackFieldValues = (
  frames: ResolvePlaybackFrame[],
  activeIndex: number,
): Map<string, PlaybackFieldValue> => {
  const values = new Map<string, PlaybackFieldValue>();

  frames.forEach((frame) => {
    frame.changes.forEach((change) => {
      const key = getPlaybackFieldKey(change.entity.type, change.entity.id, change.field);
      if (!values.has(key)) {
        values.set(key, change.from);
      }
    });
  });

  frames.slice(0, activeIndex + 1).forEach((frame) => {
    frame.changes.forEach((change) => {
      values.set(getPlaybackFieldKey(change.entity.type, change.entity.id, change.field), change.to);
    });
  });

  return values;
};

export const getPlaybackNumberOverride = (
  values: ReadonlyMap<string, PlaybackFieldValue>,
  entityType: string,
  entityId: string | undefined,
  field: string,
): number | null => {
  if (!entityId) {
    return null;
  }

  const value = values.get(getPlaybackFieldKey(entityType, entityId, field));
  return typeof value === 'number' ? value : null;
};

export const getPlaybackValueOverride = (
  values: ReadonlyMap<string, PlaybackFieldValue>,
  entityType: string,
  entityId: string | undefined,
  field: string,
): PlaybackFieldValue | undefined => {
  if (!entityId) {
    return undefined;
  }

  return values.get(getPlaybackFieldKey(entityType, entityId, field));
};

export const getActiveHeroPlaybackEffect = (
  frame: ResolvePlaybackFrame | null,
  characterId: string | undefined,
): HeroPlaybackEffect | null => {
  if (!frame || !characterId) {
    return null;
  }

  const hpChange = frame.changes.find(
    (change) => change.entity.type === 'character' && change.entity.id === characterId && change.field === 'hp',
  );
  if (hpChange && typeof hpChange.from === 'number' && typeof hpChange.to === 'number') {
    const amount = Math.abs(hpChange.to - hpChange.from);
    return hpChange.to < hpChange.from
      ? { tone: 'damage', floatingText: `-${amount}` }
      : { tone: 'heal', floatingText: `+${amount}` };
  }

  const shieldChange = frame.changes.find(
    (change) => change.entity.type === 'character' && change.entity.id === characterId && change.field === 'shield',
  );
  if (shieldChange) {
    const shieldTo = typeof shieldChange.to === 'number' ? shieldChange.to : 0;
    return shieldTo <= 0 ? { tone: 'shieldBreak' } : { tone: 'shield' };
  }

  return null;
};

export const getActiveBoardItemPlaybackEffect = (
  frame: ResolvePlaybackFrame | null,
  runtimeId: string | undefined,
): BoardItemPlaybackEffect | null => {
  if (!frame || !runtimeId) {
    return null;
  }

  const presenceChange = frame.changes.find(
    (change) => change.entity.type === 'creature' && change.entity.id === runtimeId && change.field === 'presence',
  );
  if (presenceChange) {
    return presenceChange.to === false ? { tone: 'destroy' } : { tone: 'summon' };
  }

  const hpChange = frame.changes.find(
    (change) => change.entity.type === 'creature' && change.entity.id === runtimeId && change.field === 'hp',
  );
  if (hpChange && typeof hpChange.from === 'number' && typeof hpChange.to === 'number') {
    const amount = Math.abs(hpChange.to - hpChange.from);
    return hpChange.to < hpChange.from
      ? { tone: 'damage', floatingText: `-${amount}` }
      : { tone: 'heal', floatingText: `+${amount}` };
  }

  return null;
};

export const getActivePlayerResourcePlaybackEffect = (
  frame: ResolvePlaybackFrame | null,
  playerId: string | undefined,
): PlayerResourcePlaybackEffect | null => {
  if (!frame || !playerId) {
    return null;
  }

  const manaChange = frame.changes.find(
    (change) => change.entity.type === 'player' && change.entity.id === playerId && change.field === 'mana',
  );
  if (manaChange && typeof manaChange.from === 'number' && typeof manaChange.to === 'number') {
    const amount = Math.abs(manaChange.to - manaChange.from);
    return manaChange.to < manaChange.from
      ? { tone: 'spend', floatingText: `-${amount} маны` }
      : { tone: 'gain', floatingText: `+${amount} мана` };
  }

  const actionPointChange = frame.changes.find(
    (change) => change.entity.type === 'player' && change.entity.id === playerId && change.field === 'actionPoints',
  );
  if (actionPointChange && typeof actionPointChange.from === 'number' && typeof actionPointChange.to === 'number') {
    const amount = Math.abs(actionPointChange.to - actionPointChange.from);
    return actionPointChange.to < actionPointChange.from
      ? { tone: 'spend', floatingText: `-${amount} AP` }
      : { tone: 'gain', floatingText: `+${amount} AP` };
  }

  return null;
};
