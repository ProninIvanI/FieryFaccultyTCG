import type { FocusEvent } from 'react';
import styles from './PlayPvpPage.module.css';

interface HandCardSummary {
  instanceId: string;
  cardId: string;
  name: string;
  mana: number;
  cardType: string;
  school?: 'fire' | 'water' | 'earth' | 'air';
  effect?: string;
  hp?: number;
  attack?: number;
  speed?: number;
}

type BattlefieldSelection =
  | { kind: 'hand'; instanceId: string }
  | { kind: 'creature'; creatureId: string }
  | null;

type SceneInspectTarget =
  | { kind: 'hand'; id: string }
  | { kind: 'boardItem'; id: string }
  | { kind: 'roundAction'; id: string };

interface LocalHandTrayProps {
  availableHandCards: HandCardSummary[];
  localHandCardCount: number;
  deckSize: number;
  inspectedHandCardId: string | null;
  selection: BattlefieldSelection;
  manaRejectedHandCardId: string | null;
  onInspectTarget: (target: SceneInspectTarget) => void;
  onInspectLeave: (target: SceneInspectTarget) => void;
  onInspectBlur: (event: FocusEvent<HTMLDivElement>, target: SceneInspectTarget) => void;
  onClearManaRejectedCard: (cardId: string) => void;
  onCardClick: (card: HandCardSummary, event: { currentTarget: HTMLButtonElement }) => void;
}

const getCardAccentClassName = (cardType: string): string => {
  if (cardType === 'summon') {
    return styles.cardAccentSummon;
  }

  if (cardType === 'spell') {
    return styles.cardAccentSpell;
  }

  return styles.cardAccentNeutral;
};

const getCardSchoolAccentClassName = (school?: string): string => {
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

export const LocalHandTray = ({
  availableHandCards,
  localHandCardCount,
  deckSize,
  inspectedHandCardId,
  selection,
  manaRejectedHandCardId,
  onInspectTarget,
  onInspectLeave,
  onInspectBlur,
  onClearManaRejectedCard,
  onCardClick,
}: LocalHandTrayProps) => (
  <section className={`${styles.handTray} ${styles.localHandTray}`.trim()} data-testid="local-hand-tray">
    <div className={styles.battleLaneHeader}>
      <div>
        <span className={styles.summaryLabel}>Твоя рука</span>
        <strong>Карты для текущего раунда</strong>
      </div>
      <span className={styles.battleCount}>
        {availableHandCards.length} карт · колода {deckSize}
      </span>
    </div>
    {availableHandCards.length > 0 ? (
      <div className={styles.handFanGrid}>
        {availableHandCards.map((card) => {
          const inspectTarget: SceneInspectTarget = { kind: 'hand', id: card.instanceId };
          const isManaRejected = manaRejectedHandCardId === card.instanceId;
          const isSelected = selection?.kind === 'hand' && selection.instanceId === card.instanceId;

          return (
            <div
              key={card.instanceId}
              className={`${styles.handCard} ${card.cardType === 'summon' ? styles.handCardPlayable : ''} ${getCardAccentClassName(card.cardType)} ${inspectedHandCardId === card.instanceId ? styles.handCardInspected : ''} ${isSelected ? styles.handCardSelected : ''} ${isManaRejected ? styles.handCardManaRejected : ''}`.trim()}
              data-mana-rejected={isManaRejected ? 'true' : undefined}
              onMouseEnter={() => {
                if (!isManaRejected) {
                  onInspectTarget(inspectTarget);
                }
              }}
              onMouseLeave={() => {
                onInspectLeave(inspectTarget);
                onClearManaRejectedCard(card.instanceId);
              }}
              onFocusCapture={() => {
                if (!isManaRejected) {
                  onInspectTarget(inspectTarget);
                }
              }}
              onBlurCapture={(event) => onInspectBlur(event, inspectTarget)}
            >
              <button
                className={`${styles.selectionSurface} ${isSelected ? styles.selectionSurfaceActive : ''}`.trim()}
                type="button"
                onClick={(event) => onCardClick(card, event)}
              >
                <div className={`${styles.handCardArtwork} ${getCardSchoolAccentClassName(card.school)}`.trim()}>
                  <div className={styles.handCardTop}>
                    <span className={styles.handManaGem}>{card.mana}</span>
                  </div>
                </div>
                <div className={styles.handCardBody}>
                  <strong className={styles.handCardTitle}>{card.name}</strong>
                </div>
              </button>
            </div>
          );
        })}
      </div>
    ) : localHandCardCount > 0 ? (
      <div className={styles.emptyState}>Все карты из руки уже перенесены в боевую ленту.</div>
    ) : (
      <div className={styles.emptyStateSpacer} aria-hidden="true" />
    )}
  </section>
);
