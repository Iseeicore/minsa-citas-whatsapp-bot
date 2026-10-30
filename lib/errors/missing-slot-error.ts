export class MissingSlotError extends Error {
  constructor(
    readonly field: string,
    readonly queryKind: string,
  ) {
    super(`resolveQuery: "${field}" is required for "${queryKind}" and is missing`);
    this.name = "MissingSlotError";
  }
}
