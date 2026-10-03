import { timedFetch } from "@/lib/observability/http";
import { isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";

export type SubmitQuejaPayload = {
  celular: string;
  dni: string | null;
  nombreCompleto: string | null;
  queja: string;
  mediaDataUri?: string;
};

export type SubmitQuejaResult =
  | { status: "accepted" }
  | { status: "rejected"; reason: "media_too_large" | "other" }
  | { status: "error" };

function classifyRejection(bodyText: string): "media_too_large" | "other" {
  return /imagen|tama[nñ]o|size/i.test(bodyText) ? "media_too_large" : "other";
}

/**
 * Usa el interruptor de MINSA real: la API de quejas no tiene modo de prueba y cada envío crea un reclamo real.
 * EXCEPCIÓN TEMPORAL (ver nota en Obsidian, revertir cuando el backend soporte reclamos anónimos): el reclamo
 * sin DNI (payload.dni === null) se mockea siempre, sin importar el flag, para no crear reclamos reales anónimos
 * durante la demo.
 */
export async function submitQueja(payload: SubmitQuejaPayload): Promise<SubmitQuejaResult> {
  if (payload.dni === null) {
    return { status: "accepted" };
  }

  if (isRealMinsaEnabled()) {
    const response = await timedFetch("quejas", "submit", `${process.env.QUEJAS_API_BASE_URL}/api/v1/quejas/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        dni: payload.dni,
        nombre_completo: payload.nombreCompleto,
        celular: payload.celular,
        queja: payload.queja,
        ...(payload.mediaDataUri ? { imagen: payload.mediaDataUri } : {}),
      }),
    });

    if (response.ok) {
      return { status: "accepted" };
    }
    if ([408, 429].includes(response.status) || response.status >= 500) {
      return { status: "error" };
    }

    const bodyText = await response.text().catch(() => "");
    return { status: "rejected", reason: classifyRejection(bodyText) };
  }

  return { status: "accepted" };
}
