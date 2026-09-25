import { logger } from "@/lib/observability/logger";
import type { ExternalService } from "@/lib/observability/types";

export async function timedFetch(
  service: ExternalService,
  operation: string,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const startedAt = Date.now();
  const method = init?.method ?? "GET";
  let path = "";
  try {
    path = new URL(url).pathname;
  } catch {
    path = "(invalid url)";
  }

  try {
    const response = await fetch(url, init);
    logger[response.ok ? "info" : "warn"]("external.http", {
      service,
      operation,
      method,
      path,
      status: response.status,
      durationMs: Date.now() - startedAt,
    });
    return response;
  } catch (error) {
    logger.error("external.http", { service, operation, method, path, status: 0, durationMs: Date.now() - startedAt, error });
    throw error;
  }
}
