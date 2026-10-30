type Env = Record<string, string | undefined>;

function findPresent(value: string | undefined): string | undefined {
  return value?.trim() ? value : undefined;
}

export function findMetaAppSecret(env: Env = process.env): string | undefined {
  return findPresent(env.META_APP_SECRET);
}

export function findMetaAccessToken(env: Env = process.env): string | undefined {
  return findPresent(env.META_ACCESS_TOKEN);
}

export function findMetaPhoneNumberId(env: Env = process.env): string | undefined {
  return findPresent(env.META_PHONE_NUMBER_ID);
}

export function findMetaWebhookVerifyToken(env: Env = process.env): string | undefined {
  return findPresent(env.META_WEBHOOK_VERIFY_TOKEN);
}

export function findMinsaApiHost(env: Env = process.env): string | undefined {
  return findPresent(env.MINSA_API_HOST);
}

export function findMinsaIntegrationSecret(env: Env = process.env): string | undefined {
  return findPresent(env.MINSA_INTEGRATION_SECRET);
}

export function findGoogleClientApi(env: Env = process.env): string | undefined {
  return findPresent(env.GOOGLE_CLIENT_API);
}
