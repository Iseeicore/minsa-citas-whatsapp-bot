const MAX_CONSULTA_LENGTH = 120;

const SYNONYMS: Array<[RegExp, string]> = [
  [/\bpostas?\b/g, "puesto de salud"],
  [/\bp\.?\s?s\.?(?=\s|$)/g, "puesto de salud"],
  [/\bc\.?\s?s\.?(?=\s|$)/g, "centro de salud"],
  [/\bcentros de salud\b/g, "centro de salud"],
];

function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function limpiar(text: string): string {
  return fold(text).toLowerCase().replace(/\s+/g, " ").trim().slice(0, MAX_CONSULTA_LENGTH);
}

/** Deja el texto de la persona en el vocabulario del padrón (sin tildes, en minúsculas y con «posta» o «c.s.» ya expandidos). */
export function normalizarConsulta(text: string): string {
  let query = limpiar(text);
  for (const [pattern, replacement] of SYNONYMS) query = query.replace(pattern, replacement);
  return query.replace(/\s+/g, " ").trim();
}

/**
 * Las dos formas con las que se busca: tal como la escribió la persona y con los sinónimos expandidos. El padrón mezcla
 * «C.S. SANTA MARIA» y «CENTRO DE SALUD COMAS», así que ninguna de las dos sola alcanza; se toma la que más se parezca.
 */
export function variantesConsulta(text: string): [string, string] {
  return [limpiar(text), normalizarConsulta(text)];
}
