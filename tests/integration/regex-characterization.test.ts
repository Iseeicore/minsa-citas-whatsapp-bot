import { describe, expect, it } from "vitest";
import { normalizarConsulta, variantesConsulta } from "@/lib/establecimientos/consulta";
import { formatEspecialidadName, formatEstablecimientoName } from "@/lib/fsm/flows/cita/data/catalog-names";
import { extractCitaHints, mentionsPlacePreposition } from "@/lib/fsm/flows/cita/parsing/cita-hints";
import { looksLikePlaceName } from "@/lib/fsm/flows/cita/parsing/distrito-resolver";
import { rowToSlot } from "@/lib/fsm/flows/cita/steps/hora/format";
import { detectOutOfScope } from "@/lib/fsm/flows/out-of-scope/out-of-scope";
import { matchFechaText, parseOfferedDate } from "@/lib/fsm/parsing/date/date-parser";
import { matchHoraText, unpackHoraSlots, type HoraSlot } from "@/lib/fsm/parsing/date/time-parser";
import { isSlotAcceptance, resolveConfirmation } from "@/lib/fsm/parsing/selection/confirmation-parser";
import { detectExitIntent, normalizeIntentPhrase } from "@/lib/fsm/parsing/selection/exit-intent";
import { hintText, matchSelection, type OfferedRow } from "@/lib/fsm/parsing/selection/selection-matchers";
import { isGibberishPlaceText } from "@/lib/fsm/parsing/text/gibberish";
import { isValidDniFormat, isValidDocumentoFormat, isValidOtpFormat } from "@/lib/fsm/parsing/text/identity-format";
import { parseCodigoSuelto, parseInicioIncidencia } from "@/lib/fsm/parsing/text/inicio-incidencia";
import { quiereOmitirUbicacion } from "@/lib/fsm/parsing/text/omitir-ubicacion";
import { namesMatch, normalizeText, toDisplayPlace } from "@/lib/fsm/parsing/text/text";
import { detectCitaRequest, isGreeting } from "@/lib/fsm/routing/menu-shortcuts";
import { decodeJwtExp } from "@/lib/fsm/session/session-expiry-guard";
import { dateFolder } from "@/lib/observability/file-sink";
import { previewInput, redactString } from "@/lib/observability/mask";
import { maskDocumento } from "@/lib/utils/mask-documento";
import { parseImageDataUri } from "@/lib/recepcion/imagenes/data-uri";
import { ParsedImageStatus } from "@/lib/enums/parsed-image-status";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";
import { PLACE_NAME_WORDS } from "@/lib/security/place-names";
import { initials } from "@/lib/utils/avatar";
import { splitParagraphs, tokenizeChatText } from "@/lib/utils/format-chat-text";
import { splitPagerRows } from "@/lib/utils/list-rows";
import { EstablecimientoPageRowId } from "@/lib/enums/establecimiento-page-row-id";

function twice<T>(run: () => T): T {
  const first = run();
  expect(run()).toEqual(first);
  return first;
}

const TODAY = { year: 2026, month: 10, day: 12 };
const FECHAS: OfferedRow[] = [
  { id: "20261012", title: "lun 12 oct" },
  { id: "13/10/2026", title: "mar 13 oct" },
  { id: "20261014", title: "mié 14 oct" },
  { id: "20261015", title: "jue 15 oct" },
  { id: "20261022", title: "jue 22 oct" },
  { id: "sin-fecha", title: "otra" },
];
const HORAS: HoraSlot[] = [
  { start: "00:00", end: "00:20", cupos: 1 },
  { start: "07:45", end: "08:05", cupos: 1 },
  { start: "08:00", end: "08:20", cupos: 2 },
  { start: "12:00", end: "12:20", cupos: 1 },
  { start: "15:30", end: "15:50", cupos: 1 },
  { start: "20:00", end: "20:20", cupos: 3 },
];
const OPCIONES: OfferedRow[] = [
  { id: "a", title: "Medicina General", description: "3 cupos" },
  { id: "b", title: "Pediatría", description: "1 cupo" },
  { id: "c", title: "Odontología" },
];

const fecha = (text: string) => twice(() => matchFechaText(text, FECHAS, TODAY));
const hora = (text: string) => twice(() => matchHoraText(text, HORAS));

