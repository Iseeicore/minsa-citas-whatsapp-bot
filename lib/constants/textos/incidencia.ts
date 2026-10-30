import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { EvidenceRejection } from "@/lib/enums/evidence-rejection";
import { MAX_DESCRIPCION_LENGTH } from "@/lib/constants/limits/incidencia";
import { CHANNELS } from "@/lib/constants/textos/canales-oficiales";
import { MENU_ROW_CONSULTAR_INCIDENCIA_TITLE } from "@/lib/constants/textos/menu";
import type { ConsentButtons } from "@/lib/fsm/core/types";

export type ImagenesRecibidas = {
  recibidas: number;
  guardadas: number;
  total: number;
  maximo: number;
  tamano: string;
  rechazos: ReadonlyArray<readonly [EvidenceRejection, number]>;
};

const HASTA_MAXIMO_TEXT = `(*hasta ${MAX_DESCRIPCION_LENGTH} caracteres*)`;

const MOTIVO_DE_RECHAZO_TEXT: Readonly<Record<EvidenceRejection, (cantidad: number, imagenes: ImagenesRecibidas) => string>> = {
  [EvidenceRejection.TOO_LARGE]: (cantidad, { tamano }) => `${cantidad === 1 ? "pesa" : "pesan"} más de ${tamano}`,
  [EvidenceRejection.NOT_DOWNLOADED]: (cantidad) => `no se ${cantidad === 1 ? "pudo" : "pudieron"} descargar de WhatsApp`,
  [EvidenceRejection.INVALID]: (cantidad) => (cantidad === 1 ? "no es una imagen JPG o PNG válida" : "no son imágenes JPG o PNG válidas"),
  [EvidenceRejection.DUPLICATE]: (cantidad) => `ya ${cantidad === 1 ? "la" : "las"} habías enviado`,
  [EvidenceRejection.OVER_LIMIT]: (cantidad, { maximo }) => `${cantidad === 1 ? "supera" : "superan"} el máximo de ${maximo}`,
};

const soloImagenesText = (maximo: string): string => `Solo aceptamos imágenes JPG o PNG de hasta ${maximo}`;

const toEnumeracionText = (partes: string[]): string =>
  partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");

function motivosText(imagenes: ImagenesRecibidas): string {
  const { rechazos } = imagenes;
  if (rechazos.length === 1) return MOTIVO_DE_RECHAZO_TEXT[rechazos[0][0]](rechazos[0][1], imagenes);
  return toEnumeracionText(rechazos.map(([motivo, cantidad]) => `${cantidad} ${MOTIVO_DE_RECHAZO_TEXT[motivo](cantidad, imagenes)}`));
}

function detalleImagenesText(imagenes: ImagenesRecibidas): string {
  const { recibidas, guardadas } = imagenes;
  const rechazadas = recibidas - guardadas;
  if (rechazadas === 0) return recibidas === 1 ? "se guardó" : `las ${recibidas} se guardaron`;
  if (guardadas === 0) return `${recibidas === 1 ? "no" : "ninguna"} se guardó, porque ${motivosText(imagenes)}`;
  return `${guardadas} se ${guardadas === 1 ? "guardó" : "guardaron"} y ${rechazadas} no, porque ${motivosText(imagenes)}`;
}

export const AVISO_EMERGENCIA_DENUNCIA_TEXT = `⚠️ ESTE CANAL NO ATIENDE EMERGENCIAS MÉDICAS

Si usted o su familiar presentan una emergencia con riesgo vital, llame de inmediato (llamadas gratuitas):

- *SAMU: ${CHANNELS.samu}* (ambulancias y emergencias médicas)
- *Bomberos: ${CHANNELS.bomberos}* (rescate y urgencias)`;

export const ASK_UBICACION_DENUNCIA_TEXT =
  "Vamos, cuéntame, ¿en qué establecimiento de salud ocurrió? *Escribe su nombre o su código IPRESS*.";

export const avisoDenunciaText = (lead: string): string => [lead, AVISO_EMERGENCIA_DENUNCIA_TEXT].filter(Boolean).join("\n\n");
export const askUbicacionDenunciaText = (lead: string): string => `${avisoDenunciaText(lead)}\n\n${ASK_UBICACION_DENUNCIA_TEXT}`;

export const ASK_OTRA_UBICACION_TEXT = "Escribe el nombre del establecimiento o su código IPRESS.";
export const CODIGO_NO_ENCONTRADO_TEXT = `No encontré ese código. ${ASK_OTRA_UBICACION_TEXT}`;
export const UBICACION_RECHAZADA_TEXT = `Entendido. ${ASK_OTRA_UBICACION_TEXT}`;

export const UBICACION_BUTTONS = [
  { id: IncidenciaButtonId.UBICACION_SI, title: "Sí, es ese" },
  { id: IncidenciaButtonId.UBICACION_NO, title: "No, es otro" },
];

export const OMITIR_BUTTONS = [
  { id: IncidenciaButtonId.OMITIR_SI, title: "Sí, continuar" },
  { id: IncidenciaButtonId.OMITIR_NO, title: "No, indicarlo" },
];

