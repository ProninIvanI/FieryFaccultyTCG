import type { BoardItemSummary } from './PlayPvpPage';
import styles from './PlayPvpPage.module.css';

interface OpponentBoardRibbonProps {
  items: BoardItemSummary[];
  getArtworkAccentClassName: (
    school?: 'fire' | 'water' | 'earth' | 'air',
    variant?: 'creature' | 'effect' | 'action',
  ) => string;
  isTargetable: (runtimeId: string) => boolean;
  isTargetActive: (runtimeId: string) => boolean;
  onTargetClick: (runtimeId: string) => void;
}

export const OpponentBoardRibbon = ({
  items,
  getArtworkAccentClassName,
  isTargetable,
  isTargetActive,
  onTargetClick,
}: OpponentBoardRibbonProps) => {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className={styles.opponentBoardRibbon} data-testid="opponent-board-ribbon">
      {items.map((item) => {
        const targetable = item.subtype === 'creature' && isTargetable(item.runtimeId);
        const targetActive = item.subtype === 'creature' && isTargetActive(item.runtimeId);

        return (
          <button
            key={item.id}
            className={`${styles.opponentBoardCard} ${targetable ? styles.opponentBoardCardTargetable : ''} ${
              targetActive ? styles.opponentBoardCardTargetActive : ''
            }`.trim()}
            type="button"
            onClick={() => {
              if (targetable) {
                onTargetClick(item.runtimeId);
              }
            }}
            disabled={!targetable}
            aria-label={targetable ? `Выбрать цель: ${item.title}` : item.title}
          >
            <span
              className={`${styles.opponentBoardArtwork} ${getArtworkAccentClassName(
                item.school,
                item.subtype === 'creature' ? 'creature' : 'effect',
              )}`.trim()}
              aria-hidden="true"
            />
            <span className={styles.opponentBoardBody}>
              <strong>{item.title}</strong>
              <span>
                {item.subtype === 'creature'
                  ? `HP ${item.hp ?? 0}/${item.maxHp ?? 0} · ATK ${item.attack ?? 0} · SPD ${item.speed ?? 0}`
                  : item.subtitle}
              </span>
            </span>
          </button>
        );
      })}
    </section>
  );
};
