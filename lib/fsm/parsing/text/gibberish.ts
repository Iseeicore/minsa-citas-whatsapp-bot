import { NON_LETTER_RUN, VOWELS } from "@/lib/constants/regex/text";
import { stripAccents } from "@/lib/utils/text-values";
import {
  GIBBERISH_KEYBOARD_RUN,
  GIBBERISH_MAX_CONSONANT_RUN,
  GIBBERISH_MAX_SAME_LETTER_RUN,
  GIBBERISH_MIN_USEFUL_LETTERS,
  GIBBERISH_MIN_VOWEL_SHARE,
  GIBBERISH_MIN_WORD_LENGTH,
} from "@/lib/constants/limits/text";

const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
const KEYBOARD_SEGMENTS = new Set(
  KEYBOARD_ROWS.flatMap((row) => {
    const both = [row, [...row].reverse().join("")];
    return both.flatMap((line) =>
      Array.from({ length: line.length - GIBBERISH_KEYBOARD_RUN + 1 }, (_, index) => line.slice(index, index + GIBBERISH_KEYBOARD_RUN)),
    );
  }),
);

function hasKeyboardRun(word: string): boolean {
  for (let index = 0; index + GIBBERISH_KEYBOARD_RUN <= word.length; index++) {
    if (KEYBOARD_SEGMENTS.has(word.slice(index, index + GIBBERISH_KEYBOARD_RUN))) return true;
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
    longestConsonantRun(word) > GIBBERISH_MAX_CONSONANT_RUN ||
    longestSameLetterRun(word) > GIBBERISH_MAX_SAME_LETTER_RUN ||
    vowelShare < GIBBERISH_MIN_VOWEL_SHARE
  );
}

export function isGibberishPlaceText(text: string): boolean {
  const words = stripAccents(text.toLowerCase()).split(NON_LETTER_RUN).filter(Boolean);

  if (words.join("").length < GIBBERISH_MIN_USEFUL_LETTERS) return true;

  const longWords = words.filter((word) => word.length >= GIBBERISH_MIN_WORD_LENGTH);
  return longWords.length > 0 && longWords.every(isImplausibleWord);
}
