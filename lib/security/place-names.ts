import { COMBINING_ACCENT_MARKS, NON_LETTER_RUN } from "@/lib/fsm/parsing/text/text-patterns";
import distritos from "@/data/peru-distritos.json";

type PlaceRow = { departamento: string; provincia: string; distrito: string };

export const PLACE_NAME_WORDS: ReadonlySet<string> = new Set(
  (distritos as PlaceRow[])
    .flatMap((row) => [row.departamento, row.provincia, row.distrito])
    .flatMap((name) =>
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(COMBINING_ACCENT_MARKS, "")
        .split(NON_LETTER_RUN),
    )
    .filter((word) => word.length >= 5),
);
