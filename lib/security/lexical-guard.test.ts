import { describe, expect, it } from "vitest";
import { evaluateLexicalGuard } from "@/lib/security/lexical-guard";

const action = (text: string) => evaluateLexicalGuard(text).action;

describe("lexical guard — legitimate messages must be ALLOWED", () => {
  const legitimate = [
    // Common words that sat within Levenshtein distance of an insult target.
    "Buenas tarde, quiero agendar",
    "buenas tardes quiero una cita",
    "Necesito practicar mi idioma",
    "El doctor se tarda mucho en atender",
    "el doctor tardó una hora",
    "Quiero estudio de laboratorio",
    "hueco en la agenda",
    "tengo huevo y leche en la nevera",
    "estupendo, muchas gracias",
    // Names / surnames / initials that collapsed into short roots.
    "Isaac S. Mendoza",
    "Marc S. Morales",
    "Elizabeth D. Pérez",
    "Ladrón de Guevara Quispe",
    "Estupiñán Rojas Juan",
    // Scunthorpe-style substrings.
    "mi computadora no abre la página",
    "el diputado no responde",
    // Numbers / identifiers must never be deformed into letters.
    "mi DNI es 45781239",
    "mi celular es 987654321",
    // Plain complaints and requests without insults.
    "Solicito una cita para mi hijo",
    "La atención fue pésima, no me atendieron",
    "quiero hacer un reclamo",
    "RECLAMO",
    "hola",
    "1",
    "2",
    "Necesito atención por dolor de muela",
  ];

  it.each(legitimate)("ALLOW: %s", (text) => {
    expect(action(text)).toBe("ALLOW");
  });
});

describe("lexical guard — pure aggression => DROP_AND_WARN", () => {
  const pure = [
    "hdp!!!!!!",
    "cojuuuudo",
    "cojudazos",
    "c0jud0",
    "1mb3c1l",
    "1.m.b.3.c.1.l.",
    "i.d.i.o.t.a",
    "c s m",
    "idiotaaaa",
    "estupidos ustedes",
    "mierdas",
    "huevonazo",
    "ladrones",
    "hijo de puta",
    "hijueputa",
    "conchatumadre",
    "concha de tu madre",
    "puta madre",
    "ptm",
    "mrd",
    "pendejo",
    "malparido",
    "maricon",
    "cabron",
    "Este sistema es una mierda",
  ];

  it.each(pure)("DROP_AND_WARN: %s", (text) => {
    expect(action(text)).toBe("DROP_AND_WARN");
  });
});

describe("lexical guard — aggression + intent", () => {
  it("routes an insulting request for an appointment to the Cita flow", () => {
    expect(action("cojudos denme una cita")).toBe("CITA_WITH_WARNING");
    expect(action("quiero una cita hdp")).toBe("CITA_WITH_WARNING");
  });

  it("routes an insulting complaint about the service to the Reclamo flow", () => {
    expect(action("Doctora imbécil no me dio mi medicina")).toBe("FORCE_RECLAMO");
    expect(action("maldita posta no me atiende el doctor")).toBe("FORCE_RECLAMO");
    expect(action("maldita posta atienden pésimo")).toBe("FORCE_RECLAMO");
  });

  it("gives the complaint route precedence over the cita route", () => {
    expect(action("quiero un reclamo por mi cita, idiotas")).toBe("FORCE_RECLAMO");
  });
});

describe("lexical guard — result details", () => {
  it("explains why a message was flagged", () => {
    const result = evaluateLexicalGuard("hdp");
    expect(result.isOffensive).toBe(true);
    expect(result.matchedReason).toContain("hdp");
  });

  it("does not flag anything on an empty message", () => {
    expect(action("")).toBe("ALLOW");
    expect(action("   ")).toBe("ALLOW");
  });
});

