import { noPudimosLeerText } from "@/lib/constants/textos/comunes";
import { IncidenciaButtonId } from "@/lib/enums/incidencia-button-id";
import { MAX_DESCRIPCION_LENGTH } from "@/lib/constants/limits/incidencia";

export const ASK_UBICACION_TEXT = "¿En qué establecimiento de salud ocurrió? Escribe su nombre o su código IPRESS.";
export const ASK_OTRA_UBICACION_TEXT = "Escribe el nombre del establecimiento o su código IPRESS.";
export const CODIGO_NO_ENCONTRADO_TEXT = `No encontré ese código. ${ASK_OTRA_UBICACION_TEXT}`;
export const UBICACION_ILEGIBLE_TEXT = noPudimosLeerText(ASK_OTRA_UBICACION_TEXT);
export const UBICACION_RECHAZADA_TEXT = `Entendido. ${ASK_OTRA_UBICACION_TEXT}`;

export const UBICACION_BUTTONS = [
  { id: IncidenciaButtonId.UBICACION_SI, title: "Sí, es ese" },
  { id: IncidenciaButtonId.UBICACION_NO, title: "No, es otro" },
];

export const OMITIR_BUTTONS = [
  { id: IncidenciaButtonId.OMITIR_SI, title: "Sí, continuar" },
  { id: IncidenciaButtonId.OMITIR_NO, title: "No, indicarlo" },
];

export const INCIDENCIA_LEAD_IN_TEXT = "Vamos a registrar tu denuncia.";
export const UBICACION_NO_UBICADA_TEXT = "Disculpa, no logramos ubicar el establecimiento.";
export const ubicacionDistritoLineText = (distrito: string): string => `\nDistrito: ${distrito}`;

export const confirmUbicacionText = (nombre: string, codigoRenipress: string, distritoLine: string): string =>
  `¿Estás seguro de esa ubicación?\n\n*${nombre}*\nCódigo IPRESS: ${codigoRenipress}${distritoLine}`;

export const UBICACION_NO_DISPONIBLE_TEXT = "No pudimos buscar el establecimiento en este momento.";
export const UBICACION_VARIOS_TEXT = "Hay varios establecimientos que se parecen. Escribe su nombre completo o su código IPRESS.";
export const UBICACION_NO_ENCONTRADA_TEXT = "No encontré ese establecimiento. Escribe su nombre completo o su código IPRESS.";
export const ubicacionAceptadaText = (nombre: string): string => `Perfecto, registraremos tu denuncia en *${nombre}*.`;
export const UBICACION_CONFIRM_RETRY_TEXT = "¿Es ese el establecimiento donde ocurrió? Toca Sí o No.";
export const OMITIR_QUESTION_TEXT = "¿Quieres continuar sin indicar el establecimiento?";
export const OMITIR_RETRY_TEXT = `${OMITIR_QUESTION_TEXT} Toca Sí o No.`;
export const OMITIR_ACEPTADO_TEXT = "Entendido, seguiremos sin indicar el establecimiento.";
export const IDENTITY_QUESTION_TEXT = "¿Deseas registrar tu nombre, o prefieres que sea anónimo?";

export const INCIDENCIA_NOMBRE_BUTTONS = [
  { id: IncidenciaButtonId.CON_NOMBRE, title: "Sí, doy mi nombre" },
  { id: IncidenciaButtonId.ANONIMO, title: "Prefiero ser anónimo" },
];

export const ONLY_DNI_TEXT = "Por ahora este canal solo valida el DNI. Escribe tu DNI o continúa de forma anónima.";
export const ONLY_DNI_BUTTONS = [{ id: IncidenciaButtonId.ANONIMO, title: "Continuar anónimo" }];
export const AVISO_PRIVACIDAD_TEXT =
  "Antes de continuar, necesitamos tu autorización para tratar la información que envíes por este canal. El texto, las imágenes y los datos personales que proporciones podrán ser revisados por el personal autorizado del establecimiento o del MINSA, únicamente para evaluar, derivar, investigar y dar seguimiento a tu denuncia.";
export const CONSENT_QUESTION_TEXT = "¿Autorizas el tratamiento de tus datos?";

export const CONSENT_BUTTONS = [
  { id: IncidenciaButtonId.CONSENT_SI, title: "Sí, autorizo" },
  { id: IncidenciaButtonId.CONSENT_NO, title: "No autorizo" },
];

export const ASK_DESCRIPCION_TEXT = `Cuéntanos tu denuncia (hasta ${MAX_DESCRIPCION_LENGTH} caracteres).`;
export const descripcionTooLongText = (maximo: number): string => `Escribe tu denuncia en hasta ${maximo} caracteres.`;

export const descripcionTooShortText = (minimo: number): string =>
  `Cuéntanos un poco más: escribe al menos ${minimo} caracteres para poder entender lo que pasó.`;

export const UNREADABLE_TEXT_RETRY = "No pudimos leer eso — ¿podrías escribirlo de nuevo?";

export const BORRADOR_BUTTONS = [
  { id: IncidenciaButtonId.BORRADOR_USAR, title: "Usar así" },
  { id: IncidenciaButtonId.BORRADOR_AGREGAR, title: "Agregar más" },
];

