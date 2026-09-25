import distritos from "@/data/peru-distritos.json";

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
