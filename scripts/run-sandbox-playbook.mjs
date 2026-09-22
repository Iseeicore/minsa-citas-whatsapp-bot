#!/usr/bin/env node
// Fires the Sandbox-reachable cases from docs/qa/manual-test-playbook.md
// against a locally running `npm run dev`, one HTTP call per playbook step,
// and logs every request/response as NDJSON — a reviewable trail of the
// happy path, the lexical guard and the out-of-scope catalog, without
// touching WhatsApp or Meta at all.
//
// Requires, in a SEPARATE terminal:
//   npm run dev
// and a `.env.local` with `SANDBOX_ENABLED=true` and a real `DATABASE_URL`
// (the Sandbox route always goes through Prisma — see app/api/sandbox/route.ts).
// Run in fake mode (SANDBOX_USE_REAL_* off), matching the playbook's §0.2.
//
// Usage:
//   node scripts/run-sandbox-playbook.mjs
//   SANDBOX_URL=http://localhost:3000/api/sandbox node scripts/run-sandbox-playbook.mjs
//
// NOT covered here (see the playbook itself for why):
//   - §1.4 (media/stickers/voice notes) and §1.5 (rate limiting): WhatsApp-only,
//     the Sandbox explicitly doesn't apply (§0.5).
//   - §1.6 (webhook signature): a different route than Sandbox — checked
//     separately below (webhookSignatureCheck), no Meta credentials needed.
//   - §3.15a-c: needs a real 10-minute wait, not practical in a scripted run.
//   - §3.15g-l, §3.17h/j, and the real-mode branch of §3.9: need
//     SANDBOX_USE_REAL_MINSA — the fake catalog has exactly one district
//     (Lurigancho) and it always has coverage, so "sin especialidades" or
//     "distrito con vecinos" can't happen against it.
//   - Deep multi-step reclamo states (§1.1f, §1.2j, §2.3c, §3.16l/n/p) and the
//     button-only disambiguation branches of §3.13d/e: skipped rather than
//     guessed, since a wrong internal button id would silently log the wrong
//     path. Everything else uses the typed equivalent the playbook itself
//     documents next to each button.
//
// Every `expect` below is ADVISORY, not a verdict: the fake catalog's dates
// are "the next 3 days" (they shift daily) and AI-mode text can vary, so a ❓
// means "read this one yourself" — it does not mean "broken". The record
// this script exists to produce is the NDJSON file, plus whatever the
// `npm run dev` terminal printed in parallel (turn.*, ai.fallback,
// perimeter.*, [turn-lock] — the lines docs/qa/manual-test-playbook.md §4.4
// needs for C2.2/C2.3/C3.1/C3.5/C4.1).

import { mkdir, appendFile } from "node:fs/promises";
import { join } from "node:path";

const SANDBOX_URL = process.env.SANDBOX_URL ?? "http://localhost:3000/api/sandbox";
const WEBHOOK_URL = new URL("/webhook/whatsapp", SANDBOX_URL).toString();
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const LOG_DIR = "scripts/playbook-runs";
const LOG_FILE = join(LOG_DIR, `${RUN_ID}.ndjson`);

let seq = 0;
const tally = { "✅": 0, "❓": 0, "🛑": 0, "•": 0 };

function textsOf(sent = []) {
  // A send_cta_url effect carries BOTH `text` (the body) and `buttonText`
  // (e.g. "Continuar mi cita") — checking with `??` alone hides buttonText
  // whenever text is also present, which produced a wall of false-negative
  // ❓ marks on the welcome message across the whole first run.
  return sent
    .map((effect) => [effect.text, effect.buttonText].filter(Boolean).join(" ") || effect.kind)
    .join(" | ");
}

