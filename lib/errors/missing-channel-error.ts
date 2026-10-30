export class MissingChannelError extends Error {
  constructor(readonly state: string) {
    super(`channelOf: the turn in state "${state}" has no channel`);
    this.name = "MissingChannelError";
  }
}
