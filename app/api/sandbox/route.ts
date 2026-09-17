import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { runTurn } from "@/lib/fsm/executor";
import { resetSession } from "@/lib/fsm/session-store";

const sandboxEventSchema = z.object({
  from: z.string().min(1),
  type: z.enum(["text", "button", "list", "image"]),
  text: z.string().optional(),
  listId: z.string().optional(),
  mediaId: z.string().optional(),
  reset: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // Gated off by default — this app has no auth of its own, so anyone who
  // finds the public URL would otherwise reach the sandbox (and, with the
  // real-integration flags on, real MINSA/RENIEC/quejas calls).
  if (process.env.SANDBOX_ENABLED !== "true") {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await request.json();
  const parsed = sandboxEventSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "INVALID_BODY", message: parsed.error.message },
      { status: 400 },
    );
  }

  const { from, type, text, listId, mediaId, reset } = parsed.data;

  if (reset) {
    await resetSession(from);
  }

  const { sent, session } = await runTurn(from, { from, type, text, listId, mediaId });

  return NextResponse.json({
    sent,
    session: { state: session.state, slots: session.slots, counters: session.counters },
  });
}