async function sendRaw(from, action, { caseId, section, expect, expectAbsent, note } = {}) {
  seq += 1;
  const body = { from, ...action };
  let status;
  let json;
  try {
    const res = await fetch(SANDBOX_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    status = res.status;
    json = await res.json().catch(() => ({ error: "NON_JSON_RESPONSE" }));
  } catch (error) {
    status = 0;
    json = { error: `FETCH_FAILED: ${error instanceof Error ? error.message : String(error)}` };
  }

  const haystack = textsOf(json.sent ?? []).toLowerCase();
  let mark = "•";
  if (status === 0 || json.error) mark = "🛑";
  else if (expect) mark = haystack.includes(expect.toLowerCase()) ? "✅" : "❓";
  else if (expectAbsent) mark = haystack.includes(expectAbsent.toLowerCase()) ? "❓" : "✅";
  tally[mark] += 1;

  const record = {
    time: new Date().toISOString(),
    seq,
    case: caseId,
    section,
    from,
    request: action,
    status,
    sent: json.sent ?? null,
    session: json.session ?? null,
    error: json.error ?? null,
    expect: expect ?? (expectAbsent ? `NOT: ${expectAbsent}` : undefined),
    mark,
    note,
  };
  await appendFile(LOG_FILE, JSON.stringify(record) + "\n", "utf-8");

  const shown = textsOf(json.sent ?? []) || json.error || "(sin sent)";
  console.log(`${mark} [${caseId ?? "-"}] ${action.type}:${JSON.stringify(action.text ?? action.listId ?? "")} -> ${shown.slice(0, 140)}`);

  return json;
}

function ctxFor(id, section) {
  const from = `sandbox-qa-${id}`;
  return { from, send: (action, opts = {}) => sendRaw(from, action, { caseId: id, section, ...opts }) };
}

// ---- reusable chains (typed equivalents only, per docs/qa/manual-test-playbook.md §3) ----

async function welcome(ctx, text = "Hola") {
  return ctx.send({ type: "text", text, reset: true }, { expect: "Continuar mi cita" });
}

async function reachDniPrompt(ctx, welcomeText) {
  await welcome(ctx, welcomeText);
  return ctx.send({ type: "text", text: "1" }, { expect: "documento" });
}

async function reachDistritoPrompt(ctx, welcomeText) {
  await reachDniPrompt(ctx, welcomeText);
  await ctx.send({ type: "text", text: "12345678" }, { note: "DNI válido (fake)" });
  return ctx.send({ type: "text", text: "1234" }, { expect: "distrito" });
}

async function reachEspecialidadList(ctx, distrito = "Lurigancho") {
  await reachDistritoPrompt(ctx);
  return ctx.send({ type: "text", text: distrito }, { expect: "especialidad" });
}

async function reachFechaList(ctx, especialidad = "odontología") {
  await reachEspecialidadList(ctx);
  return ctx.send({ type: "text", text: especialidad }, { expect: "fecha" });
}

async function reachHorarioList(ctx, fechaPos = "1") {
  await reachFechaList(ctx);
  return ctx.send({ type: "text", text: String(fechaPos) }, { expect: "horario" });
}

// ---- case list ----

const REJECT_TEXT = "Mensaje no reconocido";
const MENU_TEXT = "ayudarte hoy";
const WARNING_A = "Le recordamos que este es un canal institucional";

async function section1() {
  const s = "1. Perímetro";

  await (async () => {
    const ctx = ctxFor("1.1a", s);
    const long383 =
      "Hola buenas tardes, quiero agendar una cita médica de odontología en el distrito de San Borja para mañana por la tarde porque tengo un dolor de muela muy fuerte desde hace tres días y no puedo dormir ni comer bien, ya intenté con pastillas pero no se me quita, además necesito que sea en un centro de salud cercano a mi casa, por favor ayúdenme lo más rápido posible, muchas gracias.";
    await ctx.send({ type: "text", text: long383, reset: true }, { expect: REJECT_TEXT });
    await ctx.send({ type: "text", text: "Hola" }, { caseId: "1.1d", section: s, expect: "Continuar mi cita", note: "el rechazo no debe dejar sesión" });
  })();

  await ctxFor("1.1b", s).send({ type: "text", text: "a".repeat(301), reset: true }, { expect: REJECT_TEXT });
  await ctxFor("1.1c", s).send({ type: "text", text: "hola ".repeat(60), reset: true }, { expect: MENU_TEXT, note: "300 caracteres exactos, no debe rechazarse" });

  await (async () => {
    const c1 = ctxFor("1.1g-cita", s);
    await c1.send({ type: "text", text: "1", reset: true }, { expect: "documento" });
    const c2 = ctxFor("1.1g-reclamo", s);
    await c2.send({ type: "text", text: "2", reset: true }, { expect: "Libro de Reclamaciones" });
  })();

  const links = [
    ["1.2a", "wa.me/51999999999"],
    ["1.2b", "http://ofertas-gratis.example.org"],
    ["1.2c", "https://bit.ly/3abc"],
    ["1.2d", "www.ofertas.net"],
    ["1.2e", "visita ofertas.com hoy"],
    ["1.2f", "entra a mipagina.pe"],
    ["1.2g", "HTTP://MAYUSCULAS.COM"],
  ];
  for (const [id, text] of links) {
    await ctxFor(id, s).send({ type: "text", text, reset: true }, { expect: REJECT_TEXT });
  }
  await ctxFor("1.2h", s).send({ type: "text", text: "vivo en Lima.Peru", reset: true }, { expectAbsent: REJECT_TEXT });
  await ctxFor("1.2i", s).send({ type: "text", text: "son las 8.45 am", reset: true }, { expectAbsent: REJECT_TEXT });

  await ctxFor("1.3a", s).send({ type: "text", text: "GANA DINERO FACIL ".repeat(18), reset: true }, { expect: REJECT_TEXT });
  await ctxFor("1.3b", s).send({ type: "text", text: "🔥🔥🔥💰💰💰", reset: true }, { expect: REJECT_TEXT });
  await ctxFor("1.3c", s).send({ type: "text", text: "a".repeat(48), reset: true }, { expect: REJECT_TEXT });
  await (async () => {
    const ctx = ctxFor("1.3d", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "🔥🔥🔥💰💰💰" }, { expect: MENU_TEXT, note: "con sesión abierta, no se rechaza; en modo real gasta 1 llamada a Gemini" });
  })();
  await ctxFor("1.3e", s).send({ type: "text", text: "👍", reset: true }, { expect: MENU_TEXT });
}

