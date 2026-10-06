import { isRegisteredLlmProvider } from "@/lib/fsm/parsing/ai/llm-registry";
import { logger } from "@/lib/observability/logger";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";
import { ConfigErrorCode } from "@/lib/enums/config-error-code";

type Severity = "warn" | "error";

type ConfigErrorEntry = { severity: Severity; severityWithRealMinsa?: Severity; message: string };

export const CONFIG_ERRORS = {
  [ConfigErrorCode.AI_PROVIDER_UNKNOWN]: {
    severity: "error",
    message: "AI_PROVIDER no corresponde a ningún proveedor registrado; la IA queda desactivada y se usan los respaldos fijos.",
  },
  [ConfigErrorCode.SANDBOX_ORIGIN_INVALID]: {
    severity: "warn",
    message: "Una entrada de SANDBOX_ALLOWED_ORIGINS no es una URL (falta https://) y se ignora.",
  },
  [ConfigErrorCode.MINSA_DIGITAL_APP_URL_MISSING]: {
    severity: "warn",
    severityWithRealMinsa: "error",
    message: "MINSA_DIGITAL_APP_URL no está configurada: la bienvenida de WhatsApp muestra el menú principal, los avisos que llevaban botón hacia MINSA Digital salen como texto sin enlace y, con el MINSA real, las llamadas autenticadas se cortan con un 503 porque no se puede armar Origin ni Referer.",
  },
} as const satisfies Record<ConfigErrorCode, ConfigErrorEntry>;

export type { ConfigErrorCode };

export type ConfigIssue = { code: ConfigErrorCode; value: string; message: string };

type Env = Record<string, string | undefined>;

function severityOf(code: ConfigErrorCode, env: Env): Severity {
  const entry: ConfigErrorEntry = CONFIG_ERRORS[code];
  return env.SANDBOX_USE_REAL_MINSA === "true" && entry.severityWithRealMinsa ? entry.severityWithRealMinsa : entry.severity;
}

const issue = (code: ConfigErrorCode, value: string): ConfigIssue => ({ code, value, message: CONFIG_ERRORS[code].message });

/** Revisa las variables que el bot tolera mal escritas (sigue funcionando con su respaldo) y devuelve cada problema; no tiene efectos. */
export function checkConfig(env: Env = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  const provider = env.AI_PROVIDER;
  if (provider && !isRegisteredLlmProvider(provider)) issues.push(issue(ConfigErrorCode.AI_PROVIDER_UNKNOWN, provider));

  for (const entry of parseAllowedOrigins(env.SANDBOX_ALLOWED_ORIGINS).invalid) issues.push(issue(ConfigErrorCode.SANDBOX_ORIGIN_INVALID, entry));

  if (!env.MINSA_DIGITAL_APP_URL) issues.push(issue(ConfigErrorCode.MINSA_DIGITAL_APP_URL_MISSING, env.MINSA_DIGITAL_APP_URL ?? ""));

  return issues;
}

export function reportConfigIssues(env: Env = process.env): ConfigIssue[] {
  const issues = checkConfig(env);
  for (const found of issues) logger[severityOf(found.code, env)]("config.invalid", { issue: found.code, value: found.value, message: found.message });
  return issues;
}
