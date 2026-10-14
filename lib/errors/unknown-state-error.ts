export class UnknownStateError extends Error {
  constructor(
    readonly handler: string,
    readonly state: string,
  ) {
    super(`${handler}: unknown state "${state}"`);
    this.name = "UnknownStateError";
  }
}
