import { timedFetch } from "@/lib/observability/http";
import { logger } from "@/lib/observability/logger";
import { signMinsaRequest } from "@/lib/integrations/minsa/signature";
import { nowInLima, todayInLima } from "@/lib/time/lima-clock";

const HTTP_SERVICE_UNAVAILABLE = 503;

function minsaHost(): string {
  return process.env.MINSA_API_HOST ?? "";
}

export const MINSA_DIGITAL_LOGIN_PATH = "/login";

export function minsaDigitalAppUrl(): string {
  return (process.env.MINSA_DIGITAL_APP_URL ?? "").trim().replace(/\/+$/, "");
}

export function minsaDigitalUrl(path = ""): string | null {
  const base = minsaDigitalAppUrl();
  return base ? `${base}${path}` : null;
}

export function minsaDigitalOrigin(): string | null {
  const base = minsaDigitalAppUrl();
  if (!base) return null;
  try {
    return new URL(base).origin;
  } catch {
    return null;
  }
}

function minsaDigitalBrowserHeaders(): Record<string, string> {
  const origin = minsaDigitalOrigin();
  return origin ? { Origin: origin, Referer: `${origin}/` } : {};
}

/** Interruptor compartido: fuera del sandbox real, todas las integraciones MINSA usan datos simulados. */
export function isRealMinsaEnabled(): boolean {
  return process.env.SANDBOX_USE_REAL_MINSA === "true";
}

export async function postSigned(path: string, body: Record<string, unknown>): Promise<Response> {
  const bodyJson = JSON.stringify(body);
  const signedHeaders = signMinsaRequest(bodyJson);

  return timedFetch("minsa", path, `${minsaHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...signedHeaders,
    },
    body: bodyJson,
  });
}

export async function postWithBearer(
  path: string,
  body: Record<string, unknown>,
  bearer: string,
): Promise<Response> {
  if (isRealMinsaEnabled() && minsaDigitalOrigin() === null) {
    logger.error("minsa.request_blocked", { path, reason: "MINSA_DIGITAL_APP_URL_MISSING" });
    return new Response(null, { status: HTTP_SERVICE_UNAVAILABLE });
  }

  return timedFetch("minsa", path, `${minsaHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      ...minsaDigitalBrowserHeaders(),
    },
    body: JSON.stringify(body),
  });
}

export function todayYYYYMMDD(): string {
  return nowInLima().fecha;
}

export function endOfMonthYYYYMMDD(): string {
  const { year, month } = todayInLima();
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}${String(month).padStart(2, "0")}${String(lastDay).padStart(2, "0")}`;
}