describe("lexical guard — fuzzy matching stays bounded", () => {
  // Typical vocabulary of this bot's domain; none of it may ever be flagged.
  const vocabulary = [
    "cita", "citas", "medico", "medica", "doctor", "doctora", "hospital", "posta", "salud",
    "atencion", "turno", "consulta", "especialidad", "odontologia", "pediatria", "ginecologia",
    "dolor", "fiebre", "tarde", "tardes", "tarda", "tardo", "tardar", "mañana", "horario",
    "hora", "fecha", "lima", "distrito", "provincia", "departamento", "dni", "seguro", "essalud",
    "gracias", "favor", "buenas", "buenos", "dias", "noches", "hola", "quiero", "necesito",
    "agendar", "reservar", "cancelar", "cambiar", "reprogramar", "paciente", "nombre", "apellido",
    "telefono", "celular", "numero", "codigo", "verificar", "confirmar", "idioma", "estudio",
    "estudios", "estupendo", "carajo", "hueco", "huevo", "huevos", "cojin", "tarea", "tarifa",
    "tarjeta", "harto", "carro", "cargo", "corto", "estuvo", "estudiar", "idiomas", "lunes",
    "martes", "miercoles", "jueves", "viernes", "sabado", "domingo", "septiembre", "octubre",
  ];

  it.each(vocabulary)("does not flag the domain word %s", (word) => {
    expect(action(word)).toBe("ALLOW");
  });

  it("still catches a one-letter typo of a strong insult", () => {
    expect(action("imbecill")).toBe("DROP_AND_WARN");
    expect(action("estupidoo")).toBe("DROP_AND_WARN");
  });
});

describe("lexical guard — performance", () => {
  it("evaluates a 200 character message in well under 2 ms on average", () => {
    const message =
      "Buenas tardes doctora, quiero una cita para mi hijo por favor, necesito atencion en odontologia " +
      "en el distrito de San Borja el lunes por la tarde, gracias por su atencion y buen servicio siempre";
    const runs = 2000;
    const start = performance.now();
    for (let i = 0; i < runs; i++) evaluateLexicalGuard(message);
    const averageMs = (performance.now() - start) / runs;
    expect(averageMs).toBeLessThan(2);
  });
});

describe("lexical guard: augmentative suffixes (-azo / -aza)", () => {
  it.each(["idiotazo", "imbecilazo", "1mb3c1lazo", "estupidazo", "estupidaza", "pendejazo", "imbecilazos", "cojudazo"])(
    "detects %s",
    (text) => {
      expect(action(text)).toBe("DROP_AND_WARN");
    },
  );
});

describe("lexical guard: words split by interior dots and dashes", () => {
  it.each(["im.be.cil", "im-be-cil", "i.mb.ec.il", "mier.da", "es.tu.pi.do", "co.ju.do", "im_be_cil", "im.be.cil."])(
    "detects %s",
    (text) => {
      expect(action(text)).toBe("DROP_AND_WARN");
    },
  );

  it.each([
    "Ana-Maria Perez",
    "post-operatorio",
    "anti-inflamatorio",
    "cita-medica",
    "www.minsa.gob.pe",
    "juan.perez@gmail.com",
    "22.09.2026",
    "S.A.C.",
    "8.45 am",
    "no.me.atendieron.ayer",
  ])("does not flag %s", (text) => {
    expect(action(text)).not.toBe("DROP_AND_WARN");
  });
});

describe("lexical guard: doubled consonants (hdpp -> hdp)", () => {
  it.each(["hdpp", "hdpps", "ctmm", "csmm", "cojuddo", "imbecill", "hhdp", "ptmm"])("detects %s", (text) => {
    expect(action(text)).toBe("DROP_AND_WARN");
  });

  it.each(["llama", "ella", "pizza", "accion", "carrera", "perro", "annie", "Mallqui", "Quillabamba", "ellos"])(
    "does not flag the legitimate double consonants in %s",
    (text) => {
      expect(action(text)).toBe("ALLOW");
    },
  );
});
