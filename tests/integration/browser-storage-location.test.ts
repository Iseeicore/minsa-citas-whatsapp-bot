import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const BROWSER_FOLDER = "app";
const SOURCE_EXTENSIONS = [".ts", ".tsx"];
const STORAGE_WRITE = /(localStorage|sessionStorage)\s*\.\s*setItem\s*\(/;
const STORAGE_OWNER = "app/components/sandbox-chat/storage.ts";
const STORED_KEY = /localStorage\s*\.\s*setItem\s*\(\s*(\w+)/g;
const ALLOWED_STORED_KEYS = ["FROM_STORAGE_KEY"];

function sourceFiles(folder: string): string[] {
  return fs.readdirSync(path.join(ROOT, folder), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${folder}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [relative] : [];
  });
}

describe("browser storage", () => {
  it("is written only from the storage module", () => {
    const writers = sourceFiles(BROWSER_FOLDER).filter((file) => STORAGE_WRITE.test(fs.readFileSync(path.join(ROOT, file), "utf8")));

    expect(writers).toEqual([STORAGE_OWNER]);
  });

  it("stores nothing but the conversation identifier", () => {
    const source = fs.readFileSync(path.join(ROOT, STORAGE_OWNER), "utf8");
    const keys = [...source.matchAll(STORED_KEY)].map((match) => match[1]);

    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => ALLOWED_STORED_KEYS.includes(key))).toBe(true);
  });
});