export const UBICACION_NO_UBICADA_TEXT = "Disculpa, no logramos ubicar el establecimiento.";
export const ubicacionDistritoLineText = (distrito: string): string => `\nDistrito: ${distrito}`;

export const confirmUbicacionText = (nombre: string, codigoRenipress: string, distritoLine: string): string =>
  `¿Estás seguro de esa ubicación?\n\n*${nombre}*\nCódigo IPRESS: ${codigoRenipress}${distritoLine}`;

export const UBICACION_NO_DISPONIBLE_TEXT = "No pudimos buscar el establecimiento en este momento.";
export const UBICACION_VARIOS_TEXT = "Hay varios establecimientos que se parecen. Escribe su nombre completo o su código IPRESS.";
export const UBICACION_NO_ENCONTRADA_TEXT = "No encontré ese establecimiento. Escribe su nombre completo o su código IPRESS.";
export const IDENTITY_QUESTION_TEXT = "¿Deseas registrar tu denuncia con tu número de documento o prefieres que sea anónima?";
export const OMITIR_ACEPTADO_TEXT = `Entendido, seguiremos sin indicar el establecimiento. ${IDENTITY_QUESTION_TEXT}`;

export const ubicacionAceptadaText = (nombre: string): string =>
  `Perfecto, registraremos tu denuncia en *${nombre}*. ¿Deseas registrarla con tu número de documento o prefieres que sea anónima?`;
export const UBICACION_CONFIRM_RETRY_TEXT = "¿Es ese el establecimiento donde ocurrió? Toca Sí o No.";
export const OMITIR_QUESTION_TEXT = "¿Quieres continuar sin indicar el establecimiento?";
export const OMITIR_RETRY_TEXT = `${OMITIR_QUESTION_TEXT} Toca Sí o No.`;

export const INCIDENCIA_IDENTIDAD_BUTTONS = [
  { id: IncidenciaButtonId.CON_DOCUMENTO, title: "Con mi documento" },
  { id: IncidenciaButtonId.ANONIMO, title: "Prefiero ser anónimo" },
];

export const CONTINUAR_ANONIMO_BUTTONS = [{ id: IncidenciaButtonId.ANONIMO, title: "Continuar anónimo" }];
export const AVISO_PRIVACIDAD_TEXT =
  "Antes de continuar, necesitamos tu autorización para tratar la información que envíes por este canal. El texto, las imágenes y los datos personales que proporciones podrán ser revisados por el personal autorizado del establecimiento o del MINSA, únicamente para evaluar, derivar, investigar y dar seguimiento a tu denuncia.";
export const CONSENT_QUESTION_TEXT = "¿Autorizas el tratamiento de tus datos?";
export const CONSENT_TITULO_TEXT = "Autorización de datos";
export const CONSENT_PROMPT_TEXT = "Para registrar tu denuncia necesitamos tu autorización.";
export const CONSENT_ACCEPT_LABEL = "Acepto, autorizo mis datos";
export const CONSENT_REOPEN_LABEL = "Revisar autorización";
export const consentimientoBubbleText = (lead: string): string => [lead, CONSENT_PROMPT_TEXT].filter(Boolean).join(" ");

export const consentimientoWhatsappText = (lead: string): string =>
  `${[lead, AVISO_PRIVACIDAD_TEXT].filter(Boolean).join(" ")}\n\n${CONSENT_QUESTION_TEXT}`;

export const CONSENT_BUTTONS: ConsentButtons = [
  { id: IncidenciaButtonId.CONSENT_SI, title: "Sí, autorizo" },
  { id: IncidenciaButtonId.CONSENT_NO, title: "No autorizo" },
];

export const ASK_DESCRIPCION_ANONIMO_TEXT = `Entendemos tu preferencia por el anonimato. Cuéntame tu denuncia ${HASTA_MAXIMO_TEXT}.`;
export const askDescripcionConDocumentoText = (documentoEnmascarado: string): string =>
  `Cuéntame tu denuncia, documento ${documentoEnmascarado} ${HASTA_MAXIMO_TEXT}.`;

export const descripcionTooLongText = (actual: number, maximo: number): string =>
  `Tu mensaje tiene ${actual} caracteres; el máximo es ${maximo}. Resúmelo y envíalo de nuevo.`;

export const descripcionTooShortText = (minimo: number): string =>
  `Cuéntanos un poco más: escribe al menos ${minimo} caracteres para poder entender lo que pasó.`;

export const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export const BORRADOR_BUTTONS = [
  { id: IncidenciaButtonId.BORRADOR_USAR, title: "Usar así" },
  { id: IncidenciaButtonId.BORRADOR_AGREGAR, title: "Agregar más" },
];

export const borradorConfirmText = (borrador: string): string =>
  `Esto es lo que escribiste:\n\n«${borrador}»\n\n¿Lo usamos tal cual o quieres agregar más?`;

export const borradorTooLongText = (actual: number, maximo: number): string =>
  `Con lo que agregaste, tu denuncia tendría ${actual} caracteres; el máximo es ${maximo}. Resúmelo y envíalo de nuevo.`;

