import { afterEach, describe, expect, it } from "vitest";
import { configureLogger } from "@/lib/observability/logger";
import { createLatencyMarks } from "@/lib/observability/inbound-latency";

describe("createLatencyMarks", () => {
  let restore: (() => void) | undefined;

  afterEach(() => restore?.());

  it("logs one line with the duration of each stage and the total", () => {
    const lines: string[] = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(line) });

    let clock = 1_000;
    const marks = createLatencyMarks(() => clock);
    clock += 5;
    marks.mark("perimeter");
    clock += 120;
    marks.mark("staged");
    clock += 1_500;
    marks.mark("window");
    clock += 340;
    marks.mark("lock");
    clock += 60;
    marks.mark("turn");
    clock += 200;
    marks.mark("first_send");
    clock += 10;
    marks.finish("inbound.latency", { waId: "51999990001", channel: "whatsapp", traceId: "t-abc" });

    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(record.event).toBe("inbound.latency");
    expect(record.traceId).toBe("t-abc");
    expect(record.channel).toBe("whatsapp");
    expect(record.stagesMs).toEqual({ perimeter: 5, staged: 120, window: 1_500, lock: 340, turn: 60, first_send: 200 });
    expect(record.totalMs).toBe(2_235);
  });

  it("never writes the full waId, only its tail", () => {
    const lines: string[] = [];
    restore = configureLogger({ sink: (_level, line) => lines.push(line) });

    createLatencyMarks(() => 0).finish("sandbox.latency", { waId: "sandbox-1234abcd", channel: "web" });

    expect(lines[0]).not.toContain("sandbox-1234abcd");
    expect(JSON.parse(lines[0]).waId).toBe("...abcd");
  });
});
