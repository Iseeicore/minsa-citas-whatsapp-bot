import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";

// Centralized error handler (D4). Logs full detail server-side and returns
// a generic body to the caller — Meta (the only caller) reads status, not
// body, and requestId is the sole field needed to correlate a Meta-side
// failure back to a log line. A 4xx statusCode set by Fastify or a route
// (e.g. its own body-parse error) is preserved; anything else becomes 500.
export const errorHandler = (error: FastifyError, request: FastifyRequest, reply: FastifyReply): void => {
  request.log.error({ err: error, reqId: request.id, method: request.method, url: request.url }, "Unhandled route error");

  const statusCode = error.statusCode && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 500;

  reply.status(statusCode).send({ error: "internal_error", requestId: request.id });
};
