import { timedFetch } from "@/lib/observability/http";
import { signMinsaRequest } from "@/lib/integrations/minsa/signature";
import { nowInLima, todayInLima } from "@/lib/time/lima-clock";

function minsaHost(): string {
  return process.env.MINSA_API_HOST ?? "";
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
  return timedFetch("minsa", path, `${minsaHost()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${bearer}`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Origin: "https://dminsadigital.minsa.gob.pe",
      Referer: "https://dminsadigital.minsa.gob.pe/",
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
