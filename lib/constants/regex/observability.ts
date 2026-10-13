export const SENSITIVE_KEY = /bearer|token|authorization|secret|password|api[_-]?key|twofa|otp|code$/i;
export const DNI_KEY = /dni|documento/i;
export const ALREADY_MASKED_DNI = /^\*{4}\d{0,4}$/;
export const NON_DIGIT = /\D/g;
export const URL_WITH_QUERY_STRING = /(https?:\/\/[^\s?#]+)\?[^\s#]*/gi;
export const BEARER_CREDENTIAL = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi;
export const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g;
export const LONG_DIGIT_RUN = /\d{7,}/g;
export const NEVER_PREVIEW_STATE = /^(cita_awaiting_(dni|otp)|incidencia_)/;

export const DATE_SLASHES = /\//g;
