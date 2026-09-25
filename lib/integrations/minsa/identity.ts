import type { ValidateUserResult, VerifyCodeResult } from "@/lib/integrations/minsa/types";
import { FAKE_BEARER, FAKE_DNI, FAKE_OTP, FAKE_TWOFA_ID } from "@/lib/integrations/minsa/fake-data";
import { postSigned } from "@/lib/integrations/minsa/wire";

// ---- Identity ------------------------------------------------------------

export async function validateUser(dni: string): Promise<ValidateUserResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postSigned("/api/v1/whatsapp/validate-user", {
      numero_documento: dni,
      conversation_id: process.env.MINSA_CONVERSATION_ID_PLACEHOLDER,
    });

    if ([400, 404, 422].includes(response.status)) {
      return { status: "not_valid" };
    }
    if (!response.ok) {
      return { status: "error" };
    }

    const body = await response.json();
    const valid =
      body?.valido === true ||
      body?.success === true ||
      body?.data?.valido === true ||
      body?.is_valid === true;

    if (!valid) return { status: "not_valid" };

    const twofaId = body?.twofa_id ?? body?.data?.twofa_id;
    if (typeof twofaId !== "string") return { status: "error" };

    return { status: "valid", twofaId };
  }

  if (dni === FAKE_DNI) {
    return { status: "valid", twofaId: FAKE_TWOFA_ID };
  }
  return { status: "not_valid" };
}

export async function verifyCode(twofaId: string, code: string): Promise<VerifyCodeResult> {
  if (process.env.SANDBOX_USE_REAL_MINSA === "true") {
    const response = await postSigned("/api/v1/whatsapp/verify-code", {
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

    const body = await response.json();
    const token = body?.token ?? body?.data?.token;

    if (body?.success === true && typeof token === "string") {
      return { status: "verified", token };
    }
    return { status: "invalid" };
  }

  if (twofaId === FAKE_TWOFA_ID && code === FAKE_OTP) {
    return { status: "verified", token: FAKE_BEARER };
  }
  return { status: "invalid" };
}
