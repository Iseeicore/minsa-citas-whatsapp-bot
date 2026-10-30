import { describe, expect, it } from "vitest";
import { registrarIncidenciaSchema } from "@/lib/recepcion/dto";
import { SessionChannel } from "@/lib/enums/session-channel";

const SUBMISSION = { waId: "51999000111", descripcion: "Me cobraron sin recibo" };

describe("registrarIncidenciaSchema", () => {
  it("acepta la denuncia con el canal por el que llegó", () => {
    const parsed = registrarIncidenciaSchema.safeParse({ ...SUBMISSION, canal: SessionChannel.WEB });

    expect(parsed.success && parsed.data.canal).toBe(SessionChannel.WEB);
  });

  it("rechaza una denuncia sin canal en vez de suponer WhatsApp", () => {
    expect(registrarIncidenciaSchema.safeParse(SUBMISSION).success).toBe(false);
  });
});
