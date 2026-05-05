import type { CatalogCharacterSummary } from '@game-core/cards/catalog';
import { getResolutionLayerLabel, getTargetTypeLabel } from '@game-core/rounds/presentation';
import type { ResolutionLayer, TargetType } from '@game-core/types';
import type { JoinRejectedServerMessage, RoundActionIntentDraft } from '@/types';
import type { TargetCandidateSummary } from './PlayPvpPage';
import styles from './PlayPvpPage.module.css';

export const getCardSchoolAccentClassName = (school?: string): string => {
  switch (school) {
    case 'fire':
      return styles.handCardArtworkFire;
    case 'water':
      return styles.handCardArtworkWater;
    case 'earth':
      return styles.handCardArtworkEarth;
    case 'air':
      return styles.handCardArtworkAir;
    default:
      return styles.handCardArtworkNeutral;
  }
};

export const getRoundActionStatusDisplay = (status: string): string => {
  switch (status) {
    case 'draft':
      return 'Готовится';
    case 'locked':
      return 'Зафиксировано';
    case 'resolved':
      return 'Сработало';
    case 'fizzled':
      return 'Сорвалось';
    case 'rejected':
      return 'Отклонено';
    default:
      return status;
  }
};

export const getRoundActionModeLabel = (layer: ResolutionLayer): string => {
  switch (layer) {
    case 'summon':
      return 'Призыв';
    case 'defensive_modifiers':
    case 'defensive_spells':
      return 'Защита';
    case 'other_modifiers':
      return 'Поддержка';
    case 'offensive_control_spells':
      return 'Боевое заклинание';
    case 'attacks':
      return 'Атака';
    case 'cleanup_end_of_round':
      return 'Конец раунда';
    default:
      return getResolutionLayerLabel(layer);
  }
};

export const getBoardItemSubtitle = (
  subtype: 'creature' | 'effect',
  lifetimeType: 'temporary' | 'persistent',
): string => {
  if (subtype === 'creature') {
    return lifetimeType === 'persistent' ? 'Существо на поле' : 'Временный призыв';
  }

  return lifetimeType === 'persistent' ? 'Постоянный эффект' : 'Эффект на раунд';
};

export const getDurationLabel = (duration: number): string => `Ходы: ${duration}`;

export const getActionTargetPreview = (subtitle: string): string | undefined => {
  if (subtitle === 'Без цели' || subtitle === 'Цель уточняется') {
    return undefined;
  }

  return subtitle;
};

export const getRoundActionTargetSubtitle = (
  kind: RoundActionIntentDraft['kind'],
  targetType?: TargetType | null,
  targetId?: string | null,
  knownTargetLabelsById?: ReadonlyMap<string, string>,
  fallbackTargetId?: string | null,
): string => {
  if (kind === 'Summon' || kind === 'Evade') {
    return 'Без цели';
  }

  if (!targetType) {
    return 'Цель не указана';
  }

  const resolvedTargetId = targetId ?? fallbackTargetId ?? null;
  if (!resolvedTargetId) {
    return 'Цель уточняется';
  }

  const targetLabel = knownTargetLabelsById?.get(resolvedTargetId);
  return `${getTargetTypeLabel(targetType)} -> ${targetLabel ?? resolvedTargetId}`;
};

export const getRoundActionFocusLabel = (modeLabel: string, targetLabel?: string): string =>
  targetLabel ? `${modeLabel} -> ${targetLabel}` : modeLabel;

export const getRibbonArtworkAccentClassName = (
  school?: 'fire' | 'water' | 'earth' | 'air',
  variant: 'creature' | 'effect' | 'action' = 'action',
): string => {
  if (school) {
    return getCardSchoolAccentClassName(school);
  }

  switch (variant) {
    case 'creature':
      return styles.ribbonArtworkCreature;
    case 'effect':
      return styles.ribbonArtworkEffect;
    case 'action':
      return styles.ribbonArtworkNeutral;
  }
};

