import { describe, expect, it } from "vitest";
import { createDailyFileSink, dateFolder, type FileSystemPort } from "@/lib/observability/file-sink";
import { createLogger } from "@/lib/observability/logger";
import { maskDni, previewInput, redactString, sanitizeSlots } from "@/lib/observability/mask";
import { createTurnTrace, deriveTraceId, traceIdFor, traceTurn } from "@/lib/observability/tracer";
import type { LogLevel } from "@/lib/observability/types";

type Line = Record<string, unknown> & { level: LogLevel; event: string };

function capture(level: LogLevel | "silent" = "info") {
  const raw: string[] = [];
  const log = createLogger({ sink: (_level, line) => raw.push(line), level, now: () => new Date("2026-09-19T15:00:00Z") });
  return { raw, log, lines: () => raw.map((line) => JSON.parse(line) as Line) };
}

const DNI = "12345678";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE4MDAwMDAwMDB9.c2lnbmF0dXJl";

describe("masking", () => {
  it("keeps the last four digits of a document number and nothing more", () => {
    expect(maskDni(DNI)).toBe("****5678");
    expect(maskDni("1234")).toBe("****");
  });

  it("hides long digit runs, Bearer headers and JWTs inside any text", () => {
    expect(redactString(`mi dni es ${DNI} y mi cel 987654321`)).toBe("mi dni es ****5678 y mi cel ****4321");
    expect(redactString(`Authorization: Bearer ${TOKEN}`)).toBe("Authorization: Bearer [redacted]");
    expect(redactString(`token ${TOKEN}`)).toBe("token [jwt]");
    expect(redactString("a las 13:45 el 31/12/2099")).toBe("a las 13:45 el 31/12/2099");
  });

  it("hides the query string of any URL inside a text, where secrets travel", () => {
    expect(redactString("Failed to parse URL from https://api.example.com/v1/x:run?key=SECRET-123&alt=json")).toBe(
      "Failed to parse URL from https://api.example.com/v1/x:run?[redacted]",
    );
    expect(redactString("see http://h.example/p?token=abc#frag and more")).toBe(
      "see http://h.example/p?[redacted]#frag and more",
    );
    // A URL without a query and a Spanish question stay as they are.
    expect(redactString("https://api.example.com/v1/path")).toBe("https://api.example.com/v1/path");
    expect(redactString("¿Confirmas el horario? responde sí")).toBe("¿Confirmas el horario? responde sí");
  });

  it("never lets a URL's secret reach a log line through an error message", () => {
    const { raw, log } = capture();
    log.error("external.http", { error: new TypeError("fetch failed for https://api.example.com/m?key=SECRET-123") });

    expect(raw.join("\n")).not.toContain("SECRET-123");
    expect(raw.join("\n")).toContain("https://api.example.com/m?[redacted]");
  });

  it("sanitizes a slots snapshot: no bearer, masked DNI, long values reduced to their length", () => {
    const message = "quiero una cita, mi dni es 12345678";
    const offered = JSON.stringify({ rows: [1, 2, 3] });
    const clean = sanitizeSlots({
      citaBearer: TOKEN,
      citaDni: DNI,
      citaDniPending: DNI,
      citaTwofaId: "abc-123",
      initialMessageText: message,
      citaOffered: offered,
      citaDistrito: "SAN JUAN DE LURIGANCHO",
    });

    expect(clean).toEqual({
      citaBearer: "[redacted]",
      citaDni: "****5678",
      citaDniPending: "****5678",
      citaTwofaId: "[redacted]",
      initialMessageText: { length: message.length },
      citaOffered: { length: offered.length },
      citaDistrito: "SAN JUAN DE LURIGANCHO",
    });
    expect(JSON.stringify(clean)).not.toContain(DNI);
    expect(JSON.stringify(clean)).not.toContain(TOKEN);
  });

  it("never quotes what was typed at an identity step or a complaint", () => {
    expect(previewInput("cita_awaiting_dni", DNI)).toEqual({ inputLength: 8 });
    expect(previewInput("cita_awaiting_otp", "123456")).toEqual({ inputLength: 6 });
    expect(previewInput("reclamo_awaiting_descripcion", "me atendieron mal")).toEqual({ inputLength: 17 });
  });

  it("quotes a short, masked preview elsewhere", () => {
    expect(previewInput("main_menu", "  mi dni es 12345678  ")).toEqual({ inputLength: 22, inputPreview: "mi dni es ****5678" });
    const long = previewInput("main_menu", "a".repeat(100)) as { inputPreview: string };
    expect(long.inputPreview).toHaveLength(41);
    expect(previewInput("main_menu", undefined)).toEqual({});
  });
});

