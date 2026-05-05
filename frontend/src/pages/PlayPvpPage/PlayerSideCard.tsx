import styles from './PlayPvpPage.module.css';

interface PlayerSideStats {
  hp: number | null;
  fallbackHp: number;
  maxHp: number;
  mana: number | null;
  fallbackMana: number;
  maxMana: number;
  dexterity: number;
  concentration: number;
}

interface PlayerSideCardProps {
  label: string;
  isActive: boolean;
  isLocal?: boolean;
  isTargetable: boolean;
  isTargetActive: boolean;
  heroEffectClassName: string;
  ariaLabel: string;
  portraitAccentClassName: string;
  initials: string;
  shield: number | null;
  heroFloatingText?: string;
  title: string;
  subtitle: string;
  stats: PlayerSideStats | null;
  resourceEffectClassName: string;
  resourceFloatingText?: string;
  onTargetClick: () => void;
}

export const PlayerSideCard = ({
  label,
  isActive,
  isLocal = false,
  isTargetable,
  isTargetActive,
  heroEffectClassName,
  ariaLabel,
  portraitAccentClassName,
  initials,
  shield,
  heroFloatingText,
  title,
  subtitle,
  stats,
  resourceEffectClassName,
  resourceFloatingText,
  onTargetClick,
}: PlayerSideCardProps) => (
  <div className={`${styles.playerSideCard} ${isActive ? styles.playerSideCardActive : ''}`.trim()}>
    <span className={styles.playerSideLabel}>{label}</span>
    <button
      className={[
        styles.avatarTargetButton,
        heroEffectClassName,
        isTargetable ? styles.selectionSurfaceTargetable : '',
        isTargetActive ? styles.selectionSurfaceTargetActive : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      type="button"
      onClick={onTargetClick}
    >
      <div className={`${styles.playerPortraitFrame} ${portraitAccentClassName}`.trim()}>
        <div
          className={`${styles.playerPortraitSilhouette} ${
            isLocal ? styles.playerPortraitSilhouetteLocal : ''
          } ${portraitAccentClassName}`.trim()}
        >
          {initials}
        </div>
        {typeof shield === 'number' && shield > 0 ? (
          <span className={styles.heroShieldBadge} aria-label={`Щит ${shield}`}>
            {shield}
          </span>
        ) : null}
        {heroFloatingText ? <span className={styles.heroFloatingNumber}>{heroFloatingText}</span> : null}
      </div>
      <div className={styles.playerIdentity}>
        <strong>{title}</strong>
        <span>{subtitle}</span>
        {stats ? (
          <div className={styles.playerIdentityStats}>
            <span className={styles.playerIdentityStat}>
              HP {stats.hp ?? stats.fallbackHp}/{stats.maxHp}
            </span>
            <span className={styles.playerIdentityStat}>
              Мана {stats.mana ?? stats.fallbackMana}/{stats.maxMana}
            </span>
            <span className={styles.playerIdentityStat}>Ловкость {stats.dexterity}</span>
            <span className={styles.playerIdentityStat}>Конц. {stats.concentration}</span>
          </div>
        ) : null}
        {resourceFloatingText ? (
          <span className={`${styles.playerResourceFloatingNumber} ${resourceEffectClassName}`.trim()}>
            {resourceFloatingText}
          </span>
        ) : null}
      </div>
    </button>
  </div>
);
