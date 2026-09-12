import type { IncomingMessage, ServerResponse } from "node:http";
import { handleVercelRequest } from "../src/vercel-handler.js";

// Thin Vercel entrypoint — vercel.json rewrites every path to this one
// function so the same Fastify router that already owns /health and
// /webhook/whatsapp keeps owning them here, instead of duplicating routing
// under Vercel's own /api/* convention. All real logic lives in
// src/vercel-handler.ts, which is what vercel-handler.test.ts exercises.
export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await handleVercelRequest(req, res);
}