describe("logger", () => {
  it("writes one valid JSON object per line with time, level and event", () => {
    const { raw, log, lines } = capture();

    log.info("turn.start", { stateBefore: "main_menu" });
    log.warn("turn.note", { kind: "confirmation_unknown" });
    log.error("turn.failed", { error: new Error("boom") });

    expect(raw).toHaveLength(3);
    for (const line of raw) expect(() => JSON.parse(line)).not.toThrow();
    expect(lines()[0]).toEqual({ time: "2026-09-19T15:00:00.000Z", level: "info", event: "turn.start", stateBefore: "main_menu" });
    expect(lines().map((line) => line.level)).toEqual(["info", "warn", "error"]);
    expect(lines()[2].error).toEqual({ name: "Error", message: "boom" });
  });

  it("hides sensitive data by itself, even when the caller forgets", () => {
    const { raw, log } = capture();

    log.info("anything", {
      dni: DNI,
      numeroDocumentoPaciente: DNI,
      citaBearer: TOKEN,
      note: `the citizen wrote ${DNI}`,
      header: `Bearer ${TOKEN}`,
      nested: { deep: { token: "secret-value", tail: "987654321" } },
    });

    const line = raw[0];
    expect(line).not.toContain(DNI);
    expect(line).not.toContain(TOKEN);
    expect(line).not.toContain("secret-value");
    expect(line).not.toContain("987654321");
    expect(JSON.parse(line)).toMatchObject({ dni: "****5678", citaBearer: "[redacted]" });
  });

  it("filters by level", () => {
    const warnings = capture("warn");
    warnings.log.info("a");
    warnings.log.warn("b");
    warnings.log.error("c");
    expect(warnings.lines().map((line) => line.event)).toEqual(["b", "c"]);

    const off = capture("silent");
    off.log.error("d");
    expect(off.raw).toEqual([]);
  });

  it("never throws, whatever it is given", () => {
    const { log } = capture();
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => log.info("circular", { circular })).not.toThrow();
    expect(() => createLogger({ sink: () => { throw new Error("disk"); } }).info("x")).not.toThrow();
  });
});

describe("traceId", () => {
  it("is deterministic per message: the same waId and message id always give the same id", () => {
    const first = traceIdFor("51999000111", { type: "text", messageId: "wamid.A" }, 1);
    const again = traceIdFor("51999000111", { type: "text", messageId: "wamid.A" }, 999_999);

    expect(first).toBe(again);
    expect(first).toMatch(/^t-[0-9a-f]{12}$/);
    expect(first).toBe(deriveTraceId("51999000111", "wamid.A"));
  });

  it("differs per message and per citizen", () => {
    const base = traceIdFor("51999000111", { type: "text", messageId: "wamid.A" }, 1);

    expect(traceIdFor("51999000111", { type: "text", messageId: "wamid.B" }, 1)).not.toBe(base);
    expect(traceIdFor("51999000222", { type: "text", messageId: "wamid.A" }, 1)).not.toBe(base);
  });

  it("without a message id, is a function of when the turn started and what came in", () => {
    const event = { type: "text", text: "hola" };

    expect(traceIdFor("sandbox-1", event, 1000)).toBe(traceIdFor("sandbox-1", event, 1000));
    expect(traceIdFor("sandbox-1", event, 1000)).not.toBe(traceIdFor("sandbox-1", event, 1001));
  });
});