async function section2() {
  const s = "2. Filtro léxico";
  const insultos = [
    ["2.1a", "hdp"],
    ["2.1b", "1mb3c1l"],
    ["2.1c", "1mb3c1lazo"],
    ["2.1d", "im.be.cil"],
    ["2.1e", "hdpp"],
    ["2.1f", "cojuuuudo"],
    ["2.1g", "c s m"],
    ["2.1h", "hijo de puta"],
  ];
  for (const [id, text] of insultos) {
    const ctx = ctxFor(id, s);
    await welcome(ctx);
    await ctx.send({ type: "text", text }, { expect: WARNING_A });
  }

  await (async () => {
    const ctx = ctxFor("2.1i-j", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "hdp" }, { expect: WARNING_A });
    await ctx.send({ type: "text", text: "continuar" }, { caseId: "2.1i", section: s, expect: MENU_TEXT });
  })();
  await (async () => {
    const ctx = ctxFor("2.1j", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "hdp" }, { expect: WARNING_A });
    await ctx.send({ type: "text", text: "RECLAMO" }, { expect: "documento" });
  })();
  await ctxFor("2.1k", s).send({ type: "text", text: "hdp", reset: true }, { expect: WARNING_A, note: "primer mensaje" });

  const legit = [
    ["2.2a", "Atentamente C. S. M."],
    ["2.2b", "Dra. Rosario P. T. M."],
    ["2.2c", "Isaac S. Mendoza"],
    ["2.2d", "Mi posta es CS San Martín"],
  ];
  for (const [id, text] of legit) {
    const ctx = ctxFor(id, s);
    await welcome(ctx);
    await ctx.send({ type: "text", text }, { expectAbsent: WARNING_A });
  }
  await (async () => {
    const ctx = ctxFor("2.2e", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "c.s.m" }, { expect: WARNING_A, note: "sin espacios ni mayúsculas: sí es evasión" });
  })();

  for (const [id, text] of [
    ["2.3a", "posta de mrda pésima atención del doctor"],
    ["2.3b", "Doctora imbécil no me dio mi medicina"],
  ]) {
    const ctx = ctxFor(id, s);
    await welcome(ctx);
    await ctx.send({ type: "text", text }, { expect: "Libro de Reclamaciones" });
  }

  await (async () => {
    const ctx = ctxFor("2.4abc", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "Apúrense cojudos quiero cita de odontología en Lurigancho" }, {
      caseId: "2.4a",
      section: s,
      expect: "ingresa tu número de documento",
    });
    await ctx.send({ type: "text", text: "12345678" }, { caseId: "2.4b", section: s, note: "DNI válido (fake)" });
    await ctx.send({ type: "text", text: "1234" }, { caseId: "2.4c", section: s, expect: "Selecciona la especialidad" });
  })();
  await (async () => {
    const ctx = ctxFor("2.4d", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "Apúrense cojudos quiero cita de odontología en San Borja" }, { expect: "ingresa tu número de documento" });
    await ctx.send({ type: "text", text: "12345678" }, { note: "DNI válido (fake)" });
    await ctx.send({ type: "text", text: "1234" }, { expect: "No encontramos ese ubigeo", note: "catálogo fake no conoce San Borja" });
  })();
}

