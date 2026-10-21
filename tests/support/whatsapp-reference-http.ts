import { expect } from "vitest";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";

export const WHATSAPP_REFERENCE_SECRET = "synthetic-whatsapp-reference-hmac-secret";
export const WHATSAPP_REFERENCE_TOKEN = "synthetic-whatsapp-reference-session-token";
export const WHATSAPP_REFERENCE_DOCUMENT = "23456789";
export const WHATSAPP_REFERENCE_API = "https://synthetic-reference-api.test";

export const WHATSAPP_REFERENCE_ROWS = [3, 5, 7].map((state, index) => ({
  id_referencia: `synthetic-reference-${index}`,
  nro_referencia: `00${index + 1}`,
  fecha_inicio: "01/10/2098 13:19",
  ipress_origen: { codigo: "006000", descripcion: "CENTRO SINTETICO DE ORIGEN" },
  ipress_destino: {
    codigo: index < 2 ? "005987" : "009999",
    descripcion: index < 2 ? "HOSPITAL SINTETICO" : "OTRO HOSPITAL SINTETICO",
  },
  ups_origen: { codigo: "220000", descripcion: "CONSULTA EXTERNA" },
  ups_destino: { codigo: index < 2 ? "0222800" : "0223300", descripcion: index < 2 ? "CARDIOLOGIA" : "TRAUMATOLOGIA" },
  estado: { codigo: String(state), descripcion: "ESTADO SINTETICO" },
}));

export const WHATSAPP_REFERENCE_DATES = [
  { fecha_cupo: "01/01/2099", cantidad_cupos: 17 },
  { fecha_cupo: "02/01/2099", cantidad_cupos: 3 },
  { fecha_cupo: "03/01/2099", cantidad_cupos: 0 },
];

export const WHATSAPP_REFERENCE_TIMES = [
  { hora_inicio: "09:00", hora_fin: "09:30", cantidad_cupos: 2 },
  { hora_inicio: "10:00", hora_fin: "10:30", cantidad_cupos: 6 },
  { hora_inicio: "11:00", hora_fin: "11:30", cantidad_cupos: 0 },
];

export type GraphReferenceRow = { id: string; title: string; description?: string };
export type GraphReferenceMessage = {
  id: string;
  recipient?: string;
  type?: string;
  text?: { body: string };
  interactive?: {
    type: string;
    body: { text: string };
    action: {
      sections?: Array<{ rows: GraphReferenceRow[] }>;
      buttons?: Array<{ type: string; reply: { id: string; title: string } }>;
    };
  };
};

export class WhatsAppReferenceHttp {
  readonly messages: GraphReferenceMessage[] = [];
  readonly requests: Array<{ path: string; init: RequestInit }> = [];
  readonly statuses = new Map<MinsaEndpoint, number>();
  private graphSequence = 0;
  readonly responses = new Map<string, unknown>([
    [MinsaEndpoint.VALIDAR_USUARIO, { success: true, twofa_id: "synthetic-twofa-reference" }],
    [MinsaEndpoint.VERIFICAR_CODIGO, { success: true, token: WHATSAPP_REFERENCE_TOKEN }],
    [MinsaEndpoint.REFERENCIAS, structuredClone(WHATSAPP_REFERENCE_ROWS)],
    [MinsaEndpoint.FECHAS, { data: { fechas: structuredClone(WHATSAPP_REFERENCE_DATES) } }],
    [MinsaEndpoint.HORAS, { data: { horarios: structuredClone(WHATSAPP_REFERENCE_TIMES) } }],
    [MinsaEndpoint.CITAS, { message: "Reserva sintetica", data: { url: "https://synthetic-minsa-digital.test/constancia" } }],
  ]);

  readonly fetch: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    if (url.origin === WHATSAPP_REFERENCE_API) {
      this.requests.push({ path: url.pathname, init });
      expect(this.responses.has(url.pathname), url.pathname).toBe(true);
      return Response.json(this.responses.get(url.pathname), { status: this.statuses.get(url.pathname as MinsaEndpoint) ?? 200 });
    }
    expect(url.hostname).toBe("graph.facebook.com");
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer synthetic-meta-reference-token");
    const body = JSON.parse(String(init.body)) as Omit<GraphReferenceMessage, "id">;
    const id = `synthetic-out-${++this.graphSequence}`;
    if (body.recipient) this.messages.push({ id, ...body });
    return Response.json({ messages: [{ id }] });
  };

  requestsFor(endpoint: MinsaEndpoint) {
    return this.requests.filter((request) => request.path === endpoint);
  }

  latestInteractive(): GraphReferenceMessage {
    const message = this.messages.findLast((item) => item.type === "interactive");
    expect(message?.interactive).toBeDefined();
    if (!message?.interactive) throw new TypeError("Falta el mensaje interactivo sintetico");
    return message;
  }

  rows(): GraphReferenceRow[] {
    const message = this.latestInteractive();
    expect(message.interactive?.type).toBe("list");
    return message.interactive?.action.sections?.flatMap((section) => section.rows) ?? [];
  }

  assertLimits(): void {
    for (const message of this.messages) {
      const interactive = message.interactive;
      if (interactive?.type === "list") {
        const rows = interactive.action.sections?.flatMap((section) => section.rows) ?? [];
        expect(rows.length).toBeGreaterThan(0);
        expect(rows.length).toBeLessThanOrEqual(10);
        expect(new Set(rows.map((row) => row.id)).size).toBe(rows.length);
        for (const row of rows) {
          expect(row.title.length).toBeLessThanOrEqual(24);
          expect(row.description?.length ?? 0).toBeLessThanOrEqual(72);
        }
      } else if (interactive?.type === "button") {
        const buttons = interactive.action.buttons ?? [];
        expect(buttons.length).toBeGreaterThan(0);
        expect(buttons.length).toBeLessThanOrEqual(3);
        for (const button of buttons) expect(button.reply.title.length).toBeLessThanOrEqual(20);
      }
    }
  }
}
