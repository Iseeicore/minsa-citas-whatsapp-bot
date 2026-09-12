import type { IncomingMessage, ServerResponse } from "node:http";
import { buildApp, buildDefaultDeps, type AppDeps } from "./app.js";

// Mirrors app.ts's own reasoning: buildApp() deliberately has no explicit
// FastifyInstance return annotation, because its real return type (narrowed
// by the concrete loggerInstance passed in) is incompatible with the
// generic FastifyInstance<...FastifyBaseLogger> type. Deriving the type from
// buildApp itself, instead of importing FastifyInstance, avoids reintroducing
// that same mismatch here.
type App = Awaited<ReturnType<typeof buildApp>>;

// Module-scope cache: Vercel reuses warm function instances across
// invocations, so this avoids rebuilding the Fastify app (and reconnecting
// to Redis) on every request — only on a cold start. Caches the in-flight
// promise itself, not just its resolved value, so two concurrent cold-start
// requests can't each trigger their own buildApp() call.
let cachedAppPromise: Promise<App> | undefined;

function getApp(deps: AppDeps | undefined): Promise<App> {
  if (!cachedAppPromise) {
    // buildDefaultDeps() opens a real DAO (and, for the redis adapter, a
    // real connection) as a side effect — it must only run on an actual
    // cache miss, never as an eagerly-evaluated default parameter, or every
    // warm invocation would silently open and abandon a redundant connection.
    cachedAppPromise = buildApp(deps ?? buildDefaultDeps()).then(async (app) => {
      await app.ready();
      return app;
    });
  }
  return cachedAppPromise;
}

// Fastify wraps a real Node http.Server internally; emitting a "request"
// event into it routes the request through Fastify's own router exactly as
// if that server had received it directly from the socket. This is the one
// part of this adapter a type-check can't prove — vercel-handler.test.ts
// drives real sockets through it via a genuine http.Server, not app.inject().
export async function handleVercelRequest(
  req: IncomingMessage,
  res: ServerResponse,
  deps?: AppDeps
): Promise<void> {
  const app = await getApp(deps);
  app.server.emit("request", req, res);
}

// Test-only: forces the next handleVercelRequest call to rebuild the app,
// so each test gets an isolated instance instead of sharing cached state
// left over from a previous test.
export function resetVercelHandlerCache(): void {
  cachedAppPromise = undefined;
}
