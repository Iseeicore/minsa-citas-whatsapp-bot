import { describe, expect, it } from "vitest";
import {
  findGoogleAiBaseUrl,
  findGoogleAiModel,
  findGoogleClientApi,
  findMetaAccessToken,
  findMetaAppSecret,
  findMetaPhoneNumberId,
  findMetaWebhookVerifyToken,
  findMinsaApiHost,
  findMinsaIntegrationSecret,
} from "@/lib/config/integrations";

const READERS = [
  ["META_APP_SECRET", findMetaAppSecret],
  ["META_ACCESS_TOKEN", findMetaAccessToken],
  ["META_PHONE_NUMBER_ID", findMetaPhoneNumberId],
  ["META_WEBHOOK_VERIFY_TOKEN", findMetaWebhookVerifyToken],
  ["MINSA_API_HOST", findMinsaApiHost],
  ["MINSA_INTEGRATION_SECRET", findMinsaIntegrationSecret],
  ["GOOGLE_CLIENT_API", findGoogleClientApi],
  ["GOOGLE_AI_MODEL", findGoogleAiModel],
  ["GOOGLE_AI_BASE_URL", findGoogleAiBaseUrl],
] as const;

describe("integration variables", () => {
  it.each(READERS)("%s is read as it is set", (name, find) => {
    expect(find({ [name]: "valor" })).toBe("valor");
  });

  it.each(READERS)("%s missing, empty or blank is undefined, never an empty key", (name, find) => {
    expect(find({})).toBeUndefined();
    expect(find({ [name]: "" })).toBeUndefined();
    expect(find({ [name]: "   " })).toBeUndefined();
  });

  it("GOOGLE_AI_BASE_URL drops its trailing slashes, and a bare slash counts as missing", () => {
    expect(findGoogleAiBaseUrl({ GOOGLE_AI_BASE_URL: "https://ai.example.test/v1//" })).toBe("https://ai.example.test/v1");
    expect(findGoogleAiBaseUrl({ GOOGLE_AI_BASE_URL: "/" })).toBeUndefined();
  });
});
