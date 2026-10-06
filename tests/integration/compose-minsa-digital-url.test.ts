import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const compose = fs.readFileSync(path.join(process.cwd(), "docker-compose.yml"), "utf8");
const withoutComments = compose.replace(/^\s*#.*$/gm, "");

describe("docker-compose.yml", () => {
  it("exige MINSA_DIGITAL_APP_URL: el servidor no arranca sin ella", () => {
    expect(withoutComments).toMatch(/^\s+MINSA_DIGITAL_APP_URL: \$\{MINSA_DIGITAL_APP_URL:\?[^}]+\}\s*$/m);
  });

  it("la exige igual que las credenciales de Meta", () => {
    const required = [...withoutComments.matchAll(/^\s+([A-Z0-9_]+): \$\{\1:\?[^}]+\}\s*$/gm)].map((match) => match[1]);

    expect(required).toEqual(
      expect.arrayContaining(["META_ACCESS_TOKEN", "META_PHONE_NUMBER_ID", "META_WEBHOOK_VERIFY_TOKEN", "META_APP_SECRET", "MINSA_DIGITAL_APP_URL"]),
    );
  });
});
