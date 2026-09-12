import pino from "pino";

// D7 defense-in-depth net — NOT the control (the logging DTO,
// src/domain/inbound-conversation-event-log-view.ts, is the control). This
// exists so a future `logger.info({ event }, msg)` written by someone who
// has not read the design still cannot emit an MSISDN or message body.
// Known limits, recorded rather than hidden: pino redact paths do not
// traverse arbitrary depth or arrays, and it has a measurable per-log cost.
const REDACT_OPTIONS: pino.LoggerOptions = {
  redact: {
    paths: ["from", "text", "contactName", "raw", "*.from", "*.text", "*.contactName", "*.raw"],
    remove: true,
  },
};

// Standalone pino root — must not import server.ts, config.ts, or any other
// app module. Anything that needs to log at module-load time (config.ts,
// conversation-event-dao.ts) as well as server.ts's request-scoped logging
// depend on this file; it must depend on nothing but pino itself.
export function createLogger(destination?: pino.DestinationStream): pino.Logger {
  return destination ? pino(REDACT_OPTIONS, destination) : pino(REDACT_OPTIONS);
}

export const logger = createLogger();
