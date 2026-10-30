import { describe, expect, it } from "vitest";
import { MissingChannelError } from "@/lib/errors/missing-channel-error";

describe("MissingChannelError", () => {
  it("names the state where the channel was missing", () => {
    expect(new MissingChannelError("main_menu").message).toBe('channelOf: the turn in state "main_menu" has no channel');
  });

  it("is an Error named after its class that carries the state", () => {
    const error = new MissingChannelError("main_menu");

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("MissingChannelError");
    expect(error.state).toBe("main_menu");
  });
});