describe("turn trace", () => {
  const clock = (...times: number[]) => {
    let index = 0;
    return () => times[Math.min(index++, times.length - 1)];
  };

  it("tells the whole turn under one traceId, without the citizen's identity", async () => {
    const { log, lines, raw } = capture();
    const trace = createTurnTrace(
      "51999000111",
      { type: "text", text: `mi dni es ${DNI}`, messageId: "wamid.A" },
      { state: "main_menu", slots: { citaBearer: TOKEN } },
      { log, now: clock(1000, 1100, 1150, 1400) },
    );

    trace.note({ kind: "confirmation_unknown", level: "warn", detail: { step: "hora_confirm" } });
    const result = await trace.external("minsa", "validate_user", async () => ({ status: "valid" }));
    trace.complete({
      session: { state: "cita_awaiting_otp", slots: { citaBearer: TOKEN, citaDniPending: DNI, citaTwofaId: "tf" } },
      sentCount: 2,
    });
    trace.finish();

    expect(result).toEqual({ status: "valid" });
    const [start, note, external, end] = lines();
    const id = traceIdFor("51999000111", { type: "text", messageId: "wamid.A" }, 1000);

    expect([start.event, note.event, external.event, end.event]).toEqual(["turn.start", "turn.note", "turn.external", "turn.end"]);
    for (const line of [start, note, external, end]) expect(line.traceId).toBe(id);

    expect(start).toMatchObject({ waId: "...0111", stateBefore: "main_menu", eventType: "text", inputPreview: "mi dni es ****5678" });
    expect(note).toMatchObject({ level: "warn", kind: "confirmation_unknown", step: "hora_confirm" });
    expect(external).toMatchObject({ service: "minsa", operation: "validate_user", durationMs: 50, outcome: "ok", resultStatus: "valid" });
    expect(end).toMatchObject({
      stateBefore: "main_menu",
      stateAfter: "cita_awaiting_otp",
      durationMs: 400,
      externalCalls: 1,
      externalMs: 50,
      sentCount: 2,
      notes: ["confirmation_unknown"],
      slots: { citaBearer: "[redacted]", citaDniPending: "****5678", citaTwofaId: "[redacted]" },
      slotsChanged: { added: ["citaDniPending", "citaTwofaId"], removed: [], changed: [] },
    });

    const everything = raw.join("\n");
    expect(everything).not.toContain(DNI);
    expect(everything).not.toContain(TOKEN);
    expect(everything).not.toContain("51999000111");
  });

  it("logs a slow or failing outside call, and lets the error through", async () => {
    const { log, lines } = capture();
    const trace = createTurnTrace("w-1", { type: "text" }, { state: "s", slots: {} }, { log, now: clock(0, 10, 90) });

    await expect(trace.external("gemini", "resolve_fecha_ai", async () => { throw new Error("timeout"); })).rejects.toThrow("timeout");

    expect(lines()[1]).toMatchObject({
      level: "error",
      event: "turn.external",
      service: "gemini",
      operation: "resolve_fecha_ai",
      outcome: "error",
      durationMs: 80,
      error: { name: "Error", message: "timeout" },
    });
  });

  it("warns when an outside call answers unauthorized or error", async () => {
    const { log, lines } = capture();
    const trace = createTurnTrace("w-1", { type: "text" }, { state: "s", slots: {} }, { log });

    await trace.external("minsa", "list_horas", async () => ({ status: "unauthorized" }));
    await trace.external("minsa", "list_fechas", async () => ({ status: "found" }));

    expect(lines().slice(1).map((line) => [line.level, line.resultStatus])).toEqual([
      ["warn", "unauthorized"],
      ["info", "found"],
    ]);
  });

  it("flags a typed message that leaves the citizen looping at the menu", () => {
    const { log, lines } = capture();
    const trace = createTurnTrace("w-1", { type: "text", text: "asdfg" }, { state: "main_menu", slots: {} }, { log });

    trace.complete({ session: { state: "main_menu", slots: {} }, sentCount: 1 });
    trace.finish();

    expect(lines()[1]).toMatchObject({ level: "warn", event: "turn.end", friction: "menu_loop" });
  });

  it("does not flag a menu answered by a deterministic shortcut", () => {
    const { log, lines } = capture();
    const trace = createTurnTrace("w-1", { type: "text", text: "hola" }, { state: "main_menu", slots: {} }, { log });

    trace.note({ kind: "shortcut", detail: { name: "greeting" } });
    trace.complete({ session: { state: "main_menu", slots: {} }, sentCount: 1 });
    trace.finish();

    const end = lines().find((line) => line.event === "turn.end");
    expect(end?.level).toBe("info");
    expect(end).not.toHaveProperty("friction");
  });

  it("gives every log line written inside the turn its traceId, and joins an outer trace instead of opening another", async () => {
    const { log, lines } = capture();

    await traceTurn("w-1", { type: "text", messageId: "wamid.Z" }, { state: "s", slots: {} }, async (outer) => {
      log.info("deep.inside.an.adapter");
      await traceTurn("w-1", { type: "text", messageId: "wamid.Z" }, { state: "s", slots: {} }, async (inner) => {
        expect(inner).toBe(outer);
      });
    }, { log });

    const events = lines().map((line) => line.event);
    expect(events).toEqual(["turn.start", "deep.inside.an.adapter", "turn.end"]);
    const id = deriveTraceId("w-1", "wamid.Z");
    expect(lines().map((line) => line.traceId)).toEqual([id, id, id]);
  });

  it("records the failure of a turn and rethrows it", async () => {
    const { log, lines } = capture();

    await expect(
      traceTurn("w-1", { type: "text" }, { state: "s", slots: {} }, async () => { throw new Error("db down"); }, { log }),
    ).rejects.toThrow("db down");

    expect(lines().map((line) => [line.level, line.event])).toEqual([["info", "turn.start"], ["error", "turn.failed"]]);
  });
});

