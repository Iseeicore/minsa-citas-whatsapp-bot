import { ListPageButtonId } from "@/lib/enums/list-page-button-id";
import { HoraPageButtonId } from "@/lib/enums/hora-page-button-id";
import { ReferenciaActionButtonId } from "@/lib/enums/referencia-action-button-id";
import { OtherDistritoButtonId } from "@/lib/enums/other-distrito-button-id";
import { TerminosButtonId } from "@/lib/enums/terminos-button-id";
import { CuentaMinsaButtonId } from "@/lib/enums/cuenta-minsa-button-id";

export const REFERENCE_PAGE_ANSWERS: ReadonlyMap<string, ListPageButtonId | HoraPageButtonId> = new Map<
  string,
  ListPageButtonId | HoraPageButtonId
>([
  ["ANTERIORES", ListPageButtonId.PREV],
  ["VER MAS OPCIONES", ListPageButtonId.NEXT],
  ["HORARIOS ANTERIORES", HoraPageButtonId.PREV],
  ["VER MAS HORARIOS", HoraPageButtonId.NEXT],
]);

export const CHANGE_REFERENCE_ANSWERS = new Set(["CAMBIAR REFERENCIA"]);

export const CONSULTA_REFERENCIAS_ACTION_ANSWERS: ReadonlyMap<string, ReferenciaActionButtonId> = new Map<string, ReferenciaActionButtonId>(
  [
    ["CITA SIN REFERENCIA", ReferenciaActionButtonId.NEW_APPOINTMENT],
    ["SALIR", ReferenciaActionButtonId.EXIT],
  ],
);

export const TERMINOS_ANSWERS: ReadonlyMap<string, TerminosButtonId> = new Map<string, TerminosButtonId>([
  ["1", TerminosButtonId.ACCEPT],
  ["ACEPTO", TerminosButtonId.ACCEPT],
  ["SI ACEPTO", TerminosButtonId.ACCEPT],
  ["SI, ACEPTO", TerminosButtonId.ACCEPT],
  ["ACEPTO.", TerminosButtonId.ACCEPT],
  ["ACEPTAR", TerminosButtonId.ACCEPT],
  ["2", TerminosButtonId.DECLINE],
  ["NO ACEPTO", TerminosButtonId.DECLINE],
  ["NO ACEPTO.", TerminosButtonId.DECLINE],
  ["NO, NO ACEPTO", TerminosButtonId.DECLINE],
  ["NO ACEPTAR", TerminosButtonId.DECLINE],
]);

export const CUENTA_MINSA_ANSWERS: ReadonlyMap<string, CuentaMinsaButtonId> = new Map<string, CuentaMinsaButtonId>([
  ["YA CUENTO CON UNA", CuentaMinsaButtonId.TIENE],
  ["NO CUENTO CON UNA", CuentaMinsaButtonId.NO_TIENE],
  ["NO DESEO CONTINUAR", CuentaMinsaButtonId.NO_CONTINUAR],
]);

export const CITA_KEYWORD = "CITA";
export const CITAS_KEYWORD = "CITAS";
export const CONTINUAR_KEYWORD = "CONTINUAR";
export const MI_KEYWORD = "MI";

export const AFFIRMATIVE_REPLIES = new Set([
  "si",
  "sí",
  "s",
  "yes",
  "y",
  "ese",
  "esa",
  "eso",
  "correcto",
  "exacto",
  "confirmo",
  "afirmativo",
  "claro",
  "asi es",
  "así es",
]);

export const GREETING_WORDS = new Set([
  "HOLA",
  "HOLAS",
  "HOLI",
  "BUENAS",
  "BUENOS",
  "BUEN",
  "DIA",
  "DIAS",
  "TARDE",
  "TARDES",
  "NOCHE",
  "NOCHES",
  "SALUDOS",
  "HELLO",
  "HI",
]);

export const CITA_INTENT_WORDS = new Set(["CITA", "CITAS", "AGENDAR", "AGENDARME", "RESERVAR", "TURNO", "ATENDERME", "ATENCION"]);

export const NOT_A_NEW_CITA_WORDS = new Set([
  "CANCELAR",
  "ANULAR",
  "REPROGRAMAR",
  "CAMBIAR",
  "MODIFICAR",
  "INCIDENCIA",
  "INCIDENCIAS",
  "RECLAMO",
  "RECLAMOS",
  "QUEJA",
  "QUEJAS",
  "DENUNCIA",
  "DENUNCIAS",
]);

export const CONTINUE_WORDS = new Set([
  "CONTINUAR",
  "CONTINUEMOS",
  "CONTINUA",
  "CONTINUO",
  "SEGUIR",
  "SEGUIMOS",
  "SIGAMOS",
  "SIGUE",
  "SIGO",
  "VAMOS",
  "VAMO",
  "DALE",
  "ADELANTE",
  "AVANZA",
  "AVANCEMOS",
  "LISTO",
  "OK",
  "OKEY",
  "SI",
  "YA",
]);