export const borradorConfirmText = (borrador: string): string =>
  `Esto es lo que escribiste:\n\n«${borrador}»\n\n¿Lo usamos tal cual o quieres agregar más?`;

export const borradorTooLongText = (maximo: number): string =>
  `Con lo que ya escribiste, el texto no puede pasar de ${maximo} caracteres. Escribe algo más corto.`;

export const ASK_BORRADOR_EXTRA_TEXT = "Escribe lo que quieras agregar.";
export const BORRADOR_QUESTION_TEXT = "¿Usamos tu texto tal cual o quieres agregar más?";
export const FOTO_REQUEST_TEXT =
  "¿Quieres enviar una imagen o un archivo como evidencia? Es opcional: envíalo ahora, o toca Omitir (o escribe OMITIR) para continuar sin él.";
export const FOTO_BUTTONS = [{ id: IncidenciaButtonId.FOTO_OMITIR, title: "Omitir" }];
export const FOTO_LISTO_BUTTONS = [{ id: IncidenciaButtonId.FOTO_LISTO, title: "Listo, continuar" }];
export const OMITIR_KEYWORD = "OMITIR";
export const LISTO_KEYWORD = "LISTO";
export const RESUMEN_LISTO_TEXT = "La información está lista para ser registrada.";
export const resumenEstablecimientoText = (establecimiento: string): string => `Establecimiento: ${establecimiento}`;
export const resumenRelatoText = (descripcion: string): string => `Relato: «${descripcion}»`;
export const resumenNombreText = (nombre: string): string => `A nombre de: ${nombre}`;
export const resumenDniText = (dniEnmascarado: string): string => `Con tu DNI ${dniEnmascarado}`;
export const RESUMEN_ANONIMO_TEXT = "De forma anónima";
export const RESUMEN_DECLARACION_TEXT =
  "Al continuar, confirmas que la información es verdadera según tu conocimiento y que podrá ser revisada por el personal autorizado para gestionar tu denuncia.";

export const CONFIRM_REGISTRO_BUTTONS = [
  { id: IncidenciaButtonId.CONFIRM_REGISTRO_SI, title: "Registrar" },
  { id: IncidenciaButtonId.CONFIRM_REGISTRO_NO, title: "Cancelar" },
];

export const ENVIANDO_INCIDENCIA_TEXT = "Enviando tu denuncia…";
export const INCIDENCIA_REGISTRADA_SIN_CODIGO_TEXT = "Gracias por tu denuncia, ya se registró.";

export const incidenciaRegistradaText = (codigo: string): string =>
  `¡Gracias! Tu denuncia quedó registrada con el código ${codigo}. Guárdalo para darle seguimiento.`;

export const SEGUIMIENTO_IDENTIFICADO_TEXT = "Si el área responsable necesita información adicional, se comunicará contigo.";
export const SEGUIMIENTO_ANONIMO_TEXT = "Guarda tu código: lo necesitarás para cualquier consulta posterior sobre esta denuncia.";
export const DAILY_LIMIT_TEXT =
  "Hoy ya registraste el máximo de denuncias permitido. Podrás registrar otra mañana. Gracias por tu comprensión.";
export const IMAGEN_MUY_PESADA_TEXT = "No se pudo registrar tu denuncia porque una de las imágenes pesa más de 5 MB.";
export const imagenRecibidaText = (cantidad: number, maximo: number): string =>
  `Recibimos tu imagen (${cantidad} de ${maximo}). Si tienes otra como referencia, envíala; si no, toca Listo (o escribe LISTO) para continuar.`;
export const imagenesCompletasText = (maximo: number): string => `Recibimos tu imagen ${maximo} de ${maximo}: es el máximo por denuncia.`;
export const imagenNoGuardadaMuyPesadaText = (maximoMb: number): string => `Esa imagen pesa más de ${maximoMb} MB y no se guardó.`;
export const IMAGEN_NO_DESCARGADA_TEXT = "No pudimos descargar esa imagen desde WhatsApp, por eso no se guardó.";
export const IMAGEN_NO_VALIDA_TEXT = "Ese archivo no es una imagen válida (JPG o PNG), por eso no se guardó.";
export const IMAGEN_REPETIDA_TEXT = "Esa imagen ya la habías enviado, no se guardó otra vez.";
export const DOCUMENTO_NO_GUARDADO_TEXT = "Por ahora solo podemos guardar imágenes (JPG o PNG); ese documento no se guardó.";
export const SEGUIR_CON_IMAGENES_TEXT = "Puedes enviar otra imagen o tocar Listo (o escribir LISTO) para continuar.";
export const SEGUIR_SIN_IMAGENES_TEXT = "Puedes enviar otra imagen o tocar Omitir (o escribir OMITIR) para continuar sin ella.";
export const resumenImagenesText = (cantidad: number): string => `Imágenes adjuntas: ${cantidad}`;
export const REGISTRO_FALLIDO_TEXT = "No pudimos registrar tu denuncia en este momento. Por favor, intenta de nuevo más tarde.";
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
