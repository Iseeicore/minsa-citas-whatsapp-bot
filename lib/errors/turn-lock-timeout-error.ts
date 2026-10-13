import type { TurnLockLayer } from "@/lib/enums/turn-lock-layer";

export class TurnLockTimeoutError extends Error {
  constructor(
    readonly waId: string,
    readonly layer: TurnLockLayer,
  ) {
    super(`Timed out waiting for the ${layer} turn lock of ${waId}`);
    this.name = "TurnLockTimeoutError";
  }
}
