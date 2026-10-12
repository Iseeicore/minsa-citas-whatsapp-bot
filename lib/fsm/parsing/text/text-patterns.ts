export const COMBINING_ACCENT_MARKS = /[̀-ͯ]/g;

export const ALL_WHITESPACE_RUNS = /\s+/g;

export const WHITESPACE_RUN = /\s+/;

export const CLOCK_TIME = /^\d{2}:\d{2}$/;

export const SYMBOLS_IN_UPPERCASE_TEXT = /[^A-Z0-9 ]/g;

export const WORD_SEPARATORS = /[^a-z0-9]+/g;

export const STRETCHED_CHARACTER = /(.)\1{2,}/g;

export const NON_LETTER_RUN = /[^a-z]+/;
