import { it } from "vitest";

// A DOCUMENTED defect: the assertion states the behavior we WANT, and today it
// does not hold. In the normal run it is registered with `it.fails`, so
// `npm test` stays green while the gap stays visible in the suite; the moment
// the code is fixed the test flips red and the marker must be removed.
//
//   npm test            -> gaps are expected failures (green)
//   npm run test:gaps   -> gaps run as normal tests, showing the real failures
export const gap: typeof it =
  import.meta.env.MODE === "strict-gaps" ? it : (it.fails as unknown as typeof it);
