export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reportConfigIssues } = await import("@/lib/config/config-errors");
  reportConfigIssues();
}
