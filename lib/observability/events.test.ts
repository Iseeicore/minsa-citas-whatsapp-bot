import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOG_EVENTS, TURN_NOTE_KINDS } from "@/lib/observability/events";

const ROOT = process.cwd();
const observabilityDoc = fs.readFileSync(path.join(ROOT, "docs", "observability.md"), "utf8");

function serverSources(): string[] {
  return ["lib", "app"]
    .flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((file) => path.join(dir, file)))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => !file.startsWith(path.join("app", "components")))
    .filter((file) => file !== path.join("lib", "observability", "logger.ts"));
}

describe("log event catalog", () => {
  it("lists each event and each turn note kind once", () => {
    expect(new Set(LOG_EVENTS).size).toBe(LOG_EVENTS.length);
    expect(new Set(TURN_NOTE_KINDS).size).toBe(TURN_NOTE_KINDS.length);
  });

  it("has every event documented in docs/observability.md", () => {
    for (const event of LOG_EVENTS) expect(observabilityDoc, `${event} is missing from docs/observability.md`).toContain(`\`${event}\``);
  });

  it("has every turn note kind documented in docs/observability.md", () => {
    for (const kind of TURN_NOTE_KINDS) expect(observabilityDoc, `${kind} is missing from docs/observability.md`).toContain(`\`${kind}\``);
  });

  it("leaves no server code writing to the console directly: every line goes through the masked logger", () => {
    const offenders = serverSources().filter((file) =>
      /console\.(log|info|warn|error)\(/.test(fs.readFileSync(path.join(ROOT, file), "utf8")),
    );
    expect(offenders).toEqual([]);
  });
});
