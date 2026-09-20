import { timedFetch } from "../observability/http";

export type ReniecLookupResult =
  | { status: "found"; nombreCompleto: string }
  | { status: "not_found" }
  | { status: "error" };

const FAKE_DNI = "12345678";
const FAKE_NOMBRE_COMPLETO = "JUAN CARLOS QUISPE PEREZ";

export async function reniecLookup(dni: string): Promise<ReniecLookupResult> {
  if (process.env.SANDBOX_USE_REAL_RENIEC === "true") {
    const response = await timedFetch("reniec", "validate", `${process.env.RENIEC_LOOKUP_BASE_URL}/api/reniec/validate/${dni}`);

    if (response.status === 404) {
      return { status: "not_found" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const body = await response.json();
    if (body?.success !== true || !body?.data) {
      return { status: "not_found" };
    }

    const { nombres, apellidoPaterno, apellidoMaterno } = body.data;
    const nombreCompleto = [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ");

    return { status: "found", nombreCompleto };
  }

  if (dni === FAKE_DNI) {
    return { status: "found", nombreCompleto: FAKE_NOMBRE_COMPLETO };
  }
  return { status: "not_found" };
}
