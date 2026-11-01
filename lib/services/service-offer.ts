import { isIncidenciasEnabled, isReferenciasEnabled } from "@/lib/config/features";
import { ServiceOffer } from "@/lib/enums/service-offer";

export function currentServiceOffer(): ServiceOffer {
  const referencias = isReferenciasEnabled();
  if (isIncidenciasEnabled()) return referencias ? ServiceOffer.COMPLETA : ServiceOffer.CITA_INCIDENCIA;
  return referencias ? ServiceOffer.CITA_REFERENCIA : ServiceOffer.CITA;
}
