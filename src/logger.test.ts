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

  // D7 defense-in-depth net: NOT the control (the logging DTO is) — this
  // exists so a future `logger.info({ event }, msg)` written by someone who
  // has not read the design still cannot emit an MSISDN or message body.
  it("redacts from/text/contactName/raw fields (top-level and one level nested), removing them entirely", () => {
    const written: string[] = [];
    const destination = {
      writable: true,
      write(msg: string) {
        written.push(msg);
      },
    };

    const logger = createLogger(destination);
    logger.info(
      {
        from: "51999999999",
        text: "mensaje sensible",
        contactName: "Juan Perez",
        raw: { anything: "here" },
        event: { from: "51988888888", text: "otro mensaje", contactName: "Maria", raw: { x: 1 } },
        messageType: "text",
      },
      "evento de prueba"
    );

    const output = written.join("");
    expect(output).not.toContain("51999999999");
    expect(output).not.toContain("51988888888");
    expect(output).not.toContain("mensaje sensible");
    expect(output).not.toContain("otro mensaje");
    expect(output).not.toContain("Juan Perez");
    expect(output).not.toContain("Maria");
    expect(output).toContain("messageType");
    expect(output).toContain("evento de prueba");
  });
});
