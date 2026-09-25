import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GOLDEN_OOS_MESSAGES } from "@/tests/support/oos-golden";
import { CHANNELS } from "./out-of-scope-channels";
import { OOS_MESSAGES } from "./out-of-scope-messages";

// Every phone number and link the citizen is sent to lives in ONE place
// (out-of-scope-channels.ts), so checking one with its institution and changing it
// never means hunting through nine paragraphs. These tests keep it that way.

const channelValues = Object.values(CHANNELS);
const allTexts = Object.values(OOS_MESSAGES);

describe("the fixed texts are exactly the ones approved", () => {
  it("the nine messages are exactly what was approved (change one on purpose: update tests/support/oos-golden.ts too)", () => {
    expect(OOS_MESSAGES).toEqual(GOLDEN_OOS_MESSAGES);
  });
});

describe("the channels file is the single source of every contact", () => {
  it("every channel is used by at least one text (no dead entry)", () => {
    for (const [name, value] of Object.entries(CHANNELS)) {
      expect(allTexts.some((text) => text.includes(value)), name).toBe(true);
    }
  });

  it("no text carries a phone number, short line or web address that is not in the channels file", () => {
    const shortLines = /\b1\d{2}\b/g;
    const mobiles = /\b\d{3} \d{3} \d{3}\b/g;
    const addresses = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:gob\.pe|pe|com)(?:\/\w+)?/g;

    for (const text of allTexts) {
      for (const pattern of [shortLines, mobiles, addresses]) {
        for (const found of text.match(pattern) ?? []) {
          expect(channelValues, `«${found}» is hardcoded in a message`).toContain(found);
        }
      }
    }
  });

  it("the messages file never writes a channel by hand: it only reads it from CHANNELS", () => {
    // The interpolations themselves (`${CHANNELS.linea113}`) are the allowed way to mention one.
    const source = fs
      .readFileSync(path.join(process.cwd(), "lib", "fsm", "flows", "out-of-scope", "out-of-scope-messages.ts"), "utf8")
      .replace(/\$\{CHANNELS\.\w+\}/g, "");

    for (const [name, value] of Object.entries(CHANNELS)) {
      expect(source.includes(value), `«${value}» (${name}) is written by hand in out-of-scope-messages.ts`).toBe(false);
    }
  });

  it("every channel is in the verification checklist, so none can be added without being checked", () => {
    const checklist = fs.readFileSync(path.join(process.cwd(), "docs", "out-of-scope-channels.md"), "utf8");

    for (const [name, value] of Object.entries(CHANNELS)) {
      expect(checklist.includes(`\`${value}\``), `${name} («${value}») is missing from docs/out-of-scope-channels.md`).toBe(true);
    }
  });

  it("the emergency numbers are the national ones", () => {
    expect(CHANNELS.samu).toBe("106");
    expect(CHANNELS.bomberos).toBe("116");
  });
});
