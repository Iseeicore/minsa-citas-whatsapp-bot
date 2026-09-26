import { isRegisteredLlmProvider } from "@/lib/fsm/parsing/ai/llm-registry";
import { logger } from "@/lib/observability/logger";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";

export const CONFIG_ERRORS = {
  AI_PROVIDER_UNKNOWN: {
    severity: "error",
    message: "AI_PROVIDER no corresponde a ningún proveedor registrado; la IA queda desactivada y se usan los respaldos fijos.",
  },
  SANDBOX_ORIGIN_INVALID: {
    severity: "warn",
    message: "Una entrada de SANDBOX_ALLOWED_ORIGINS no es una URL (falta https://) y se ignora.",
  },
} as const satisfies Record<string, { severity: "warn" | "error"; message: string }>;

export type ConfigErrorCode = keyof typeof CONFIG_ERRORS;

export type ConfigIssue = { code: ConfigErrorCode; value: string; message: string };

type Env = Record<string, string | undefined>;

const issue = (code: ConfigErrorCode, value: string): ConfigIssue => ({ code, value, message: CONFIG_ERRORS[code].message });

/** Revisa las variables que el bot tolera mal escritas (sigue funcionando con su respaldo) y devuelve cada problema; no tiene efectos. */
export function checkConfig(env: Env = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  const provider = env.AI_PROVIDER;
  if (provider && !isRegisteredLlmProvider(provider)) issues.push(issue("AI_PROVIDER_UNKNOWN", provider));

  for (const entry of parseAllowedOrigins(env.SANDBOX_ALLOWED_ORIGINS).invalid) issues.push(issue("SANDBOX_ORIGIN_INVALID", entry));

  return issues;
}

export function reportConfigIssues(env: Env = process.env): ConfigIssue[] {
  const issues = checkConfig(env);
  for (const found of issues) logger[CONFIG_ERRORS[found.code].severity]("config.invalid", { issue: found.code, value: found.value, message: found.message });
  return issues;
}
