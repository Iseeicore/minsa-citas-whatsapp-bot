export function formatWindowCountdown(windowExpiresAt: string): { label: string; warning: boolean } | null {
  const remainingMs = new Date(windowExpiresAt).getTime() - Date.now();
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) return null;

  const totalMinutes = Math.floor(remainingMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const warning = remainingMs < 60 * 60 * 1000;

  return {
    label: `Ventana de 24h: quedan ${hours}h ${minutes}m para responder libremente`,
    warning,
  };
}
