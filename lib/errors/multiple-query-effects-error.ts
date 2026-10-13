export class MultipleQueryEffectsError extends Error {
  constructor(readonly count: number) {
    super("runTurn: handle() returned more than one query effect in a single pass");
    this.name = "MultipleQueryEffectsError";
  }
}
