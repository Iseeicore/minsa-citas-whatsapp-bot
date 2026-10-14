export const COMBINING_ACCENT_MARKS = /[̀-ͯ]/g;
export const ALL_WHITESPACE_RUNS = /\s+/g;
export const WHITESPACE_RUN = /\s+/;
export const POSITIVE_INTEGER = /^[1-9]\d*$/;
export const CLOCK_TIME = /^\d{2}:\d{2}$/;
export const SYMBOLS_IN_UPPERCASE_TEXT = /[^A-Z0-9 ]/g;
export const WORD_SEPARATORS = /[^a-z0-9]+/g;
export const STRETCHED_CHARACTER = /(.)\1{2,}/g;
export const NON_LETTER_RUN = /[^a-z]+/;

export const WORD_INITIAL = /(^|[\s(-])(\p{L})/gu;
export const CAPITALIZED_CONNECTOR = /(?<=\s)(De|Del|La|Las|Los|Y)(?=\s|$)/g;

export const VOWELS = /[aeiouy]/;

export const SENTENCE_PUNCTUATION = /[.,;:!?¿¡]/g;
