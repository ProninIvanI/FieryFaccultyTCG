export class IdFactory {
  private seq = 0;

  next(prefix: string): string {
    this.seq += 1;
    return `${prefix}_${this.seq}`;
  }
}
