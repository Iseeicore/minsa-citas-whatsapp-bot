import type { SessionChannel } from "@/lib/enums/session-channel";

export type ConsultaIncidencia =
  | { codigo: string; establecimientoId: number; esAnonimo: true }
  | { codigo: string; establecimientoId: number; esAnonimo: false; dni: string };

export type QuienConsulta = { identificador: string; canal: SessionChannel };
