import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { MalformedPayloadError, QueueUnavailableError } from "./domain/errors.js";

function isFastify4xxError(error: unknown): error is { statusCode: number } {
  const statusCode = (error as { statusCode?: unknown } | null)?.statusCode;
  return typeof statusCode === "number" && statusCode >= 400 && statusCode < 500;
}

// D9: the ONE place that maps an error to an HTTP status code. `instanceof`,
// never a `code` string lookup — ioredis errors already carry
// `code: "ECONNREFUSED"`, and a string table would eventually collide with a
// dependency's own codes. `instanceof` cannot be spoofed by a third-party
// error. Exported so the mapping can be unit-tested directly.
export function statusFor(error: unknown): number {
  if (error instanceof QueueUnavailableError) return 503;
  if (error instanceof MalformedPayloadError) return 400;
  // Fastify's own 4xx framework errors (FST_ERR_CTP_*, validation, etc.)
  // keep their code instead of being forced to 500.
  if (isFastify4xxError(error)) return error.statusCode;
  return 500;
}

type ErrorCode = "service_unavailable" | "malformed_payload" | "internal_error";

function codeFor(error: unknown): ErrorCode {
  if (error instanceof QueueUnavailableError) return "service_unavailable";
  if (error instanceof MalformedPayloadError) return "malformed_payload";
  return "internal_error";
}

// Centralized error handler (D4, extended by D9). Logs full detail
// server-side and returns a generic body to the caller — Meta (the only
// caller) reads status, not body, and requestId is the sole field needed to
// correlate a Meta-side failure back to a log line.
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
  request.log.error({ err: error, reqId: request.id, method: request.method, url: request.url }, "Unhandled route error");

  const statusCode = statusFor(error);

  reply.status(statusCode).send({ error: codeFor(error), requestId: request.id });
};
