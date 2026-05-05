export type CardType = 'spell' | 'creature' | 'artifact';
export type CardLocation = 'deck' | 'hand' | 'discard' | 'board';

export type TargetType =
  | 'enemyCharacter'
  | 'enemyAny'
  | 'allyCharacter'
  | 'creature'
  | 'self'
  | 'any';

export type AttackType = 'physical' | 'spell' | 'art' | 'creature';

export type PhaseType = 'RecoveryPhase' | 'DrawPhase' | 'ActionPhase' | 'EndPhase';

export type ActionType =
  | 'Attack'
  | 'CastSpell'
  | 'Summon'
  | 'Evade'
  | 'PlayCard'
  | 'EndTurn';
