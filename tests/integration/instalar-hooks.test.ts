import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTENIDO_HOOK, Decision, MARCA_HOOK, decidirInstalacion, instalar, instalarHook } from "@/scripts/instalar-hooks.mjs";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const HOOK_SCRIPT = path.join(ROOT, "scripts", "hooks", "pre-commit");
const entornoSinGit = Object.fromEntries(
  Object.entries(process.env).filter(([clave]) => !clave.startsWith("GIT_") && clave !== "CI"),
) as NodeJS.ProcessEnv;
const hasGit = spawnSync("git", ["--version"]).status === 0;
const hasShell = spawnSync("sh", ["-c", "exit 0"]).status === 0;
const consolaMuda = () => ({ log: vi.fn(), warn: vi.fn() }) as unknown as Console;

const gitInit = (dir: string) => spawnSync("git", ["init", "-q", dir], { env: entornoSinGit }).status;

describe("instalar-hooks: what to do with the pre-commit that is already there", () => {
  it("installs when there is no hook", () => {
    expect(decidirInstalacion(null)).toBe(Decision.INSTALAR);
  });

  it("leaves a hook it did not write untouched", () => {
    expect(decidirInstalacion("#!/bin/sh\nnpx husky run\n")).toBe(Decision.AJENO);
  });

  it("does nothing when its own hook is already current", () => {
    expect(decidirInstalacion(CONTENIDO_HOOK)).toBe(Decision.AL_DIA);
  });

  it("rewrites its own hook when an older version is installed", () => {
    expect(decidirInstalacion(`#!/bin/sh\n${MARCA_HOOK}\nexit 0\n`)).toBe(Decision.ACTUALIZAR);
  });

  it("writes a POSIX launcher with LF endings that delegates to the committed script of the checkout", () => {
    expect(CONTENIDO_HOOK.startsWith("#!/bin/sh\n")).toBe(true);
    expect(CONTENIDO_HOOK).not.toContain("\r");
    expect(CONTENIDO_HOOK).toContain("scripts/hooks/pre-commit");
  });
});

describe("instalar-hooks: writing into a hooks folder", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "instalar-hooks-"));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("creates the folder and the hook, and a second run changes nothing", () => {
    const carpeta = path.join(dir, "hooks");

    expect(instalarHook(carpeta).decision).toBe(Decision.INSTALAR);
    expect(fs.readFileSync(path.join(carpeta, "pre-commit"), "utf8")).toBe(CONTENIDO_HOOK);
    expect(instalarHook(carpeta).decision).toBe(Decision.AL_DIA);
  });

  it("keeps a foreign pre-commit byte for byte", () => {
    const ajeno = "#!/bin/sh\necho mio\n";
    fs.writeFileSync(path.join(dir, "pre-commit"), ajeno);

    expect(instalarHook(dir).decision).toBe(Decision.AJENO);
    expect(fs.readFileSync(path.join(dir, "pre-commit"), "utf8")).toBe(ajeno);
  });
});

describe("instalar-hooks: when it runs from npm", () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "instalar-hooks-repo-"));
  });

  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("does nothing in CI", () => {
    expect(instalar({ cwd: dir, env: { ...entornoSinGit, CI: "true" }, consola: consolaMuda() })).toBe(Decision.OMITIDO);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it.skipIf(!hasGit)("does nothing outside a git work tree, like the Docker build", () => {
    expect(instalar({ cwd: dir, env: entornoSinGit, consola: consolaMuda() })).toBe(Decision.OMITIDO);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it.skipIf(!hasGit)("installs into the hooks folder of the common git dir and never touches the git config", () => {
    expect(gitInit(dir)).toBe(0);
    const config = fs.readFileSync(path.join(dir, ".git", "config"), "utf8");

    expect(instalar({ cwd: dir, env: entornoSinGit, consola: consolaMuda() })).toBe(Decision.INSTALAR);
    expect(fs.readFileSync(path.join(dir, ".git", "hooks", "pre-commit"), "utf8")).toBe(CONTENIDO_HOOK);
    expect(fs.readFileSync(path.join(dir, ".git", "config"), "utf8")).toBe(config);
  });
});

describe("the committed pre-commit script", () => {
  it("keeps LF endings, so a Windows checkout cannot break it", () => {
    expect(read("scripts/hooks/pre-commit")).not.toContain("\r");
    expect(read(".gitattributes")).toContain("scripts/hooks/* text eol=lf");
  });

  it("is installed by prepare without failing when the script is missing, as in the deps stage of the Dockerfile", () => {
    const { scripts } = JSON.parse(read("package.json")) as { scripts: Record<string, string> };

    expect(scripts.prepare).toContain("import('./scripts/instalar-hooks.mjs')");
    expect(scripts.prepare).toContain("() => {}");
  });

  it.skipIf(!hasGit || !hasShell)("lets the commit through with a warning when lint-staged is not installed in the checkout", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pre-commit-"));
    try {
      expect(gitInit(dir)).toBe(0);
      const result = spawnSync("sh", [HOOK_SCRIPT], { cwd: dir, env: entornoSinGit, encoding: "utf8" });

      expect(result.status).toBe(0);
      expect(result.stderr).toContain("lint-staged");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
