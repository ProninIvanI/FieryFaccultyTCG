import { PhaseType } from '../types';

const PHASE_ORDER: PhaseType[] = [
  'RecoveryPhase',
  'DrawPhase',
  'ActionPhase',
  'EndPhase',
];

export class PhaseStateMachine {
  private index = 0;

  constructor(initial: PhaseType) {
    this.index = PHASE_ORDER.indexOf(initial);
    if (this.index < 0) {
      this.index = 0;
    }
  }

  current(): PhaseType {
    return PHASE_ORDER[this.index];
  }

  advance(): PhaseType {
    this.index = (this.index + 1) % PHASE_ORDER.length;
    return this.current();
  }

  reset(): PhaseType {
    this.index = 0;
    return this.current();
  }
}
