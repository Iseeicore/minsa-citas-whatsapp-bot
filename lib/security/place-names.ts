import distritos from "@/data/peru-distritos.json";

// Every word of every official department / province / district name (INEI).
// A citizen typing their own place — "Tarata", "Taraco" — must never be read
// as an insult by the fuzzy matcher, so these words are exempt from it. Insult
// targets are never place names, so nothing real is lost. Only words of 5+
// letters matter: shorter ones are never fuzzy-matched anyway.
type PlaceRow = { departamento: string; provincia: string; distrito: string };

export const PLACE_NAME_WORDS: ReadonlySet<string> = new Set(
  (distritos as PlaceRow[])
    .flatMap((row) => [row.departamento, row.provincia, row.distrito])
    .flatMap((name) =>
      name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .split(/[^a-z]+/),
    )
    .filter((word) => word.length >= 5),
);
