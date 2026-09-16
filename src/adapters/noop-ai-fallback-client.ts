import type { AiFallbackClient } from "../ports/ai-fallback-client.js";

// Null-object adapter (AI ubigeo pre-check, no-SDD exploration): the
// production default until the feature is explicitly wanted on real
// traffic. `checkConnection` reports honestly that nothing is configured;
// `validateUbigeo` always reports "valid" — a pure pass-through, IDENTICAL
// to the Cita flow's behavior before this feature existed. Swapping this
// for `createGoogleAiClient` is the only change needed to turn the real
// check on for a given composition (worker.ts / create-sandbox-deps.ts).
export function createNoopAiFallbackClient(): AiFallbackClient {
  return {
    async checkConnection() {
      return { ok: false, detail: "AI fallback no configurado (adapter no-op)." };
    },
    async validateUbigeo() {
      return { status: "ubigeo_ai_valid" };
    },
  };
}