export const STOP_WORDS = new Set(["NO", "NUNCA", "CANCELAR", "CANCELO"]);

export const INCIDENCIA_KEY_WORDS = new Set([
  "INCIDENCIA",
  "INCIDENCIAS",
  "RECLAMO",
  "RECLAMOS",
  "QUEJA",
  "QUEJAS",
  "DENUNCIA",
  "DENUNCIAS",
  "RECLAMACIONES",
  "ANTICORRUPCION",
  "CORRUPCION",
  "COIMA",
  "COIMAS",
  "SOBORNO",
  "SOBORNOS",
]);

export const INCIDENCIA_FILLER_WORDS = new Set([
  "QUIERO",
  "DESEO",
  "NECESITO",
  "HACER",
  "PONER",
  "REGISTRAR",
  "FORMULAR",
  "INTERPONER",
  "PRESENTAR",
  "UN",
  "UNA",
  "MI",
  "DE",
  "EL",
  "LIBRO",
  "PARA",
]);

export const REFERENCIA_KEY_WORDS = new Set(["REFERENCIA", "REFERENCIAS"]);

export const REFERENCIA_FILLER_WORDS = new Set([
  "CITA",
  "CON",
  "QUIERO",
  "DESEO",
  "NECESITO",
  "CONSULTAR",
  "CONSULTA",
  "REVISAR",
  "VER",
  "SABER",
  "MI",
  "MIS",
  "DE",
  "LA",
  "LAS",
  "EL",
  "ESTADO",
  "MEDICA",
  "MEDICAS",
]);

export const OTHER_ESPECIALIDAD_ANSWERS = new Set([
  "OTRA ESPECIALIDAD",
  "OTRA",
  "CAMBIAR",
  "CAMBIAR DE ESPECIALIDAD",
  "SI OTRA ESPECIALIDAD",
]);
export const DUPLICATE_EXIT_ANSWERS = new Set(["SALIR", "NO SALIR", "TERMINAR"]);
export const BOOKING_EXIT_ANSWERS = new Set(["TERMINAR", "SALIR", "NO SALIR", "FINALIZAR"]);
export const BOOKING_RETRY_ANSWERS = new Set(["REINTENTAR", "INTENTAR DE NUEVO", "VOLVER A INTENTAR", "INTENTAR OTRA VEZ", "OTRA VEZ"]);
export const CHANGE_DISTRICT_ANSWERS = new Set(["CAMBIAR", "CAMBIAR DE DISTRITO", "OTRO DISTRITO", "OTRO", "BUSCAR OTRO DISTRITO"]);
export const OTHER_SEDE_ANSWERS = new Set(["OTRA SEDE", "OTRA", "NO"]);

export const NO_ESTABLECIMIENTOS_ANSWERS: ReadonlyMap<string, OtherDistritoButtonId> = new Map<string, OtherDistritoButtonId>([
  ["1", OtherDistritoButtonId.YES],
  ["2", OtherDistritoButtonId.OTHER_ESPECIALIDAD],
  ["OTRA", OtherDistritoButtonId.OTHER_ESPECIALIDAD],
  ["OTRA ESPECIALIDAD", OtherDistritoButtonId.OTHER_ESPECIALIDAD],
  ["ELEGIR OTRA ESPECIALIDAD", OtherDistritoButtonId.OTHER_ESPECIALIDAD],
  ["3", OtherDistritoButtonId.BACK],
  ["ATRAS", OtherDistritoButtonId.BACK],
  ["VOLVER", OtherDistritoButtonId.BACK],
  ["REGRESAR", OtherDistritoButtonId.BACK],
  ["4", OtherDistritoButtonId.NO],
]);

export const CHANGE_DATE_ANSWERS = new Set([
  "CAMBIAR",
  "CAMBIAR FECHA",
  "CAMBIAR DE FECHA",
  "OTRA FECHA",
  "OTRA",
  "OTRO DIA",
  "OTRO",
  "VER OTRAS FECHAS",
  "BUSCAR OTRA FECHA",
]);

export const LEAVE_ANSWERS = new Set(["SALIR", "SI SALIR", "QUIERO SALIR"]);
export const STAY_ANSWERS = new Set(["CONTINUAR", "SEGUIR", "NO CONTINUAR", "QUIERO CONTINUAR", "QUIERO SEGUIR"]);

export const OMITIR_UBICACION_PHRASES = new Set([
  "omitir",
  "omito",
  "no se",
  "no lo se",
  "no se el nombre",
  "no recuerdo",
  "no me acuerdo",
  "no quiero",
  "no quiero decirlo",
  "prefiero no",
  "prefiero no decirlo",
  "ninguno",
  "ninguna",
  "ninguno de estos",
  "sin establecimiento",
  "no tengo",
]);

export const CERRAR_INCIDENCIA_PHRASES = new Set([
  "quiero cerrar",
  "cerrar",
  "cerrar sesion",
  "quiero cerrar la sesion",
  "terminar la sesion",
  "quiero terminar la sesion",
]);
