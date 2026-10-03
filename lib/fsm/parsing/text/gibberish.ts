export const UNRECOGNIZED_DISTRITO_TEXT =
  "No reconocimos ese distrito. Por favor escribe el nombre de tu distrito o comuna:";

const MIN_USEFUL_LETTERS = 4;
const MIN_WORD_LENGTH = 4;
const MAX_CONSONANT_RUN = 4;
const MAX_SAME_LETTER_RUN = 3;
const MIN_VOWEL_SHARE = 0.2;
const KEYBOARD_RUN = 4;

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEYBOARD_SEGMENTS = new Set(
  KEYBOARD_ROWS.flatMap((row) => {
    const both = [row, [...row].reverse().join("")];
    return both.flatMap((line) =>
      Array.from({ length: line.length - KEYBOARD_RUN + 1 }, (_, index) => line.slice(index, index + KEYBOARD_RUN)),
    );
  }),
);

const VOWELS = /[aeiouy]/;

function stripAccents(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function hasKeyboardRun(word: string): boolean {
  for (let index = 0; index + KEYBOARD_RUN <= word.length; index++) {
    if (KEYBOARD_SEGMENTS.has(word.slice(index, index + KEYBOARD_RUN))) return true;
  }
  return false;
}

function longestConsonantRun(word: string): number {
  let run = 0;
  let best = 0;
  for (const letter of word) {
    run = VOWELS.test(letter) ? 0 : run + 1;
    best = Math.max(best, run);
  }
  return best;
}

function longestSameLetterRun(word: string): number {
  let run = 1;
  let best = 1;
  for (let index = 1; index < word.length; index++) {
    run = word[index] === word[index - 1] ? run + 1 : 1;
    best = Math.max(best, run);
  }
  return best;
}

function isImplausibleWord(word: string): boolean {
  const vowelShare = [...word].filter((letter) => VOWELS.test(letter)).length / word.length;
  return (
    hasKeyboardRun(word) ||
    longestConsonantRun(word) > MAX_CONSONANT_RUN ||
    longestSameLetterRun(word) > MAX_SAME_LETTER_RUN ||
    vowelShare < MIN_VOWEL_SHARE
  );
}

export function isGibberishPlaceText(text: string): boolean {
  const words = stripAccents(text)
    .split(/[^a-z]+/)
    .filter(Boolean);

  if (words.join("").length < MIN_USEFUL_LETTERS) return true;

  const longWords = words.filter((word) => word.length >= MIN_WORD_LENGTH);
  return longWords.length > 0 && longWords.every(isImplausibleWord);
}
