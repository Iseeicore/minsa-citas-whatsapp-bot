import { isRegisteredLlmProvider } from "@/lib/fsm/parsing/ai/llm-registry";
import { logger } from "@/lib/observability/logger";
import { parseAllowedOrigins } from "@/lib/security/allowed-origins";
import { ConfigErrorCode } from "@/lib/enums/config-error-code";
import { findInvalidEvidenceImageMaxMb } from "@/lib/config/evidence";
import { EVIDENCE_IMAGE_MAX_MB_DEFAULT, EVIDENCE_IMAGE_MAX_MB_MIN, META_IMAGE_MAX_MB } from "@/lib/constants/limits/incidencia";
import {
  findGoogleClientApi,
  findMetaAccessToken,
  findMetaAppSecret,
  findMetaPhoneNumberId,
  findMinsaApiHost,
  findMinsaIntegrationSecret,
} from "@/lib/config/integrations";

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
    message:
      "MINSA_DIGITAL_APP_URL no está configurada: la bienvenida de WhatsApp muestra el menú principal, los avisos que llevaban botón hacia MINSA Responde salen como texto sin enlace y, con el MINSA real, las llamadas autenticadas se cortan con un 503 porque no se puede armar Origin ni Referer.",
  },
  [ConfigErrorCode.EVIDENCE_IMAGE_MAX_MB_INVALID]: {
    severity: "warn",
    message: `EVIDENCE_IMAGE_MAX_MB debe ser un número entero de ${EVIDENCE_IMAGE_MAX_MB_MIN} a ${META_IMAGE_MAX_MB} (Meta no admite imágenes de más de ${META_IMAGE_MAX_MB} MB); se ignora y las imágenes de la denuncia usan el valor por defecto, ${EVIDENCE_IMAGE_MAX_MB_DEFAULT} MB.`,
  },
  [ConfigErrorCode.META_APP_SECRET_MISSING]: {
    severity: "error",
    message:
      "META_APP_SECRET no está configurada: el webhook de WhatsApp no puede comprobar la firma de Meta y rechaza con 403 todo lo que llega.",
  },
  [ConfigErrorCode.META_ACCESS_TOKEN_MISSING]: {
    severity: "error",
    message:
      "META_ACCESS_TOKEN no está configurada: whatsapp-bot no puede enviar respuestas ni descargar imágenes, Meta rechaza cada llamada.",
  },
  [ConfigErrorCode.META_PHONE_NUMBER_ID_MISSING]: {
    severity: "error",
    message: "META_PHONE_NUMBER_ID no está configurada: whatsapp-bot no sabe desde qué número responder y Meta rechaza cada envío.",
  },
  [ConfigErrorCode.MINSA_API_HOST_MISSING]: {
    severity: "error",
    message:
      "MINSA_API_HOST no está configurada con el MINSA real (SANDBOX_USE_REAL_MINSA=true): las consultas de identidad, catálogo, reserva y referencias fallan.",
  },
  [ConfigErrorCode.MINSA_INTEGRATION_SECRET_MISSING]: {
    severity: "error",
    message:
      "MINSA_INTEGRATION_SECRET no está configurada con el MINSA real (SANDBOX_USE_REAL_MINSA=true): la consulta de identidad sale firmada con una clave vacía y el MINSA la rechaza.",
  },
  [ConfigErrorCode.GOOGLE_CLIENT_API_MISSING]: {
    severity: "error",
    message:
      "GOOGLE_CLIENT_API no está configurada con la IA real activa (SANDBOX_USE_REAL_AI=true): Gemini rechaza cada consulta y el bot usa los respaldos fijos.",
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

type RequiredVariable = { code: ConfigErrorCode; find: (env: Env) => string | undefined };

const REQUIRED_ALWAYS: RequiredVariable[] = [
  { code: ConfigErrorCode.META_APP_SECRET_MISSING, find: findMetaAppSecret },
  { code: ConfigErrorCode.META_ACCESS_TOKEN_MISSING, find: findMetaAccessToken },
  { code: ConfigErrorCode.META_PHONE_NUMBER_ID_MISSING, find: findMetaPhoneNumberId },
];

const REQUIRED_WITH_REAL_MINSA: RequiredVariable[] = [
  { code: ConfigErrorCode.MINSA_API_HOST_MISSING, find: findMinsaApiHost },
  { code: ConfigErrorCode.MINSA_INTEGRATION_SECRET_MISSING, find: findMinsaIntegrationSecret },
];

const REQUIRED_WITH_REAL_AI: RequiredVariable[] = [{ code: ConfigErrorCode.GOOGLE_CLIENT_API_MISSING, find: findGoogleClientApi }];

function findMissingVariables(env: Env): ConfigIssue[] {
  const required = [
    ...REQUIRED_ALWAYS,
    ...(env.SANDBOX_USE_REAL_MINSA === "true" ? REQUIRED_WITH_REAL_MINSA : []),
    ...(env.SANDBOX_USE_REAL_AI === "true" ? REQUIRED_WITH_REAL_AI : []),
  ];
  return required.filter((variable) => variable.find(env) === undefined).map((variable) => issue(variable.code, ""));
}

export function checkConfig(env: Env = process.env): ConfigIssue[] {
  const issues: ConfigIssue[] = [];

  const provider = env.AI_PROVIDER;
  if (provider && !isRegisteredLlmProvider(provider)) issues.push(issue(ConfigErrorCode.AI_PROVIDER_UNKNOWN, provider));

  for (const entry of parseAllowedOrigins(env.SANDBOX_ALLOWED_ORIGINS).invalid)
    issues.push(issue(ConfigErrorCode.SANDBOX_ORIGIN_INVALID, entry));

  if (!env.MINSA_DIGITAL_APP_URL) issues.push(issue(ConfigErrorCode.MINSA_DIGITAL_APP_URL_MISSING, env.MINSA_DIGITAL_APP_URL ?? ""));

  const evidenceImageMaxMb = findInvalidEvidenceImageMaxMb(env);
  if (evidenceImageMaxMb !== undefined) issues.push(issue(ConfigErrorCode.EVIDENCE_IMAGE_MAX_MB_INVALID, evidenceImageMaxMb));

  issues.push(...findMissingVariables(env));

  return issues;
}

export function reportConfigIssues(env: Env = process.env): ConfigIssue[] {
  const issues = checkConfig(env);
  for (const found of issues)
    logger[severityOf(found.code, env)]("config.invalid", { issue: found.code, value: found.value, message: found.message });
  return issues;
}
