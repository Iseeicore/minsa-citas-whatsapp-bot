export const OPTION_NUMBER = /^\d{1,2}$/;
export const DIGITS_ONLY = /^\d+$/;

export const ORDINAL_FILLER =
  /^(?:(?:quiero|quisiera|elijo|escojo|prefiero|selecciono|me quedo con|la|el|lo|opcion|numero|nro|num)\s+)+/;

const LEADING_YES = "(?:(?:si|ok|okey|dale|vale|claro|listo)\\s+)?";

export const TAKING_THAT = new RegExp(
  `^${LEADING_YES}(?:(?:quiero|tomo|acepto|confirmo|me quedo con)\\s+)?(?:esa|ese)(?:\\s+(?:misma|mismo))?(?:\\s+(?:hora|horario|cita))?$`,
);

export const SUITS_ME = new RegExp(`^${LEADING_YES}(?:(?:esa|ese)\\s+)?me\\s+(?:sirve|conviene)$`);
export const TAKING_IT = new RegExp(`^${LEADING_YES}(?:la|lo)\\s+(?:tomo|quiero|acepto|confirmo)$`);

export const EXIT_PATTERNS: readonly RegExp[] = [
  /^(ya )?(me )?(quiero|deseo|necesito) salir( de (aqui|esto|la cita|el chat|este chat))?$/,
  /^salir( de (aqui|esto|la cita|el chat|este chat))?$/,
  /\bya no quiero( (nada|seguir|continuar|la cita|mas|esto))?$/,
  /\bno quiero (nada|seguir|continuar|mas nada)\b/,
  /\bno (voy a|quiero) (seguir|continuar)\b/,
  /\bya no (sigo|continuo)\b/,
  /\bme aburri\b/,
  /\b(que aburrido|estoy aburrid[oa])\b/,
  /\bolvidalo\b/,
  /\bolvidate\b/,
  /\bdejalo( asi)?$/,
  /\bcancela(r)? (la|mi) cita\b/,
  /\bme (canse|harte|rindo)\b/,
];

const PLACE = "(distrito|ubicacion|zona|lugar)";

export const CHANGE_DISTRITO_PATTERNS: readonly RegExp[] = [
  new RegExp(String.raw`\b(otro|otra) ${PLACE}\b`),
  new RegExp(String.raw`\bcambiar(lo|la)? (de |el |la |mi )?${PLACE}\b`),
  new RegExp(String.raw`\bno quiero (esta|esa|este|ese) ${PLACE}\b`),
  new RegExp(String.raw`\bme equivoque de ${PLACE}\b`),
  new RegExp(String.raw`\b(ese|este|esa|esta) no es (mi|el|la) ${PLACE}\b`),
];

export const NEGATION_WORD = /\b(?:no|ni|nunca|tampoco)\b/;

export const BARE_SMALL_NUMBER = /^(?:[1-9]|10)$/;
