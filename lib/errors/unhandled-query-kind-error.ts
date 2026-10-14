export class UnhandledQueryKindError extends Error {
  constructor(readonly kind: string) {
    super(`resolveQuery: unhandled query kind "${kind}"`);
    this.name = "UnhandledQueryKindError";
  }
}
