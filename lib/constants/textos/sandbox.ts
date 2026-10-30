export const SANDBOX_DISABLED_TEXT = "El Sandbox no está habilitado en este despliegue.";
export const SANDBOX_UNSIGNED_TEXT = "La petición no trae una firma válida.";
export const textoMuyLargoText = (maximo: number): string =>
  `No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo ${maximo}).`;
export const imagenMuyPesadaText = (maxMb: number): string =>
  `La imagen supera el tamaño máximo permitido (${maxMb} MB). Envía una imagen más liviana.`;
