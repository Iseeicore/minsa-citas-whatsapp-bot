import { SECOND_MS } from "@/lib/constants/limits/time-units";

export function toUnixSeconds(instant: Date | number): number {
  const ms = instant instanceof Date ? instant.getTime() : instant;
  return Math.floor(ms / SECOND_MS);
}

export function fromUnixSeconds(value: number | string): Date {
  return new Date(Number(value) * SECOND_MS);
}
