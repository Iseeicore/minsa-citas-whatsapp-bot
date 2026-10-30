import type { CupoDiarioStatus } from "@/lib/enums/cupo-diario-status";
import type { ResultadoIntentoConsulta } from "@/lib/enums/resultado-intento-consulta";
import type { SessionChannel } from "@/lib/enums/session-channel";

export type IntentoConsulta = {
  identificador: string;
  canal: SessionChannel;
  resultado: ResultadoIntentoConsulta;
};

export type CupoDiarioStore = {
  save(intento: IntentoConsulta): Promise<void>;
  countDelDia(identificador: string): Promise<number>;
};

export type SaveIntentoConsultaResult = { statusCupo: CupoDiarioStatus.SAVED } | { statusCupo: CupoDiarioStatus.FAILED };

export type CountIntentosDelDiaResult = { statusCupo: CupoDiarioStatus.COUNTED; total: number } | { statusCupo: CupoDiarioStatus.FAILED };
