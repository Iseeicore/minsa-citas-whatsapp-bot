import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");
const SCRIPT = path.join(ROOT, "scripts", "docker-entrypoint.sh");

const hasShell = spawnSync("sh", ["-c", "exit 0"]).status === 0;

describe("the Docker image applies the migrations on start", () => {
  it("pins the Prisma CLI of the image to the exact version the lockfile installs", () => {
    const pinned = /ARG PRISMA_VERSION=(\S+)/.exec(read("Dockerfile"))?.[1];
    const locked = JSON.parse(read("package-lock.json")).packages["node_modules/prisma"].version as string;

    expect(pinned).toBe(locked);
  });

  it("copies the schema, the migrations and the entrypoint into the runtime image and starts through it", () => {
    const dockerfile = read("Dockerfile");

    expect(dockerfile).toContain("prisma/migrations ./prisma/migrations");
    expect(dockerfile).toContain("prisma/schema.prisma ./prisma/schema.prisma");
    expect(dockerfile).toContain("scripts/docker-entrypoint.sh");
    expect(dockerfile).toContain('ENTRYPOINT ["docker-entrypoint.sh"]');
    expect(dockerfile).toContain('CMD ["node", "server.js"]');
  });

  it("keeps the entrypoint with LF endings, so a Windows checkout cannot break it", () => {
    expect(read("scripts/docker-entrypoint.sh")).not.toContain("\r");
    expect(read(".gitattributes")).toContain("scripts/docker-entrypoint.sh text eol=lf");
  });
});

describe.skipIf(!hasShell)("docker-entrypoint.sh", () => {
  let dir: string;
  let okCli: string;
  let failingCli: string;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "entrypoint-"));
    okCli = path.join(dir, "ok.js");
    failingCli = path.join(dir, "fail.js");
    fs.writeFileSync(okCli, 'console.log("MIGRATE_RAN " + process.argv.slice(2).join(" "));');
    fs.writeFileSync(failingCli, "process.exit(1);");
  });

  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  const run = (env: Record<string, string>, cli = okCli) => {
    const result = spawnSync("sh", [SCRIPT, "echo", "SERVER_STARTED"], {
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", PRISMA_CLI: cli, PRISMA_SCHEMA: "schema.prisma", ...env },
      encoding: "utf8",
    });
    return { status: result.status, out: `${result.stdout}${result.stderr}` };
  };

  it("active database and a URL: migrates, then starts the server", () => {
    const result = run({ DATABASE_ENABLED: "true", DATABASE_URL: "postgresql://x" });

    expect(result.status).toBe(0);
    expect(result.out).toContain("MIGRATE_RAN migrate deploy --schema schema.prisma");
    expect(result.out.indexOf("MIGRATE_RAN")).toBeLessThan(result.out.indexOf("SERVER_STARTED"));
  });

  it("an unset flag counts as active, like the application does", () => {
    const result = run({ DATABASE_URL: "postgresql://x" });

    expect(result.out).toContain("MIGRATE_RAN");
    expect(result.out).toContain("SERVER_STARTED");
  });

  it("active database without a URL: stops with an error and never starts the server", () => {
    const result = run({ DATABASE_ENABLED: "true" });

    expect(result.status).toBe(1);
    expect(result.out).toContain("DATABASE_URL está vacía");
    expect(result.out).not.toContain("MIGRATE_RAN");
    expect(result.out).not.toContain("SERVER_STARTED");
  });

  it("failed migrations: stops and never starts the server", () => {
    const result = run({ DATABASE_ENABLED: "true", DATABASE_URL: "postgresql://x" }, failingCli);

    expect(result.status).toBe(1);
    expect(result.out).toContain("las migraciones fallaron");
    expect(result.out).not.toContain("SERVER_STARTED");
  });

  it("reset confirmed with the database name: wipes first, then migrates from scratch, then starts", () => {
    const result = run({
      DATABASE_ENABLED: "true",
      DATABASE_URL: "postgresql://u:p@host:5432/bd_chatbot?schema=public",
      RESET_DATABASE_CONFIRM: "bd_chatbot",
    });

    expect(result.status).toBe(0);
    expect(result.out.indexOf("db execute")).toBeGreaterThan(-1);
    expect(result.out.indexOf("db execute")).toBeLessThan(result.out.indexOf("migrate deploy"));
    expect(result.out.indexOf("migrate deploy")).toBeLessThan(result.out.indexOf("SERVER_STARTED"));
  });

  it("reset with a wrong database name: wipes nothing and never starts the server", () => {
    const result = run({
      DATABASE_ENABLED: "true",
      DATABASE_URL: "postgresql://u:p@host:5432/bd_chatbot",
      RESET_DATABASE_CONFIRM: "otra_base",
    });

    expect(result.status).toBe(1);
    expect(result.out).toContain("no coincide");
    expect(result.out).not.toContain("db execute");
    expect(result.out).not.toContain("SERVER_STARTED");
  });

  it("without the reset variable: never wipes", () => {
    const result = run({ DATABASE_ENABLED: "true", DATABASE_URL: "postgresql://u:p@host:5432/bd_chatbot" });

    expect(result.out).not.toContain("db execute");
  });

  it("disabled database without a URL: warns and starts without migrating", () => {
    const result = run({ DATABASE_ENABLED: "false" });

    expect(result.status).toBe(0);
    expect(result.out).toContain("no hay base de datos activa");
    expect(result.out).toContain("SERVER_STARTED");
    expect(result.out).not.toContain("MIGRATE_RAN");
  });

  it("disabled database with a URL: warns about the leftover URL and starts without migrating", () => {
    const result = run({ DATABASE_ENABLED: "false", DATABASE_URL: "postgresql://x" });

    expect(result.status).toBe(0);
    expect(result.out).toContain("DATABASE_URL tiene un valor");
    expect(result.out).toContain("SERVER_STARTED");
    expect(result.out).not.toContain("MIGRATE_RAN");
  });

  it("never prints the connection string, which carries the password", () => {
    const result = run({ DATABASE_ENABLED: "false", DATABASE_URL: "postgresql://user:secreto@host/db" });

    expect(result.out).not.toContain("secreto");
  });
});
