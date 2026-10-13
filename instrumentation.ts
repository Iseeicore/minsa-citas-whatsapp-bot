export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportConfigIssues } = await import("@/lib/config/config-errors");
  reportConfigIssues();
  const { expireStaleInbound } = await import("@/lib/whatsapp/inbound/expire-stale-inbound");
  await expireStaleInbound();
}
