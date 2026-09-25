import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// .env.example is a bare list of variables in two blocks, each opened by a
// "##### " title: the minimum for the MINSA Docker server (WhatsApp, citas and
// the connected frontend), then every optional variable. The README documents
// them. This keeps the three in sync: every variable the app reads is listed,
// nothing dead is listed (e.g. a leftover REDIS_URL), and each one is
// documented.

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

// Set by the platform or the build, never by whoever fills in a .env.
const PLATFORM_VARIABLES = new Set(["NODE_ENV", "VERCEL", "NEXT_OUTPUT_STANDALONE"]);

const SECTION_TITLE = /^##### \S/;
const MINIMUM = [
  "META_APP_SECRET",
  "META_WEBHOOK_VERIFY_TOKEN",
  "META_ACCESS_TOKEN",
  "META_PHONE_NUMBER_ID",
  "META_GRAPH_API_VERSION",
  "MINSA_API_HOST",
  "MINSA_INTEGRATION_SECRET",
  "MINSA_CONVERSATION_ID_PLACEHOLDER",
  "SANDBOX_USE_REAL_MINSA",
  "GOOGLE_CLIENT_API",
  "GOOGLE_AI_MODEL",
  "SANDBOX_USE_REAL_AI",
  "SANDBOX_ENABLED",
  "SANDBOX_ALLOWED_ORIGINS",
  "DATABASE_ENABLED",
];

const allLines = read(".env.example").split(/\r?\n/).filter((line) => line.trim() !== "");
const exampleLines = allLines.filter((line) => !SECTION_TITLE.test(line));
const exampleNames = exampleLines.map((line) => line.split("=")[0]);

function variablesReadByTheApp(): Set<string> {
  const sources = ["lib", "app"]
    .flatMap((dir) => fs.readdirSync(path.join(ROOT, dir), { recursive: true, encoding: "utf8" }).map((f) => path.join(dir, f)))
    .filter((file) => /\.(ts|tsx)$/.test(file) && !file.endsWith(".test.ts"))
    .concat(["next.config.ts", "prisma/schema.prisma"]);

  const names = new Set<string>();
  const patterns = [
    /process\.env\.([A-Z0-9_]+)/g,
    /process\.env\["([A-Z0-9_]+)"\]/g,
    /numberFromEnv\("([A-Z0-9_]+)"\)/g,
    /env\("([A-Z0-9_]+)"\)/g,
  ];
  for (const file of sources) {
    const text = read(file);
    for (const pattern of patterns) for (const match of text.matchAll(pattern)) names.add(match[1]);
  }
  // docker-compose.yml's own knobs (HOST_PORT) are filled in from the same .env.
  const composeWithoutComments = read("docker-compose.yml").replace(/^\s*#.*$/gm, "");
  for (const match of composeWithoutComments.matchAll(/\$\{([A-Z0-9_]+)/g)) names.add(match[1]);

  for (const name of PLATFORM_VARIABLES) names.delete(name);
  return names;
}

describe(".env.example", () => {
  it("is a bare NAME=value list: no comments or inline notes, only the two section titles", () => {
    for (const line of exampleLines) expect(line).toMatch(/^[A-Z][A-Z0-9_]*=[^#\s]*$/);
    expect(allLines.filter((line) => SECTION_TITLE.test(line))).toHaveLength(2);
  });

  it("opens with the minimum block: exactly what the MINSA Docker server needs", () => {
    const [first, second] = allLines.map((line, index) => (SECTION_TITLE.test(line) ? index : -1)).filter((i) => i >= 0);
    expect(first).toBe(0);
    expect(allLines.slice(1, second).map((line) => line.split("=")[0])).toEqual(MINIMUM);
  });

  it("lists every variable the app reads, and nothing it does not read", () => {
    expect([...exampleNames].sort()).toEqual([...variablesReadByTheApp()].sort());
  });

  it("lists each variable once", () => {
    expect(new Set(exampleNames).size).toBe(exampleNames.length);
  });

  it("has every variable documented in the README", () => {
    const readme = read("README.md");
    for (const name of exampleNames) expect(readme, `${name} is missing from README.md`).toContain(`\`${name}\``);
  });
});