async function section2_5Stress() {
  // Stress cases from a 300-row Peruvian-slang dataset the user pasted,
  // curated down to ~16 probes that each isolate ONE variable instead of
  // repeating the same signal with a different district. See
  // docs/qa/manual-test-playbook.md §2.5 for the full rationale and the
  // exact code citations behind each prediction.
  const s = "2.5 Estrés — jerga, hostilidad y datos";

  // 2.5.1 — hostility + a resolvable full district/specialty name, first
  // message. This is the path that already works (same shape as §2.4a);
  // just confirming it holds for other districts/specialties.
  for (const [id, text] of [
    ["2.5.1a", "oe hdp dame mi cita de cardiología en Surco"],
    ["2.5.1b", "imbeciles atiendanme, cita de pediatría en San Isidro"],
    ["2.5.1c", "cojudos necesito cita de dermatología en Barranco"],
  ]) {
    await ctxFor(id, s).send({ type: "text", text, reset: true }, { expect: "ingresa tu número de documento" });
  }

  // 2.5.2 — same shape, but the district is an abbreviation (sjl/vmt/sjm).
  // Predicted: warning still fires (insult + "cita" token), but no district
  // hint is captured (no abbreviation table anywhere in the repo).
  for (const [id, text] of [
    ["2.5.2a", "oe hdp cita en sjl"],
    ["2.5.2b", "imbeciles denme cita en vmt"],
    ["2.5.2c", "cojudos cita en sjm"],
  ]) {
    await ctxFor(id, s).send({ type: "text", text, reset: true }, {
      expect: "ingresa tu número de documento",
      note: "revisar a mano en el panel Debug: no debe existir citaDistritoHintText",
    });
  }

  // 2.5.3 — jerga peruana ausente del diccionario (lib/security/lexicon.ts):
  // tmr/webon/gil puros, sin nada más. Predicted ALLOW (sin advertencia).
  for (const [id, text] of [
    ["2.5.3a", "tmr"],
    ["2.5.3b", "webon"],
    ["2.5.3c", "gil"],
  ]) {
    const ctx = ctxFor(id, s);
    await welcome(ctx);
    await ctx.send({ type: "text", text }, { expect: MENU_TEXT, note: "falso negativo esperado: no debe aparecer el mensaje A" });
  }

  // 2.5.4 — mid-flow, estado CON guard (cita_awaiting_distrito_ai). Predicted:
  // el mensaje se descarta entero y repite la pregunta, sin importar si la
  // acción interna sería DROP_AND_WARN/CITA_WITH_WARNING/FORCE_RECLAMO.
  await (async () => {
    const ctx = ctxFor("2.5.4a", s);
    await reachDistritoPrompt(ctx);
    await ctx.send({ type: "text", text: "hdp no jodas, san juan de lurigancho" }, { expect: WARNING_A });
  })();
  await (async () => {
    const ctx = ctxFor("2.5.4b", s);
    await reachDistritoPrompt(ctx);
    await ctx.send({ type: "text", text: "cojudos apurense, cita en surco" }, {
      expect: WARNING_A,
      note: "internamente sería CITA_WITH_WARNING, pero en medio del flujo se descarta igual",
    });
  })();
  await (async () => {
    const ctx = ctxFor("2.5.4c", s);
    await reachDistritoPrompt(ctx);
    await ctx.send({ type: "text", text: "posta de mrda, en comas" }, {
      expect: WARNING_A,
      note: "internamente sería FORCE_RECLAMO, pero en medio del flujo NO deriva a Reclamos — decisión de producto a revisar",
    });
  })();

  // 2.5.5 — mid-flow, estado SIN guard (cita_awaiting_hora_confirm: no está
  // en FREE_TEXT_STATE_PROMPTS ni en SELECTION_STATES). Predicted: si el
  // texto ruidoso matchea la hora pendiente, la cita se confirma SIN
  // ninguna advertencia — bypass real, no hipotético.
  await (async () => {
    const ctx = ctxFor("2.5.5a", s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text: "8" }, { expect: "Confirmas el horario" });
    await ctx.send({ type: "text", text: "a las 8 pe hdp" }, {
      expect: "Agendando tu cita",
      note: "si pasa: confirmó la cita con un insulto en el mensaje y SIN mostrar el recordatorio",
    });
  })();
  await (async () => {
    const ctx = ctxFor("2.5.5b", s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text: "8" }, { expect: "Confirmas el horario" });
    await ctx.send({ type: "text", text: "imbeciles a las 8 nomas" }, { expect: "Agendando tu cita" });
  })();

  // 2.5.6 — hora/fecha coloquial sin regla hoy (time-parser.ts/date-parser.ts).
  await (async () => {
    const ctx = ctxFor("2.5.6a", s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text: "después del almuerzo" }, {
      note: "sin expect: confirmar a mano qué responde (predicción: no resuelve una hora)",
    });
  })();
  await (async () => {
    const ctx = ctxFor("2.5.6b", s);
    await reachFechaList(ctx);
    await ctx.send({ type: "text", text: "pal 15" }, {
      note: "sin expect: confirmar a mano (predicción: no expande 'pal' a 'para el', no resuelve fecha)",
    });
  })();
}

