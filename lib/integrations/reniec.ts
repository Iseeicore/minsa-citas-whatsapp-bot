import { timedFetch } from "@/lib/observability/http";
import { LookupStatus } from "@/lib/enums/lookup-status";

export type ReniecLookupResult =
  { status: LookupStatus.FOUND; nombreCompleto: string } | { status: LookupStatus.NOT_FOUND } | { status: LookupStatus.ERROR };

const FAKE_DNI = "12345678";
const FAKE_NOMBRE_COMPLETO = "JUAN CARLOS QUISPE PEREZ";

export async function reniecLookup(dni: string): Promise<ReniecLookupResult> {
  if (process.env.SANDBOX_USE_REAL_RENIEC === "true") {
    const response = await timedFetch("reniec", "validate", `${process.env.RENIEC_LOOKUP_BASE_URL}/api/reniec/validate/${dni}`);

    if (response.status === 404) {
      return { status: LookupStatus.NOT_FOUND };
    }
    if (!response.ok) {
      return { status: LookupStatus.ERROR };
    }

    const body = await response.json();
    if (body?.success !== true || !body?.data) {
      return { status: LookupStatus.NOT_FOUND };
    }

    const { nombres, apellidoPaterno, apellidoMaterno } = body.data;
    const nombreCompleto = [nombres, apellidoPaterno, apellidoMaterno].filter(Boolean).join(" ");

    return { status: LookupStatus.FOUND, nombreCompleto };
  }

  if (dni === FAKE_DNI) {
    return { status: LookupStatus.FOUND, nombreCompleto: FAKE_NOMBRE_COMPLETO };
  }
  return { status: LookupStatus.NOT_FOUND };
}
