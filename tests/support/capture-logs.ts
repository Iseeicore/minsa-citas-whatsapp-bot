import { onTestFinished } from "vitest";
import { configureLogger } from "@/lib/observability/logger";

export function captureLogs(): Array<Record<string, unknown>> {
  const lines: Array<Record<string, unknown>> = [];
  const restore = configureLogger({ sink: (_level, line) => lines.push(JSON.parse(line)), level: "info" });
  onTestFinished(restore);
  return lines;
}
