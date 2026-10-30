import { describe, expect, it } from "vitest";
import { graphFailureErrorCode } from "@/lib/inbox/graph-failure";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

describe("graphFailureErrorCode", () => {
  it.each([400, 401, 403, 404])("treats a Graph %i as a rejected message", (status) => {
    expect(graphFailureErrorCode(status)).toBe(ApiErrorCode.WHATSAPP_REJECTED);
  });

  it.each([429, 500, 503])("treats a Graph %i as WhatsApp being unavailable", (status) => {
    expect(graphFailureErrorCode(status)).toBe(ApiErrorCode.WHATSAPP_UNAVAILABLE);
  });
});