describe("caracterización de los patrones: enmascarado de logs", () => {
  it("redactString oculta query strings, credenciales Bearer, JWT y series largas de dígitos", () => {
    expect(
      twice(() =>
        redactString(
          "GET HTTPS://api.minsa.gob.pe/v1/citas?dni=12345678&x=1#frag bearer abc.DEF-123/x= eyJhbGciOi.eyJzdWIi.sig_1 tel 987654321 y 123456 y http://a.pe/b?c",
        ),
      ),
    ).toMatchInlineSnapshot(
      `"GET HTTPS://api.minsa.gob.pe/v1/citas?[redacted]#frag Bearer [redacted] [jwt] tel ****4321 y 123456 y http://a.pe/b?[redacted]"`,
    );
  });

  it("maskDocumento deja solo los cuatro últimos dígitos y no vuelve a enmascarar lo ya enmascarado", () => {
    expect(
      twice(() => [
        maskDocumento("12.345.678"),
        maskDocumento("****5678"),
        maskDocumento("123"),
        maskDocumento("****"),
        maskDocumento("*****1"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        "****5678",
        "****5678",
        "****",
        "****",
        "****",
      ]
    `);
  });

  it("previewInput aplana los espacios y nunca muestra el texto de los estados sensibles", () => {
    expect(
      twice(() => [
        previewInput("main_menu", "  hola   mundo \n\t 987654321 "),
        previewInput("cita_awaiting_dni", "12345678"),
        previewInput("cita_awaiting_otp", "1234"),
        previewInput("incidencia_awaiting_detalle", "me trataron mal"),
        previewInput("xcita_awaiting_dni", "abc"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "inputLength": 28,
          "inputPreview": "hola mundo ****4321",
        },
        {
          "inputLength": 8,
        },
        {
          "inputLength": 4,
        },
        {
          "inputLength": 15,
        },
        {
          "inputLength": 3,
          "inputPreview": "abc",
        },
      ]
    `);
  });

  it("dateFolder arma la carpeta del día con guiones", () => {
    expect(twice(() => dateFolder(new Date("2026-10-12T15:00:00Z")))).toMatchInlineSnapshot(`"12-10-2026"`);
  });
});

describe("caracterización de los patrones: nombres y catálogos", () => {
  it("normalizarConsulta expande los sinónimos del padrón", () => {
    expect(
      twice(() => [
        normalizarConsulta("  Posta   San  Borja y C.S. Comás, centros de salud p.s. "),
        normalizarConsulta("postas p s lima cs. x c.s"),
        variantesConsulta("P.S.  Ñaña"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        "puesto de salud san borja y centro de salud comas, centro de salud puesto de salud",
        "puesto de salud puesto de salud lima centro de salud x centro de salud",
        [
          "p.s. nana",
          "puesto de salud nana",
        ],
      ]
    `);
  });

  it("formatEspecialidadName quita el prefijo y corta en el primer segmento", () => {
    expect(
      twice(() => [
        formatEspecialidadName("CONSULTA EXTERNA - MEDICINA INTERNA / CARDIOLOGIA -"),
        formatEspecialidadName("consulta   externa-PEDIATRIA-NEONATOLOGIA"),
        formatEspecialidadName(" - GINECOLOGIA II - "),
        formatEspecialidadName("CONSULTA EXTERNA -"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "full": "Medicina Interna / Cardiologia",
          "title": "Medicina Interna",
        },
        {
          "full": "Pediatria-Neonatologia",
          "title": "Pediatria",
        },
        {
          "full": "Ginecologia II",
          "title": "Ginecologia II",
        },
        {
          "full": "Consulta Externa -",
          "title": "Consulta Externa",
        },
      ]
    `);
  });

  it("formatEstablecimientoName conserva siglas, numerales romanos y abrevia el tipo", () => {
    expect(
      twice(() => [
        formatEstablecimientoName("CENTRO DE SALUD C.S.M. SAN JUAN II - HOSPITAL DE APOYO MR"),
        formatEstablecimientoName("puesto  de salud  villa maría iii  ddhh"),
        formatEstablecimientoName("CENTRO MATERNO INFANTIL JUAN PABLO II"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "full": "Centro de Salud C.S.M. San Juan II - Hospital de Apoyo MR",
          "title": "C.S. C.S.M. San Juan II",
        },
        {
          "full": "Puesto de Salud Villa María III Ddhh",
          "title": "P.S. Villa María III",
        },
        {
          "full": "Centro Materno Infantil Juan Pablo II",
          "title": "C.M.I. Juan Pablo II",
        },
      ]
    `);
  });

  it("toDisplayPlace, normalizeText y namesMatch", () => {
    expect(
      twice(() => [
        normalizeText("  áéí   ñandú\tx \n y "),
        toDisplayPlace("SAN JUAN DE LURIGANCHO (LIMA-ESTE) Y LA VICTORIA DEL SUR de"),
        namesMatch("  maría   pérez ", "PEREZ GOMEZ MARIA"),
        namesMatch("ana", "pedro"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        "AEI NANDU X Y",
        "San Juan de Lurigancho (Lima-Este) y la Victoria del Sur de",
        true,
        false,
      ]
    `);
  });

  it("initials y splitPagerRows", () => {
    expect(
      twice(() => [
        initials("  ana   maría  "),
        initials("solo"),
        splitPagerRows([
          { id: "x", title: "Posta" },
          { id: EstablecimientoPageRowId.NEXT, title: "Siguiente", description: "pagina 3 DE 7" },
        ]).pager?.label,
        splitPagerRows([{ id: EstablecimientoPageRowId.PREV, title: "Anterior", description: "Ir a la Página   1 de 4" }]).pager?.label,
      ]),
    ).toMatchInlineSnapshot(`
      [
        "AM",
        "SO",
        "Página 2 de 7",
        "Página 2 de 4",
      ]
    `);
  });

  it("PLACE_NAME_WORDS parte los nombres de lugar en palabras sin tildes", () => {
    expect([
      PLACE_NAME_WORDS.has("lurigancho"),
      PLACE_NAME_WORDS.has("miraflores"),
      PLACE_NAME_WORDS.has("lima"),
      PLACE_NAME_WORDS.has("san juan"),
    ]).toMatchInlineSnapshot(`
      [
        true,
        true,
        false,
        false,
      ]
    `);
  });
});

describe("caracterización de los patrones: lectura de lo que escribe la persona", () => {
  it("extractCitaHints y mentionsPlacePreposition", () => {
    expect(
      twice(() => [
        extractCitaHints("Quiero cita de médico general, en San Borja!"),
        extractCitaHints("pediatría/odontología cerca de comas"),
        extractCitaHints("medicina generalista"),
        mentionsPlacePreposition("¿atienden *en* Lima?"),
        mentionsPlacePreposition("de lima"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "distrito": "San Borja",
          "especialidad": "Medicina General",
        },
        {
          "distrito": "Comas",
          "especialidad": "Pediatría",
        },
        {},
        true,
        false,
      ]
    `);
  });

  it("detectOutOfScope ignora signos y espacios repetidos", () => {
    expect(
      twice(() => [
        detectOutOfScope("¡¡No puede   respirar!!"),
        detectOutOfScope("quiero una cita"),
        detectOutOfScope("vacuna, por favor"),
        detectOutOfScope("  ...  "),
      ]),
    ).toMatchInlineSnapshot(`
      [
        "OOS-01",
        undefined,
        "OOS-06",
        undefined,
      ]
    `);
  });

  it("isGreeting y detectCitaRequest", () => {
    expect(twice(() => [isGreeting("¡Hola!!"), isGreeting("hola, quiero algo"), detectCitaRequest("quiero una cita, en comas")]))
      .toMatchInlineSnapshot(`
      [
        true,
        false,
        {
          "distrito": "Comas",
        },
      ]
    `);
  });

  it("looksLikePlaceName e isGibberishPlaceText", () => {
    expect(
      twice(() => [
        looksLikePlaceName("San Juan de Lurigancho"),
        looksLikePlaceName("Ñaña"),
        looksLikePlaceName("x1"),
        looksLikePlaceName("ab"),
        looksLikePlaceName("1 de mayo"),
        isGibberishPlaceText("Sán Bórja"),
        isGibberishPlaceText("asdfgh qwerty"),
        isGibberishPlaceText("a-b 1"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        true,
        true,
        false,
        false,
        false,
        false,
        true,
        true,
      ]
    `);
  });

  it("formatos de documento y de código", () => {
    expect([
      isValidDniFormat(" 12345678 "),
      isValidDniFormat("1234567"),
      isValidDniFormat("12345678\n9"),
      isValidDocumentoFormat("123456789"),
      isValidDocumentoFormat("1234567890"),
      isValidOtpFormat("1234"),
      isValidOtpFormat("123456789"),
      isValidOtpFormat("12a4"),
    ]).toMatchInlineSnapshot(`
      [
        true,
        false,
        false,
        true,
        false,
        true,
        false,
        false,
      ]
    `);
  });

  it("parseInicioIncidencia y parseCodigoSuelto", () => {
    expect(
      twice(() => [
        parseInicioIncidencia("Quiero presentar una incidencia en CODIGO-IPRESS: 0006206 - Hospital Dos de Mayo. me trataron mal"),
        parseInicioIncidencia("Incidencia: Hospital Dos de Mayo, código ipress 6206abc y algo más"),
        parseInicioIncidencia("incidencia -  Posta  X  CODIGO IPRESS:  000 resto"),
        parseInicioIncidencia("Hola, buenas tardes! quiero reportar una incidencia en el  de la Posta San Borja -- "),
        parseInicioIncidencia("quiero una cita"),
        parseCodigoSuelto("codigo ipress 00123."),
        parseCodigoSuelto(" 000 "),
        parseCodigoSuelto("6206 x"),
        parseCodigoSuelto("1234567890"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "codigoRenipress": "6206",
          "nombre": "en",
          "origen": "qr",
          "resto": "Hospital Dos de Mayo. me trataron mal",
        },
        {
          "nombre": "Hospital Dos de Mayo,",
          "origen": "qr",
          "resto": "y algo más",
        },
        {
          "nombre": "Posta  X",
          "origen": "qr",
          "resto": "resto",
        },
        {
          "nombre": "Posta San Borja",
          "origen": "texto",
          "resto": "en el  de la Posta San Borja",
        },
        null,
        "123",
        undefined,
        undefined,
        undefined,
      ]
    `);
  });

  it("quiereOmitirUbicacion compara la frase completa sin signos", () => {
    expect(
      twice(() => [
        quiereOmitirUbicacion("¡No lo sé!"),
        quiereOmitirUbicacion("no sé  el   nombre..."),
        quiereOmitirUbicacion("no sé dónde queda"),
        quiereOmitirUbicacion("¿Omitir?"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        true,
        true,
        false,
        true,
      ]
    `);
  });

  it("resolveConfirmation, isSlotAcceptance y la intención de salir", () => {
    expect(
      twice(() => [
        resolveConfirmation("Síííí, claro!!"),
        resolveConfirmation("nooo gracias"),
        resolveConfirmation("???"),
        isSlotAcceptance("ok, me quedo con esa hora"),
        isSlotAcceptance("Dale, esa me sirve"),
        isSlotAcceptance("sí la tomo!"),
        isSlotAcceptance("esa no"),
        normalizeIntentPhrase("  Yaaa NOOO   quiero, nada!! "),
        detectExitIntent("Ya noooo quiero nada!!"),
        detectExitIntent("Cancelar mi cita, por favor"),
        detectExitIntent("no"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        "YES",
        "NO",
        "UNKNOWN",
        true,
        true,
        true,
        false,
        "ya no quiero nada",
        true,
        true,
        false,
      ]
    `);
  });

  it("matchSelection y hintText leen ordinales, números y nombres", () => {
    expect(
      twice(() => [
        matchSelection("quiero la opción 2", OPCIONES),
        matchSelection("la última", OPCIONES),
        matchSelection("12", OPCIONES),
        matchSelection("Odontología!!", OPCIONES),
        matchSelection("3 cupos", OPCIONES, { includeDescription: true }),
        hintText("  Quiero   Pediatría, ¡por favor! "),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "kind": "match",
          "row": {
            "description": "1 cupo",
            "id": "b",
            "title": "Pediatría",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "c",
            "title": "Odontología",
          },
        },
        {
          "kind": "none",
        },
        {
          "kind": "match",
          "row": {
            "id": "c",
            "title": "Odontología",
          },
        },
        {
          "kind": "none",
        },
        "pediatria",
      ]
    `);
  });
});

describe("caracterización de los patrones: fechas y horas", () => {
  it("parseOfferedDate lee los dos formatos de id y rechaza el resto", () => {
    expect([
      parseOfferedDate("15/10/2026"),
      parseOfferedDate("20261015"),
      parseOfferedDate("2026-10-15"),
      parseOfferedDate("15/10/26"),
      parseOfferedDate(" 20261015"),
    ]).toMatchInlineSnapshot(`
      [
        {
          "day": 15,
          "month": 10,
          "year": 2026,
        },
        {
          "day": 15,
          "month": 10,
          "year": 2026,
        },
        undefined,
        undefined,
        undefined,
      ]
    `);
  });

  it("matchFechaText: la más próxima", () => {
    expect([fecha("lo más pronto"), fecha("la mas cercana"), fecha("cualquiera"), fecha("cuanto antes!!"), fecha("primera disponible")])
      .toMatchInlineSnapshot(`
      [
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
      ]
    `);
  });

  it("matchFechaText: fecha numérica", () => {
    expect([fecha("el 15/10"), fecha("15-10-26"), fecha("13/10/2026"), fecha("32/10"), fecha("15/13"), fecha("16/10"), fecha("1/1")])
      .toMatchInlineSnapshot(`
      [
        {
          "kind": "match",
          "row": {
            "id": "20261015",
            "title": "jue 15 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261015",
            "title": "jue 15 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "13/10/2026",
            "title": "mar 13 oct",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unavailable",
          "label": "16/10/2026",
        },
        {
          "kind": "unavailable",
          "label": "01/01/2027",
        },
      ]
    `);
  });

  it("matchFechaText: día y nombre del mes", () => {
    expect([
      fecha("15 de octubre"),
      fecha("14 OCTUBRE"),
      fecha("el 13   de  octubre por favor"),
      fecha("40 de octubre"),
      fecha("3 de setiembre"),
      fecha("15 de octubres"),
    ]).toMatchInlineSnapshot(`
      [
        {
          "kind": "match",
          "row": {
            "id": "20261015",
            "title": "jue 15 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261014",
            "title": "mié 14 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "13/10/2026",
            "title": "mar 13 oct",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unavailable",
          "label": "03/09/2027",
        },
        {
          "kind": "unparsed",
        },
      ]
    `);
  });

  it("matchFechaText: hoy, mañana y pasado mañana", () => {
    expect([fecha("hoy"), fecha("Mañana"), fecha("pasado mañana"), fecha("para pasado  mañana, gracias")]).toMatchInlineSnapshot(`
      [
        {
          "kind": "match",
          "row": {
            "id": "20261012",
            "title": "lun 12 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "13/10/2026",
            "title": "mar 13 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261014",
            "title": "mié 14 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261014",
            "title": "mié 14 oct",
          },
        },
      ]
    `);
  });

  it("matchFechaText: día de la semana y día del mes", () => {
    expect([
      fecha("el jueves"),
      fecha("miércoles"),
      fecha("sábado"),
      fecha("día 14"),
      fecha("el 22"),
      fecha("el 30"),
      fecha("xyz"),
      fecha(""),
    ]).toMatchInlineSnapshot(`
      [
        {
          "kind": "ambiguous",
          "rows": [
            {
              "id": "20261015",
              "title": "jue 15 oct",
            },
            {
              "id": "20261022",
              "title": "jue 22 oct",
            },
          ],
        },
        {
          "kind": "match",
          "row": {
            "id": "20261014",
            "title": "mié 14 oct",
          },
        },
        {
          "kind": "unavailable",
          "label": "el sabado",
        },
        {
          "kind": "match",
          "row": {
            "id": "20261014",
            "title": "mié 14 oct",
          },
        },
        {
          "kind": "match",
          "row": {
            "id": "20261022",
            "title": "jue 22 oct",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unparsed",
        },
      ]
    `);
  });

  it("unpackHoraSlots y rowToSlot validan la hora de cada turno", () => {
    expect([
      unpackHoraSlots("08:00|08:20|2;15:30|15:50|x"),
      unpackHoraSlots("8:00|08:20|2"),
      unpackHoraSlots("08:00|0820|2"),
      unpackHoraSlots("08:00"),
      rowToSlot({ id: "08:00|08:20", title: "8:00" }),
      rowToSlot({ id: "08:00|8:20", title: "8:00" }),
      rowToSlot({ id: "08:00", title: "8:00" }),
    ]).toMatchInlineSnapshot(`
      [
        [
          {
            "cupos": 2,
            "end": "08:20",
            "start": "08:00",
          },
          {
            "cupos": 0,
            "end": "15:50",
            "start": "15:30",
          },
        ],
        [],
        [],
        [],
        {
          "cupos": 0,
          "end": "08:20",
          "start": "08:00",
        },
        undefined,
        undefined,
      ]
    `);
  });

  it("matchHoraText: extremos y momentos del día", () => {
    expect([
      hora("lo más temprano"),
      hora("cuanto antes"),
      hora("la más temprano"),
      hora("lo más tarde"),
      hora("la mas tarde"),
      hora("mediodía"),
      hora("medianoche"),
      hora("en la tarde"),
      hora("de madrugada"),
      hora("por la mañana"),
    ]).toMatchInlineSnapshot(`
      [
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "00:20",
            "start": "00:00",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "00:20",
            "start": "00:00",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "00:20",
            "start": "00:00",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 3,
            "end": "20:20",
            "start": "20:00",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 3,
            "end": "20:20",
            "start": "20:00",
          },
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 1,
              "end": "00:20",
              "start": "00:00",
            },
            {
              "cupos": 1,
              "end": "12:20",
              "start": "12:00",
            },
          ],
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "00:20",
            "start": "00:00",
          },
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 1,
              "end": "12:20",
              "start": "12:00",
            },
            {
              "cupos": 1,
              "end": "15:50",
              "start": "15:30",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 1,
              "end": "00:20",
              "start": "00:00",
            },
            {
              "cupos": 1,
              "end": "08:05",
              "start": "07:45",
            },
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
          ],
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 1,
              "end": "00:20",
              "start": "00:00",
            },
            {
              "cupos": 1,
              "end": "08:05",
              "start": "07:45",
            },
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
          ],
        },
      ]
    `);
  });

  it("matchHoraText: horas escritas", () => {
    expect([
      hora("8:00"),
      hora("15:30"),
      hora("a las 3 y media p.m."),
      hora("3 con 30 P. M."),
      hora("8 menos cuarto"),
      hora("8 menos 15 a.m"),
      hora("8 menos 70"),
      hora("ocho en punto"),
      hora("1530"),
      hora("800"),
      hora("a las 8"),
      hora("las 8"),
      hora("8 horas"),
      hora("20 hrs"),
      hora("8"),
      hora("12"),
      hora("8 pm"),
      hora("25:00"),
      hora("8:75"),
      hora("hola"),
    ]).toMatchInlineSnapshot(`
      [
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "15:50",
            "start": "15:30",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "15:50",
            "start": "15:30",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "15:50",
            "start": "15:30",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "08:05",
            "start": "07:45",
          },
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "08:05",
            "start": "07:45",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 1,
            "end": "15:50",
            "start": "15:30",
          },
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 2,
              "end": "08:20",
              "start": "08:00",
            },
            {
              "cupos": 3,
              "end": "20:20",
              "start": "20:00",
            },
          ],
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 3,
            "end": "20:20",
            "start": "20:00",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "several",
          "slots": [
            {
              "cupos": 1,
              "end": "00:20",
              "start": "00:00",
            },
            {
              "cupos": 1,
              "end": "12:20",
              "start": "12:00",
            },
          ],
        },
        {
          "kind": "exact",
          "slot": {
            "cupos": 3,
            "end": "20:20",
            "start": "20:00",
          },
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unparsed",
        },
        {
          "kind": "unparsed",
        },
      ]
    `);
  });
});

describe("caracterización de los patrones: seguridad, sesión y vista", () => {
  it("evaluateLexicalGuard: insultos disfrazados, alargados y apellidos protegidos", () => {
    expect(
      twice(() => [
        evaluateLexicalGuard("Dr. Ladrón de Guevara, ladron de guevara"),
        evaluateLexicalGuard("ladron"),
        evaluateLexicalGuard("son unos i.d.i.o.t.a.s"),
        evaluateLexicalGuard("1d10t4s!!!"),
        evaluateLexicalGuard("idiotaaaa"),
        evaluateLexicalGuard("i d i o t a"),
        evaluateLexicalGuard("idiottta"),
        evaluateLexicalGuard("!!hola!! C. S. M. Lima"),
        evaluateLexicalGuard("quiero una cita, la atención es pésima"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        {
          "action": "ALLOW",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": false,
          "matchedReason": undefined,
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "ladron"",
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "idiotas"",
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "idiotas"",
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "idiota"",
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "idiota"",
        },
        {
          "action": "DROP_AND_WARN",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": true,
          "matchedReason": "Coincidencia exacta de término: "idiota"",
        },
        {
          "action": "ALLOW",
          "hasCitaContext": false,
          "hasComplaintContext": false,
          "isOffensive": false,
          "matchedReason": undefined,
        },
        {
          "action": "ALLOW",
          "hasCitaContext": true,
          "hasComplaintContext": true,
          "isOffensive": false,
          "matchedReason": undefined,
        },
      ]
    `);
  });

  it("decodeJwtExp convierte base64url en base64 antes de leer el vencimiento", () => {
    const payload = Buffer.from(JSON.stringify({ exp: 1790000000, note: "???>>>~~~" })).toString("base64url");
    expect(payload).toMatch(/[-_]/);
    expect(twice(() => [decodeJwtExp(`h.${payload}.s`), decodeJwtExp("a.b"), decodeJwtExp("a.!!.c")])).toMatchInlineSnapshot(`
      [
        {
          "exp": 1790000000,
          "status": "found",
        },
        {
          "status": "malformed",
        },
        {
          "status": "malformed",
        },
      ]
    `);
  });

  it("parseImageDataUri separa el tipo y el contenido", () => {
    const parsed = twice(() => parseImageDataUri("DATA:image/PNG;base64,aGk="));
    expect(parsed).toEqual({ status: ParsedImageStatus.PARSED, mimeType: "image/png", bytes: Buffer.from("hi") });
    expect(parseImageDataUri("data:text/plain;base64,aGk=")).toEqual({ status: ParsedImageStatus.INVALID });
    expect(parseImageDataUri("data:image/png;base64,aGk=\n")).toEqual({ status: ParsedImageStatus.INVALID });
  });

  it("tokenizeChatText y splitParagraphs", () => {
    expect(
      twice(() => [
        tokenizeChatText("*a* _b_ 🇵🇪 ⚠️ *c* x_y_z *no cierra _tampoco ⚠ * d * _ e _ *f g*_h i_"),
        tokenizeChatText("*uno*"),
        splitParagraphs("Uno\n\n\nDos\n \nTres\r\n\r\nCuatro"),
      ]),
    ).toMatchInlineSnapshot(`
      [
        [
          {
            "kind": "bold",
            "value": "a",
          },
          {
            "kind": "text",
            "value": " ",
          },
          {
            "kind": "italic",
            "value": "b",
          },
          {
            "kind": "text",
            "value": " ",
          },
          {
            "icon": "peru_flag",
            "kind": "icon",
          },
          {
            "kind": "text",
            "value": " ",
          },
          {
            "icon": "warning",
            "kind": "icon",
          },
          {
            "kind": "text",
            "value": " ",
          },
          {
            "kind": "bold",
            "value": "c",
          },
          {
            "kind": "text",
            "value": " x_y_z *no cierra _tampoco ",
          },
          {
            "icon": "warning",
            "kind": "icon",
          },
          {
            "kind": "text",
            "value": " * d * _ e _ ",
          },
          {
            "kind": "bold",
            "value": "f g",
          },
          {
            "kind": "italic",
            "value": "h i",
          },
        ],
        [
          {
            "kind": "bold",
            "value": "uno",
          },
        ],
        [
          "Uno",
          "Dos
       
      Tres

      Cuatro",
        ],
      ]
    `);
  });
});
