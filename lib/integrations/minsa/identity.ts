import type { ValidateUserResult, VerifyCodeResult } from "@/lib/integrations/minsa/types";
import { FAKE_BEARER, FAKE_CARNET_EXTRANJERIA, FAKE_DNI, FAKE_OTP, FAKE_TWOFA_ID } from "@/lib/integrations/minsa/fake-data";
import { isRawRow, type RawRow } from "@/lib/integrations/minsa/row-readers";
import { postSigned, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import type { TipoDocumento } from "@/lib/enums/tipo-documento";

const FAKE_DOCUMENTS: readonly string[] = [FAKE_DNI, FAKE_CARNET_EXTRANJERIA];

function rootAndData(body: unknown): { root: RawRow; data: RawRow } {
  const root = isRawRow(body) ? body : {};
  return { root, data: isRawRow(root.data) ? root.data : {} };
}

function parseValidateUser(body: unknown): ValidateUserResult {
  const { root, data } = rootAndData(body);
  const valid = root.valido === true || root.success === true || data.valido === true || root.is_valid === true;
  if (!valid) return { status: "not_valid" };

  const twofaId = root.twofa_id ?? data.twofa_id;
  return typeof twofaId === "string" ? { status: "valid", twofaId } : { status: "error" };
}

function parseVerifyCode(body: unknown): VerifyCodeResult {
  const { root, data } = rootAndData(body);
  const token = root.token ?? data.token;
  return root.success === true && typeof token === "string" ? { status: "verified", token } : { status: "invalid" };
}

export async function validateUser(numeroDocumento: string, tipoDocumento: TipoDocumento): Promise<ValidateUserResult> {
  if (isRealMinsaEnabled()) {
    const response = await postSigned(MinsaEndpoint.VALIDAR_USUARIO, {
      numero_documento: numeroDocumento,
      tipo_documento: tipoDocumento,
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
    });

    if ([400, 404, 422].includes(response.status)) {
      return { status: "not_valid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    return parseValidateUser(await response.json());
  }

  if (FAKE_DOCUMENTS.includes(numeroDocumento)) {
    return { status: "valid", twofaId: FAKE_TWOFA_ID };
  }
  return { status: "not_valid" };
}

export async function verifyCode(twofaId: string, code: string): Promise<VerifyCodeResult> {
  if (isRealMinsaEnabled()) {
    const response = await postSigned(MinsaEndpoint.VERIFICAR_CODIGO, {
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
      twofa_id: twofaId,
      code,
    });

    if ([400, 401, 422].includes(response.status)) {
      return { status: "invalid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    return parseVerifyCode(await response.json());
  }

  if (twofaId === FAKE_TWOFA_ID && code === FAKE_OTP) {
    return { status: "verified", token: FAKE_BEARER };
  }
  return { status: "invalid" };
}
