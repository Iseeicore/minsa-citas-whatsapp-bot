export class MissingHandlerResultError extends Error {
  constructor(readonly state: string) {
    super(`handle: no result for state "${state}"`);
    this.name = "MissingHandlerResultError";
  }
}
