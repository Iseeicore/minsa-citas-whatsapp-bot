// One-shot connectivity check for the Google AI (Gemini) fallback
// exploration spike — no-SDD, not wired into the production conversation
// flow. Run with `npm run check:google-ai`. Prints a single clear
// success/failure line to the terminal and exits non-zero on failure so it
// is scriptable (CI-friendly) without needing to parse log JSON.
import { config } from "../config.js";
import { logger } from "../logger.js";
import { createGoogleAiClient } from "../adapters/google-ai-client.js";

async function main(): Promise<void> {
  const client = createGoogleAiClient({ config, logger });
  const result = await client.checkConnection();

  if (result.ok) {
    logger.info({ detail: result.detail }, "[check-google-ai] ✅ Conexión con Google AI establecida correctamente");
  } else {
    logger.error({ detail: result.detail }, "[check-google-ai] ❌ No se pudo establecer conexión con Google AI");
  }

  process.exitCode = result.ok ? 0 : 1;
}

void main();