describe("daily log folder", () => {
  it("names the folder after the day in Lima, as DD-MM-YYYY", () => {
    expect(dateFolder(new Date("2026-09-19T15:00:00Z"))).toBe("19-09-2026");
    // 22:00 in Lima is still the 19th, although UTC is already the 20th.
    expect(dateFolder(new Date("2026-09-20T03:00:00Z"))).toBe("19-09-2026");
    expect(dateFolder(new Date("2026-09-20T05:30:00Z"))).toBe("20-09-2026");
  });

  function fakeDisk() {
    const files = new Map<string, string>();
    const made: string[] = [];
    const port: FileSystemPort = {
      mkdir: async (path) => { made.push(path); },
      appendFile: async (path, data) => { files.set(path, (files.get(path) ?? "") + data); },
    };
    return { files, made, port };
  }

  it("appends everything to app.ndjson and only warn/error to alerts.ndjson, in that day's folder", async () => {
    const disk = fakeDisk();
    const sink = createDailyFileSink({ dir: "logs", now: () => new Date("2026-09-19T15:00:00Z"), fileSystem: async () => disk.port });

    sink("info", '{"event":"a"}');
    sink("warn", '{"event":"b"}');
    sink("error", '{"event":"c"}');
    await sink.flush();

    expect(disk.made).toEqual(["logs/19-09-2026"]);
    expect(disk.files.get("logs/19-09-2026/app.ndjson")).toBe('{"event":"a"}\n{"event":"b"}\n{"event":"c"}\n');
    expect(disk.files.get("logs/19-09-2026/alerts.ndjson")).toBe('{"event":"b"}\n{"event":"c"}\n');
  });

  it("starts a new folder when the day changes", async () => {
    const disk = fakeDisk();
    let now = new Date("2026-09-19T15:00:00Z");
    const sink = createDailyFileSink({ dir: "logs", now: () => now, fileSystem: async () => disk.port });

    sink("info", "one");
    now = new Date("2026-09-20T15:00:00Z");
    sink("info", "two");
    await sink.flush();

    expect([...disk.files.keys()].sort()).toEqual(["logs/19-09-2026/app.ndjson", "logs/20-09-2026/app.ndjson"]);
  });

  it("swallows a disk error: logging never breaks a turn", async () => {
    const sink = createDailyFileSink({
      dir: "logs",
      fileSystem: async () => ({ mkdir: async () => { throw new Error("read-only file system"); }, appendFile: async () => undefined }),
    });

    sink("error", "x");
    await expect(sink.flush()).resolves.toBeUndefined();
  });
});

describe("daily log folder on a real disk", () => {
  it("creates logs/DD-MM-YYYY and writes valid NDJSON that can be read back", async () => {
    const { mkdtemp, readFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const dir = await mkdtemp(join(tmpdir(), "minsa-logs-"));
    try {
      const sink = createDailyFileSink({ dir, now: () => new Date("2026-09-19T15:00:00Z") });
      const log = createLogger({ sink, now: () => new Date("2026-09-19T15:00:00Z") });

      log.info("turn.start", { stateBefore: "main_menu" });
      log.warn("turn.note", { kind: "confirmation_unknown" });
      await sink.flush();

      const all = (await readFile(join(dir, "19-09-2026", "app.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));
      const alerts = (await readFile(join(dir, "19-09-2026", "alerts.ndjson"), "utf8")).trim().split("\n").map((line) => JSON.parse(line));

      expect(all.map((record) => record.event)).toEqual(["turn.start", "turn.note"]);
      expect(alerts.map((record) => record.event)).toEqual(["turn.note"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
