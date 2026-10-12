export class MaxPassesExceededError extends Error {
  constructor(readonly maxPasses: number) {
    super(`runTurn: exceeded ${maxPasses} query-resolution passes in a single turn — state machine bug`);
    this.name = "MaxPassesExceededError";
  }
}
