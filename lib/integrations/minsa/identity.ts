import type { ValidateUserResult, VerifyCodeResult } from "@/lib/integrations/minsa/types";
import { FAKE_BEARER, FAKE_CARNET_EXTRANJERIA, FAKE_DNI, FAKE_OTP, FAKE_TWOFA_ID } from "@/lib/integrations/minsa/fake-data";
import type { RawRow } from "@/lib/integrations/minsa/row-readers";
import { postSigned, isRealMinsaEnabled } from "@/lib/integrations/minsa/wire";
import { MinsaEndpoint } from "@/lib/enums/minsa-endpoint";
import type { TipoDocumento } from "@/lib/enums/tipo-documento";
import { ValidateUserStatus } from "@/lib/enums/validate-user-status";
import { VerifyCodeStatus } from "@/lib/enums/verify-code-status";
import { isString, isRecord } from "@/lib/utils/type-guards";
import { logger } from "@/lib/observability/logger";

const FAKE_DOCUMENTS: readonly string[] = [FAKE_DNI, FAKE_CARNET_EXTRANJERIA];

function rootAndData(endpoint: MinsaEndpoint, body: unknown): { root: RawRow; data: RawRow } | undefined {
  if (!isRecord(body)) {
    logger.error("minsa.identity.contract_mismatch", { endpoint, reason: "body_not_object" });
    return undefined;
  }
  return { root: body, data: isRecord(body.data) ? body.data : {} };
}

function validityFlags(root: RawRow, data: RawRow): unknown[] {
  return [root.valido, root.success, data.valido, root.is_valid];
}

function parseValidateUser(body: unknown): ValidateUserResult {
  const parts = rootAndData(MinsaEndpoint.VALIDAR_USUARIO, body);
  if (!parts) return { status: ValidateUserStatus.ERROR };

  const flags = validityFlags(parts.root, parts.data);
  if (!flags.includes(true)) {
    if (flags.includes(false)) return { status: ValidateUserStatus.NOT_VALID };
    logger.error("minsa.identity.contract_mismatch", { endpoint: MinsaEndpoint.VALIDAR_USUARIO, reason: "no_explicit_answer" });
    return { status: ValidateUserStatus.ERROR };
  }

  const twofaId = parts.root.twofa_id ?? parts.data.twofa_id;
  return isString(twofaId) ? { status: ValidateUserStatus.VALID, twofaId } : { status: ValidateUserStatus.ERROR };
}

function parseVerifyCode(body: unknown): VerifyCodeResult {
  const parts = rootAndData(MinsaEndpoint.VERIFICAR_CODIGO, body);
  if (!parts) return { status: VerifyCodeStatus.ERROR };
  if (parts.root.success === false) return { status: VerifyCodeStatus.INVALID };

  const token = parts.root.token ?? parts.data.token;
  if (parts.root.success === true && isString(token)) return { status: VerifyCodeStatus.VERIFIED, token };

  logger.error("minsa.identity.contract_mismatch", {
    endpoint: MinsaEndpoint.VERIFICAR_CODIGO,
    reason: parts.root.success === true ? "token_missing" : "no_explicit_answer",
  });
  return { status: VerifyCodeStatus.ERROR };
}

export async function validateUser(numeroDocumento: string, tipoDocumento: TipoDocumento): Promise<ValidateUserResult> {
  if (isRealMinsaEnabled()) {
    const response = await postSigned(MinsaEndpoint.VALIDAR_USUARIO, {
      numero_documento: numeroDocumento,
      tipo_documento: tipoDocumento,
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
    });

    if ([400, 404, 422].includes(response.status)) {
      return { status: ValidateUserStatus.NOT_VALID };
    }
    if (!response.ok) {
      return { status: ValidateUserStatus.ERROR };
    }

    return parseValidateUser(await response.json());
  }

  if (FAKE_DOCUMENTS.includes(numeroDocumento)) {
    return { status: ValidateUserStatus.VALID, twofaId: FAKE_TWOFA_ID };
  }
  return { status: ValidateUserStatus.NOT_VALID };
}

export async function verifyCode(twofaId: string, code: string): Promise<VerifyCodeResult> {
  if (isRealMinsaEnabled()) {
    const response = await postSigned(MinsaEndpoint.VERIFICAR_CODIGO, {
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
      twofa_id: twofaId,
      code,
    });

    if ([400, 401, 422].includes(response.status)) {
      return { status: VerifyCodeStatus.INVALID };
    }
    if (!response.ok) {
      return { status: VerifyCodeStatus.ERROR };
    }

    return parseVerifyCode(await response.json());
  }

  if (twofaId === FAKE_TWOFA_ID && code === FAKE_OTP) {
    return { status: VerifyCodeStatus.VERIFIED, token: FAKE_BEARER };
  }
  return { status: VerifyCodeStatus.INVALID };
}
