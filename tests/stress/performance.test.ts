import { describe, expect, it } from "vitest";
import distritos from "@/data/peru-distritos.json";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { createRandom, pick } from "@/tests/support/prng";

type Row = { departamento: string; provincia: string; distrito: string };
const districtNames = (distritos as Row[]).map((row) => row.distrito);

const CLEAN = [
  "Buenas tardes, quiero agendar una cita", "necesito atención por dolor de muela", "mi DNI es 45781239",
  "quiero cita de pediatría para mi hijo", "el doctor se tarda mucho en atender", "gracias por su atención",
  "a las 8 y 45 por favor", "el lunes por la tarde", "odontología en el hospital de Lurigancho",
  "Solicito una cita para el 22 de septiembre", "no me atendieron en la posta, quiero hacer un reclamo",
];
const SPAM = [
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "!!!!!!!!!!!!!!!!!!!!!!!!!!!!", "http://spam.example.com/?q=" + "x".repeat(60),
  "🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉", "GANA DINERO FACIL ".repeat(8), "1 2 3 4 5 6 7 8 9 0 ".repeat(6), ".,;:-_/\\|".repeat(20),
  "hola ".repeat(50), "ñañañañañañañaña ".repeat(10), "́́́́a".repeat(30),
];
const INSULTS = ["idiota", "imbecil", "estupido", "cojudo", "mierda", "hdp", "csm", "ctm", "huevon", "pendejo", "malparido"];
const CONTEXT = ["doctora", "posta", "cita", "medicina", "reclamo", "hospital", "turno", "atencion"];

const LEET: Record<string, string> = { a: "4", e: "3", i: "1", o: "0", s: "5", t: "7" };
const leet = (word: string, random: () => number) =>
  [...word].map((char) => (LEET[char] && random() < 0.7 ? LEET[char] : char)).join("");
const stretch = (word: string, random: () => number) =>
  [...word].map((char) => (random() < 0.3 ? char.repeat(3 + Math.floor(random() * 3)) : char)).join("");
const spaced = (word: string) => [...word].join(random_separator());
const random_separator = () => pick(createRandom(7), [" ", ".", "-"]);

function buildCorpus(count: number): string[] {
  const random = createRandom(20260919);
  const corpus: string[] = [];

  for (let i = 0; i < count; i++) {
    const bucket = random();
    if (bucket < 0.35) {
      corpus.push(`${pick(random, CLEAN)} ${random() < 0.5 ? pick(random, districtNames) : ""}`.trim());
    } else if (bucket < 0.5) {
      corpus.push(pick(random, SPAM));
    } else if (bucket < 0.65) {
      const word = pick(random, INSULTS);
      const variant = random() < 0.5 ? leet(word, random) : random() < 0.5 ? stretch(word, random) : spaced(word);
      corpus.push(`${variant} ${random() < 0.5 ? pick(random, CLEAN) : ""}`.trim());
    } else if (bucket < 0.8) {
      corpus.push(`${pick(random, CONTEXT)} ${pick(random, INSULTS)} ${pick(random, CONTEXT)} ${pick(random, CLEAN)}`);
    } else {
      let long = "";
      while (long.length < 300) {
        long += `${random() < 0.3 ? pick(random, SPAM) : random() < 0.5 ? pick(random, CLEAN) : leet(pick(random, INSULTS), random)} `;
      }
      corpus.push(long.slice(0, 300));
    }
  }

  return corpus;
}

function percentile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