async function section3HappyPath() {
  const s = "3. Camino feliz";

  await ctxFor("3.1a", s).send({ type: "text", text: "Hola", reset: true }, { expect: "Continuar mi cita" });
  await ctxFor("3.1b", s).send({ type: "text", text: "hola", reset: true }, { expect: MENU_TEXT });
  await ctxFor("3.1c", s).send(
    { type: "text", text: "Sabes quiero una cita para san Juan de Lurigancho para medicina general", reset: true },
    { expect: "San Juan de Lurigancho" },
  );
  await ctxFor("3.1d", s).send({ type: "text", text: "Quiero poner una queja", reset: true }, { expect: "Libro de Reclamaciones" });
  await ctxFor("3.1e", s).send({ type: "text", text: "necesito hablar con alguien", reset: true }, { expect: MENU_TEXT });

  const ctx = ctxFor("3.happy", s);
  await welcome(ctx);
  await ctx.send({ type: "text", text: "1" }, { caseId: "3.2", section: s, expect: "documento" });
  await ctx.send({ type: "text", text: "1234567" }, { caseId: "3.3", section: s, expect: "Documento inválido" });
  await ctx.send({ type: "text", text: "12345678" }, { caseId: "3.4", section: s, expect: "Te enviamos un código" });
  await ctx.send({ type: "text", text: "0000" }, { caseId: "3.5", section: s, expect: "Código incorrecto" });
  await ctx.send({ type: "text", text: "1234" }, { caseId: "3.6", section: s, expect: "distrito" });
  await ctx.send({ type: "text", text: "asdfghjk" }, { caseId: "3.7", section: s, expect: "No reconocimos ese distrito" });
  await ctx.send({ type: "text", text: "qwertyuiop" }, { caseId: "3.8", section: s, expect: "No reconocimos ese distrito" });
  await ctx.send({ type: "text", text: "Lurigancho" }, { caseId: "3.10", section: s, expect: "especialidad" });
  await ctx.send({ type: "text", text: "odontología" }, { caseId: "3.11", section: s, expect: "fecha" });
  await ctx.send({ type: "text", text: "1" }, { caseId: "3.12", section: s, expect: "horario" });
  await ctx.send({ type: "text", text: "1 pm" }, { caseId: "3.13f", section: s, expect: "Confirmas el horario" });
  await ctx.send({ type: "text", text: "sí" }, { caseId: "3.14a", section: s, expect: "MINISTERIO DE SALUD DEL PERÚ" });
  await ctx.send({ type: "text", text: "Hola" }, { caseId: "3.14c", section: s, expect: "Continuar mi cita", note: "reinicio tras estado terminal" });
}

