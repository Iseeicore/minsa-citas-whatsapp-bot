import { it } from "vitest";

export const gap: typeof it =
  import.meta.env.MODE === "strict-gaps" ? it : (it.fails as unknown as typeof it);