export const getRoundActionTone = (
  layer: ResolutionLayer,
): 'summon' | 'defense' | 'attack' | 'support' => {
  switch (layer) {
    case 'summon':
      return 'summon';
    case 'defensive_modifiers':
    case 'defensive_spells':
      return 'defense';
    case 'attacks':
      return 'attack';
    default:
      return 'support';
  }
};

export const getRibbonActionToneClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.ribbonActionToneSummon;
    case 'defense':
      return styles.ribbonActionToneDefense;
    case 'attack':
      return styles.ribbonActionToneAttack;
    case 'support':
      return styles.ribbonActionToneSupport;
  }
};

export const getRoundQueueToneClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.roundQueueItemSummon;
    case 'defense':
      return styles.roundQueueItemDefense;
    case 'attack':
      return styles.roundQueueItemAttack;
    case 'support':
      return styles.roundQueueItemSupport;
  }
};

export const getActionToneBadgeClassName = (layer: ResolutionLayer): string => {
  switch (getRoundActionTone(layer)) {
    case 'summon':
      return styles.cardBadgeToneSummon;
    case 'defense':
      return styles.cardBadgeToneDefense;
    case 'attack':
      return styles.cardBadgeToneAttack;
    case 'support':
      return styles.cardBadgeToneSupport;
  }
};

export const getTargetButtonAriaLabel = (label: string, selectable: boolean): string =>
  selectable ? `Выбрать цель: ${label}` : label;

export const getRibbonTargetTabAriaLabel = (label: string): string => `Назначить цель в ленте: ${label}`;

export const getRibbonTargetCompactLabel = (candidate: TargetCandidateSummary): string =>
  candidate.kind === 'character' ? 'М' : 'С';

export const getPreferredDefaultTargetId = (
  targetType: TargetType | null | undefined,
  candidates: TargetCandidateSummary[],
): string | null => {
  if (!targetType || candidates.length === 0) {
    return null;
  }

  switch (targetType) {
    case 'self':
    case 'allyCharacter':
      return candidates.find((candidate) => candidate.kind === 'character')?.id ?? null;
    case 'enemyCharacter':
    case 'enemyAny':
      return candidates.find((candidate) => candidate.kind === 'character')?.id ?? null;
    case 'any':
      return (
        candidates.find((candidate) => candidate.kind === 'character')?.id ??
        candidates[0]?.id ??
        null
      );
    case 'creature':
      return null;
    default:
      return null;
  }
};

export const getInviteJoinRejectHint = (
  code: JoinRejectedServerMessage['code'],
): string | null => {
  switch (code) {
    case 'session_full':
      return 'Эта invite-сессия уже занята. Скорее всего матч был запущен раньше или ссылка устарела.';
    case 'seed_mismatch':
      return 'Параметры invite-сессии больше не совпадают с состоянием сервера. Лучше запросить новое приглашение.';
    case 'unauthorized':
      return 'Сессия входа истекла. Перезайдите в аккаунт и откройте приглашение заново.';
    case 'deck_unavailable':
      return 'Для входа по приглашению нужна доступная колода. Выберите другую колоду и попробуйте снова.';
    case 'deck_invalid':
      return 'Колода из приглашения сейчас невалидна для PvP. Проверьте состав колоды и персонажа.';
    default:
      return null;
  }
};

export const toInviteMode = (value: string | null): 'create' | 'join' | null => {
  if (value === 'create' || value === 'join') {
    return value;
  }

  return null;
};

export const getCharacterInitials = (name: string): string => {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '??';
  }

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
};

export const getCharacterAccentClassName = (
  faculty: CatalogCharacterSummary['faculty'] | undefined,
  local = false
): string => {
  switch (faculty) {
    case 'fire':
      return local ? styles.playerPortraitLocalFire : styles.playerPortraitFire;
    case 'water':
      return local ? styles.playerPortraitLocalWater : styles.playerPortraitWater;
    case 'earth':
      return local ? styles.playerPortraitLocalEarth : styles.playerPortraitEarth;
    case 'air':
      return local ? styles.playerPortraitLocalAir : styles.playerPortraitAir;
    default:
      return local ? styles.playerPortraitLocalNeutral : styles.playerPortraitNeutral;
  }
};