async function section3_13Variants() {
  const s = "3.13 Selección de horario";
  const variants = [
    ["3.13a", "8", "Confirmas el horario 8:00 AM"],
    ["3.13b", "3", "Confirmas el horario 1:00 PM"],
    ["3.13c", "1", '¿A qué te refieres con "1"?'],
    ["3.13g", "en la tarde", "Confirmas el horario 1:00 PM"],
    ["3.13h", "a las 9 y media", "Confirmas el horario 9:30 AM"],
    ["3.13i", "a la 1", "Confirmas el horario 1:00 PM"],
    ["3.13j", "5", "Selecciona una opción de la lista"],
    ["3.13k", "a las 3", "No hay horarios disponibles a esa hora"],
    ["3.13l", "hdp", WARNING_A],
  ];
  for (const [id, text, expect] of variants) {
    const ctx = ctxFor(id, s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text }, { expect });
  }
}

async function section3_15() {
  const s = "3.15 Comportamientos añadidos";

  await (async () => {
    const ctx = ctxFor("3.15d-yes", s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text: "1 pm" }, { expect: "Confirmas el horario" });
    await ctx.send({ type: "text", text: "Si por favor" }, { expect: "Agendando tu cita" });
  })();
  await (async () => {
    const ctx = ctxFor("3.15d-no", s);
    await reachHorarioList(ctx);
    await ctx.send({ type: "text", text: "1 pm" }, { expect: "Confirmas el horario" });
    await ctx.send({ type: "text", text: "no, gracias" }, { expect: "Elige otro horario" });
  })();

  await ctxFor("3.15e", s).send(
    { type: "text", text: "Quiero una cita en San Juan de Lurigancho para poder atenderme en medicina general", reset: true },
    { expect: "verificar tu identidad" },
  );

  await (async () => {
    const ctx = ctxFor("3.15f", s);
    await welcome(ctx);
    await ctx.send({ type: "text", text: "hdp" }, { expect: WARNING_A });
    await ctx.send({ type: "text", text: "ya dale" }, { expect: MENU_TEXT });
  })();
}

async function section3_16() {
  const s = "3.16 Fuera de alcance / emergencias";
  const cases = [
    ["3.16a", "Mi mamá no puede respirar", "ESTE CANAL NO ATIENDE EMERGENCIAS"],
    ["3.16b", "ustedes son unos idiotas, mi mamá no puede respirar", "ESTE CANAL NO ATIENDE EMERGENCIAS"],
    ["3.16c", "¿Mi SIS está activo?", "Consulta sobre SIS"],
    ["3.16d", "¿Ya aceptaron mi referencia?", "Gestión de Referencias Médicas"],
    ["3.16e", "¿Ya salieron mis análisis de sangre?", "Entrega de Resultados Médicos"],
    ["3.16f", "¿Tienen Paracetamol o Insulina en la posta?", "Consulta de Medicamentos"],
    ["3.16g", "¿Qué días vacunan contra la influenza?", "Vacunación y Carnets Oficiales"],
    ["3.16h", "Quiero hablar con un doctor ahorita", "Orientación Médica Telefónica"],
    ["3.16i", "Mi reclamo N° 458-2026 sigue sin resolverse", "Seguimiento de Reclamos"],
    ["3.16j", "Necesito que me sellen mi descanso médico para mi trabajo", "Trámites Documentarios"],
    ["3.16m-a", "quiero una cita de medicina general", "documento"],
    ["3.16m-b", "necesito cita en medicina interna", "documento"],
  ];
  for (const [id, text, expect] of cases) {
    await ctxFor(id, s).send({ type: "text", text, reset: true }, { expect });
  }

  await (async () => {
    const ctx = ctxFor("3.16k", s);
    await ctx.send({ type: "text", text: "¿Mi SIS está activo?", reset: true }, { expect: "Consulta sobre SIS" });
    await ctx.send({ type: "text", text: "CITAS" }, { expect: "documento" });
  })();

  await (async () => {
    const ctx = ctxFor("3.16o", s);
    await reachDniPrompt(ctx);
    await ctx.send({ type: "text", text: "mi hijo no respira" }, { expect: "ESTE CANAL NO ATIENDE EMERGENCIAS" });
  })();
}

