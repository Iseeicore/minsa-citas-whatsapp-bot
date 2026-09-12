import { describe, expect, it } from "vitest";
import { createLogger } from "./logger.js";

describe("createLogger", () => {
  it("writes log lines to the given destination stream", () => {
    const written: string[] = [];
    const destination = {
      // pino only treats a plain object as a stream (rather than as options)
      // when it looks like a Node writable — `writable: true` is the minimal
      // marker; without it pino silently falls back to its default stdout
      // destination and this test would pass for the wrong reason.
      writable: true,
      write(msg: string) {
        written.push(msg);
      },
    };

    const logger = createLogger(destination);
    logger.info("hello from logger test");

    expect(written.length).toBeGreaterThan(0);
    expect(written.join("")).toContain("hello from logger test");
  });
});
