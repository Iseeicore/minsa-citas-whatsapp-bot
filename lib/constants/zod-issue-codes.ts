import type { z } from "zod";

export const ZOD_TOO_BIG_ISSUE_CODE = "too_big" satisfies z.ZodError["issues"][number]["code"];
