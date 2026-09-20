import { timedFetch } from "../observability/http";

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

export async function submitQueja(payload: SubmitQuejaPayload): Promise<SubmitQuejaResult> {
  // The quejas API has no documented fake mode of its own, so this reuses
  // the MINSA real/fake toggle — otherwise every sandbox run would create a
  // real complaint record against the production ministry backend.
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
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
