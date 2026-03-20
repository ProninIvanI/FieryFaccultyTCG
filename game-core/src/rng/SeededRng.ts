export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  nextUInt32(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state;
  }

  nextFloat(): number {
    return this.nextUInt32() / 0xffffffff;
  }

  getState(): number {
    return this.state;
  }
}