export const ASK_BORRADOR_EXTRA_TEXT = "Escribe lo que quieras agregar.";
export const BORRADOR_QUESTION_TEXT = "¿Usamos tu texto tal cual o quieres agregar más?";
export const fotoRequestText = (tamano: string, cantidad: number): string =>
  [
    "¿Quieres enviar *imágenes* como evidencia? Es *opcional*.",
    `• *JPG o PNG*, hasta *${tamano}* cada una, máximo *${cantidad}*.`,
    "• Selecciónalas y envíalas *juntas*: revisaremos cada una y te diremos cuáles se guardaron y cuáles no.",
    "Si no tienes, toca *Omitir*.",
  ].join("\n");
export const FOTO_BUTTONS = [{ id: IncidenciaButtonId.FOTO_OMITIR, title: "Omitir" }];
export const FOTO_LISTO_BUTTONS = [{ id: IncidenciaButtonId.FOTO_LISTO, title: "Listo" }];
export const OMITIR_KEYWORD = "OMITIR";
export const LISTO_KEYWORD = "LISTO";
export const RESUMEN_LISTO_TEXT = "La información está lista para ser registrada.";
export const resumenEstablecimientoText = (establecimiento: string): string => `Establecimiento: ${establecimiento}`;
export const resumenRelatoText = (descripcion: string): string => `Relato: «${descripcion}»`;
export const resumenDocumentoText = (ultimosDigitos: string): string => `Identificado con documento terminado en ${ultimosDigitos}`;
export const RESUMEN_ANONIMO_TEXT = "De forma anónima";
export const RESUMEN_DECLARACION_TEXT =
  "Al continuar, confirmas que la información es verdadera según tu conocimiento y que podrá ser revisada por el personal autorizado para gestionar tu denuncia.";

export const CONFIRM_REGISTRO_BUTTONS = [
  { id: IncidenciaButtonId.CONFIRM_REGISTRO_SI, title: "Registrar" },
  { id: IncidenciaButtonId.CONFIRM_REGISTRO_NO, title: "Cancelar" },
];

export const DESPEDIDA_DENUNCIA_TEXT = "¡Hasta pronto!";
export const SEGUIMIENTO_IDENTIFICADO_TEXT = "Si el área responsable necesita información adicional, se comunicará contigo.";

export const incidenciaRegistradaText = (codigo: string, establecimiento: string | undefined, identificado: boolean): string =>
  [
    `¡Gracias! Tu denuncia quedó registrada con el código *${codigo}*${establecimiento ? ` en *${establecimiento}*` : ""}.`,
    `Guárdalo: para ver su estado, elige *${MENU_ROW_CONSULTAR_INCIDENCIA_TITLE}* en el menú o escribe tu código.`,
    identificado ? SEGUIMIENTO_IDENTIFICADO_TEXT : undefined,
    DESPEDIDA_DENUNCIA_TEXT,
  ]
    .filter(Boolean)
    .join(" ");

export const DAILY_LIMIT_TEXT =
  "Hoy ya registraste el máximo de denuncias permitido. Podrás registrar otra mañana. Gracias por tu comprensión.";
export const imagenMuyPesadaText = (maximo: string): string =>
  `No pudimos registrar tu denuncia porque una de las imágenes pesa más de ${maximo}.`;

export const imagenesRecibidasText = (imagenes: ImagenesRecibidas): string =>
  `Recibimos ${imagenes.recibidas === 1 ? "tu imagen" : `${imagenes.recibidas} imágenes`} (${imagenes.total} de ${imagenes.maximo}): ${detalleImagenesText(imagenes)}.`;

export const documentoNoGuardadoText = (maximo: string): string => `${soloImagenesText(maximo)}; ese archivo no se guardó.`;
export const SEGUIR_CON_IMAGENES_TEXT = "Puedes enviar más o tocar *Listo* para continuar.";
export const SEGUIR_SIN_IMAGENES_TEXT = "Puedes enviar otra imagen o tocar *Omitir* para continuar sin ella.";
export const resumenImagenesText = (cantidad: number): string => `Imágenes adjuntas: ${cantidad}`;
export const REGISTRO_FALLIDO_TEXT =
  "Lo sentimos, no pudimos registrar tu denuncia en este momento. Por favor, inténtalo de nuevo más tarde.";
export const INCIDENCIA_REAUTH_PROMPT_TEXT =
  "⏳ Tu denuncia quedó inactiva por un tiempo. ¿Deseas continuar donde la dejaste?\n\n[1] Sí, continuar\n[2] Cancelar";

export const INCIDENCIA_REAUTH_BUTTONS = [
  { id: IncidenciaButtonId.REAUTH_SI, title: "Sí, continuar" },
  { id: IncidenciaButtonId.REAUTH_NO, title: "Cancelar" },
];

export const INCIDENCIA_RETOMADA_TEXT = "¡Listo! Continuemos donde quedaste.";
export const INCIDENCIA_CANCELADA_TEXT =
  "Entendido, no se registró ninguna denuncia. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";
export const NO_AUTORIZO_TEXT =
  "Entendido. No se registrará tu denuncia por este canal. Cuando quieras registrar una, escríbenos nuevamente. ¡Que tengas un buen día! 👋";
