import { NON_LETTER_RUN } from "@/lib/constants/regex/text";
import distritos from "@/data/peru-distritos.json";
import { stripAccents } from "@/lib/utils/text-values";

type PlaceRow = { departamento: string; provincia: string; distrito: string };

export const PLACE_NAME_WORDS: ReadonlySet<string> = new Set(
  (distritos as PlaceRow[])
    .flatMap((row) => [row.departamento, row.provincia, row.distrito])
    .flatMap((name) =>
      stripAccents(name.toLowerCase())
        .split(NON_LETTER_RUN),
    )
    .filter((word) => word.length >= 5),
);
