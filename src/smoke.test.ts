import { describe, expect, it } from "vitest";
// NodeNext requires a ".js" specifier on relative imports even though the
// source file is "./config.ts" — this is the exact resolution shape every
// other test file in this change relies on. If this import fails to
// resolve, the harness assumption in the design doc is wrong and every
// later test in this change would be built on sand.
import { config } from "./config.js";

describe("vitest harness bootstrap", () => {
  it("resolves a relative NodeNext .js specifier to a sibling .ts module", () => {
    expect(config.port).toBe(3000);
  });
});
