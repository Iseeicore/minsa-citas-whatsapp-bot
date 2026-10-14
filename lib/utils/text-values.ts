import { COMBINING_ACCENT_MARKS } from "@/lib/constants/regex/text";

export function toText(value: unknown): string {
  return String(value ?? "");
}

export function stringOr(value: unknown, fallback: string = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(COMBINING_ACCENT_MARKS, "");
}
