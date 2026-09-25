import { logger } from "@/lib/observability/logger";
import type { ExternalService } from "@/lib/observability/types";

// fetch, plus one log line per call with what an outside service is worth
// knowing for: which service and operation, the HTTP status and how long it took.
// Only the path is logged — never the query string (it can carry identifiers or
// secrets) and never a body.
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
