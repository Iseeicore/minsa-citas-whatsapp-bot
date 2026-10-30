import type { ReferenciaItem } from "@/lib/integrations/minsa/types";

export function buildReferencia(overrides: Partial<ReferenciaItem> = {}): ReferenciaItem {
  return {
    idReferencia: "synthetic-ref",
    numero: "00123",
    fechaInicio: "24/07/2026 10:00",
    ipressOrigen: "CENTRO SINTÉTICO",
    ipressDestino: "HOSPITAL SINTÉTICO",
    upsOrigen: "MEDICINA GENERAL",
    upsDestino: "CARDIOLOGÍA",
    codigoIpressDestino: "5987",
    codigoUpsDestino: "222800",
    estado: 5,
    ...overrides,
  };
}