describe("D.1 latency of evaluateLexicalGuard over 10,000 varied messages", () => {
  const corpus = buildCorpus(10_000);

  it("the corpus mixes clean, spam, leetspeak, aggression and 300-character messages", () => {
    expect(corpus).toHaveLength(10_000);
    expect(corpus.filter((text) => text.length === 300).length).toBeGreaterThan(1000);
    expect(new Set(corpus).size).toBeGreaterThan(500);
  });

  it("P99 stays strictly below 2 ms", () => {
    for (let i = 0; i < 1500; i++) evaluateLexicalGuard(corpus[i]);

    const micros: number[] = [];
    for (const message of corpus) {
      const start = performance.now();
      evaluateLexicalGuard(message);
      micros.push((performance.now() - start) * 1000);
    }

    const sorted = [...micros].sort((a, b) => a - b);
    const mean = micros.reduce((total, value) => total + value, 0) / micros.length;
    const report = {
      mean: mean.toFixed(1),
      P50: percentile(sorted, 50).toFixed(1),
      P90: percentile(sorted, 90).toFixed(1),
      P95: percentile(sorted, 95).toFixed(1),
      P99: percentile(sorted, 99).toFixed(1),
      P99_9: percentile(sorted, 99.9).toFixed(1),
      max: sorted[sorted.length - 1].toFixed(1),
    };
    console.info(`[D.1] microseconds over 10,000 messages: ${JSON.stringify(report)}`);

    expect(percentile(sorted, 99)).toBeLessThan(2000);
  });

  it("the actions produced are a sensible mix (the corpus really exercises every path)", () => {
    const counts: Record<string, number> = {};
    for (const message of corpus) {
      const { action } = evaluateLexicalGuard(message);
      counts[action] = (counts[action] ?? 0) + 1;
    }
    console.info(`[D.1] actions over the corpus: ${JSON.stringify(counts)}`);

    expect(counts.ALLOW).toBeGreaterThan(1000);
    expect(counts.DROP_AND_WARN).toBeGreaterThan(100);
    expect(counts.FORCE_RECLAMO).toBeGreaterThan(100);
  });
});

describe("D.2 memory", () => {
  it("does not retain memory across 10,000 evaluations", () => {
    const corpus = buildCorpus(10_000);
    for (let i = 0; i < 2000; i++) evaluateLexicalGuard(corpus[i]);

    const gc = (globalThis as { gc?: () => void }).gc;
    gc?.();
    const before = process.memoryUsage().heapUsed;

    for (let round = 0; round < 3; round++) for (const message of corpus) evaluateLexicalGuard(message);

    gc?.();
    const growthMb = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    console.info(`[D.2] heap growth after 30,000 evaluations: ${growthMb.toFixed(1)} MB (gc exposed: ${Boolean(gc)})`);

    expect(growthMb).toBeLessThan(60);
  });
});

describe("D.3 adversarial inputs at WhatsApp's 4096-character limit (ReDoS / quadratic blow-ups)", () => {
  const MAX = 4096;
  const cases: Array<[string, string]> = [
    ["one repeated letter", "a".repeat(MAX)],
    ["word soup", "a ".repeat(MAX / 2)],
    ["only exclamation marks", "!".repeat(MAX)],
    ["only digits", "1".repeat(MAX)],
    ["dot-separated single letters", "i.".repeat(MAX / 2)],
    ["spaced single letters", "c s m ".repeat(MAX / 6)],
    ["combining accents", "á".repeat(MAX / 2)],
    ["accented letters", "á".repeat(MAX)],
    ["leet soup", "1@3$5".repeat(MAX / 5)],
    ["repeat-collapse bait", "ab".repeat(MAX / 2) + "!"],
    ["all separators", "-./,;:_".repeat(MAX / 7)],
    ["insult repeated", "idiota ".repeat(MAX / 7)],
    ["long single token", "x".repeat(MAX) + "hdp"],
  ];

  it.each(cases)("%s finishes in well under 50 ms", (_name, input) => {
    expect(input.length).toBeLessThanOrEqual(MAX + 8);

    const start = performance.now();
    evaluateLexicalGuard(input);
    const elapsed = performance.now() - start;

    console.info(`[D.3] ${_name}: ${elapsed.toFixed(2)} ms`);
    expect(elapsed).toBeLessThan(50);
  });
});
