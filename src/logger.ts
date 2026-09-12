import pino from "pino";

// Standalone pino root — must not import server.ts, config.ts, or any other
// app module. Anything that needs to log at module-load time (config.ts,
// conversation-event-dao.ts) as well as server.ts's request-scoped logging
// depend on this file; it must depend on nothing but pino itself.
export function createLogger(destination?: pino.DestinationStream): pino.Logger {
  return destination ? pino(destination) : pino();
}

export const logger = createLogger();
