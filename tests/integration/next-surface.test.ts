import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const SOURCE_FOLDERS = ["app", "lib"];
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const PUBLIC_FOLDER = "public";
const NEXT_CONFIG = "next.config.ts";
const FIRST_PATCHED_NEXT = [16, 4, 1];
const EXACT_VERSION = /^(\d+)\.(\d+)\.(\d+)$/;
const FORBIDDEN_FEATURE = /next\/og|ImageResponse|["']use cache["']|cacheComponents/;
const IMAGES_NOT_OPTIMIZED = /images:\s*\{\s*unoptimized:\s*true\s*\}/;

function sourceFiles(folder: string): string[] {
  return fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [relative] : [];
  });
}

function nextVersion(): number[] {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  const match = EXACT_VERSION.exec(manifest.dependencies.next);
  return match ? match.slice(1).map(Number) : [];
}

function isAtLeast(version: number[], minimum: number[]): boolean {
  for (const [index, part] of minimum.entries()) {
    if (version[index] !== part) return version[index] > part;
  }
  return true;
}

describe("Next.js attack surface", () => {
  it("pins Next.js to an exact version that already carries the security fixes", () => {
    const version = nextVersion();

    expect(version).toHaveLength(3);
    expect(isAtLeast(version, FIRST_PATCHED_NEXT)).toBe(true);
  });

  it("compares versions by their numeric parts and not as text", () => {
    expect(isAtLeast([16, 10, 0], FIRST_PATCHED_NEXT)).toBe(true);
    expect(isAtLeast([16, 3, 6], FIRST_PATCHED_NEXT)).toBe(false);
    expect(isAtLeast([17, 0, 0], FIRST_PATCHED_NEXT)).toBe(true);
  });

  it("uses no ImageResponse, use cache or Cache Components", () => {
    const files = SOURCE_FOLDERS.flatMap(sourceFiles);
    const users = files.filter((file) => FORBIDDEN_FEATURE.test(fs.readFileSync(path.join(ROOT, file), "utf8")));

    expect(files.length).toBeGreaterThan(0);
    expect(users).toEqual([]);
  });

  it("recognises each forbidden feature when it appears", () => {
    expect(FORBIDDEN_FEATURE.test('import { ImageResponse } from "next/og";')).toBe(true);
    expect(FORBIDDEN_FEATURE.test('"use cache"')).toBe(true);
    expect(FORBIDDEN_FEATURE.test("cacheComponents: true")).toBe(true);
  });

  it("serves images as they are, without the optimisation endpoint", () => {
    expect(IMAGES_NOT_OPTIMIZED.test(fs.readFileSync(path.join(ROOT, NEXT_CONFIG), "utf8"))).toBe(true);
  });

  it("ships no SVG file in the public folder", () => {
    const svgs = fs.readdirSync(path.join(ROOT, PUBLIC_FOLDER)).filter((name) => path.extname(name) === ".svg");

    expect(svgs).toEqual([]);
  });
});