async function section3_17() {
  const s = "3.17 Un solo horario disponible";
  // Solo la 3ra fecha del catálogo fake (§0.2) tiene un único horario, así que
  // 3.17i (dos fechas de un solo horario seguidas) no es reproducible aquí.

  await (async () => {
    const ctx = ctxFor("3.17bc", s);
    await reachHorarioList(ctx, "3");
    await ctx.send({ type: "text", text: "sí" }, { caseId: "3.17b", section: s, expect: "Agendando tu cita" });
  })();

  await (async () => {
    const ctx = ctxFor("3.17c", s);
    await reachHorarioList(ctx, "3");
    await ctx.send({ type: "text", text: "esa hora" }, { expect: "Agendando tu cita" });
  })();

  await (async () => {
    const ctx = ctxFor("3.17d", s);
    await reachHorarioList(ctx, "3");
    await ctx.send({ type: "text", text: "a las 3" }, { expect: "Solo hay un horario disponible" });
  })();

  await (async () => {
    const ctx = ctxFor("3.17efg", s);
    await reachHorarioList(ctx, "3");
    await ctx.send({ type: "text", text: "no, gracias" }, { caseId: "3.17e", section: s, expect: "cambiar de fecha" });
    await ctx.send({ type: "text", text: "sí" }, { caseId: "3.17f", section: s, expect: "Buscando otras fechas" });
  })();

  await (async () => {
    const ctx = ctxFor("3.17g", s);
    await reachHorarioList(ctx, "3");
    await ctx.send({ type: "text", text: "no, gracias" }, { expect: "cambiar de fecha" });
    await ctx.send({ type: "text", text: "no" }, { expect: "no buscaremos otra fecha" });
  })();

  await (async () => {
    const ctx = ctxFor("3.17k", s);
    await reachHorarioList(ctx, "1");
    await ctx.send({ type: "text", text: "8" }, { caseId: "3.13a", section: s, expect: "Confirmas el horario" });
    await ctx.send({ type: "text", text: "esa hora" }, { caseId: "3.17k", section: s, expect: "Agendando tu cita" });
  })();
}

async function webhookSignatureCheck() {
  const s = "1.6 Firma del webhook (bonus, no depende de Meta)";
  let status;
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", body: "{}" });
    status = res.status;
  } catch (error) {
    status = 0;
    console.log(`🛑 [1.6a] no se pudo conectar a ${WEBHOOK_URL}: ${error instanceof Error ? error.message : error}`);
    return;
  }
  const mark = status === 403 ? "✅" : "❓";
  tally[mark] += 1;
  console.log(`${mark} [1.6a] POST ${WEBHOOK_URL} sin firma -> HTTP ${status} (se espera 403)`);
  await appendFile(LOG_FILE, JSON.stringify({ time: new Date().toISOString(), case: "1.6a", section: s, status, mark }) + "\n", "utf-8");
}

async function main() {
  await mkdir(LOG_DIR, { recursive: true });
  console.log(`Sandbox: ${SANDBOX_URL}`);
  console.log(`Log:     ${LOG_FILE}\n`);

  const sections = [
    ["§1 Perímetro", section1],
    ["§2 Filtro léxico", section2],
    ["§2.5 Estrés — jerga, hostilidad y datos", section2_5Stress],
    ["§3 Camino feliz", section3HappyPath],
    ["§3.13 Selección de horario", section3_13Variants],
    ["§3.15 Comportamientos añadidos", section3_15],
    ["§3.16 Fuera de alcance", section3_16],
    ["§3.17 Un solo horario disponible", section3_17],
    ["§1.6 Firma del webhook (bonus)", webhookSignatureCheck],
  ];

  for (const [label, fn] of sections) {
    console.log(`\n--- ${label} ---`);
    try {
      await fn();
    } catch (error) {
      console.log(`🛑 ${label} interrumpida: ${error instanceof Error ? error.stack : error}`);
    }
  }

  console.log("\n--- resumen ---");
  console.log(`✅ coincide con lo esperado: ${tally["✅"]}`);
  console.log(`❓ revisar a mano (dato variable o distinto):  ${tally["❓"]}`);
  console.log(`🛑 error (fetch o respuesta con error):        ${tally["🛑"]}`);
  console.log(`• sin verificación automática, solo log:       ${tally["•"]}`);
  console.log(`\nNDJSON completo en: ${LOG_FILE}`);
  console.log("Revisa también la terminal de `npm run dev` para las líneas turn.*/ai.fallback/perimeter.*/[turn-lock].");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
