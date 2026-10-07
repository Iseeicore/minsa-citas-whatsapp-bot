import { describe, expect, it } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { createTurnLock } from "@/lib/fsm/session/turn-lock";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("turn lock waits reach the structured logger by default", () => {
  it("logs turn_lock.waited with the masked waId, the wait and the layer", async () => {
    const lines: Array<Record<string, unknown>> = [];
    const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
    const lock = createTurnLock({ slowWaitMs: 20 });

    await Promise.all([lock("5491100001234", () => sleep(60)), lock("5491100001234", async () => "second")]);
    restore();

    const waited = lines.filter((line) => line.event === "turn_lock.waited");
    expect(waited).toHaveLength(1);
    expect(waited[0]).toMatchObject({ level: "info", waId: "...1234", layer: "process" });
    expect(Number(waited[0].waitedMs)).toBeGreaterThanOrEqual(20);
  });
});
