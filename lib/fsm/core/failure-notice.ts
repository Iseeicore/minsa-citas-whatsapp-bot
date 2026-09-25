export type FailureNoticeThrottle = {
  shouldNotify(waId: string): boolean;
};

/** Limita el aviso de falla a uno cada 30 s por número (C4.2 de la auditoría); cada falla se sigue registrando en el log. */
export function createFailureNoticeThrottle(
  options: { now?: () => number; windowMs?: number } = {},
): FailureNoticeThrottle {
  const now = options.now ?? Date.now;
  const windowMs = options.windowMs ?? 30_000;
  const lastNotifiedAt = new Map<string, number>();

  return {
    shouldNotify(waId: string): boolean {
      const current = now();
      const last = lastNotifiedAt.get(waId);
      if (last !== undefined && current - last < windowMs) return false;

      lastNotifiedAt.set(waId, current);
      return true;
    },
  };
}

export const failureNoticeThrottle: FailureNoticeThrottle = createFailureNoticeThrottle();
