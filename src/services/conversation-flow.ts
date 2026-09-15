import type { SessionStore } from "../ports/session-store.js";
import type { WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupClient } from "../ports/reniec-lookup-client.js";
import type { QuejaPayload, QuejasSubmissionClient } from "../ports/quejas-submission-client.js";
import type { WhatsappMediaDownloader } from "../ports/whatsapp-media-downloader.js";
import type { FsmEffect, FsmQueryEffect, FsmSendEffect, FsmSystemEvent } from "../domain/conversation-fsm.js";
import { handle } from "../domain/conversation-fsm.js";
import type { ConversationSession } from "../domain/conversation-session.js";
import { createSession } from "../domain/conversation-session.js";
import { FsmContractViolationError, MediaTooLargeError } from "../domain/errors.js";
import { encodeImagenField } from "../domain/quejas-imagen-encoding.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";

export interface ConversationFlowService {
  /**
   * Loads/creates the session, runs the pure FSM, executes its effects
   * (including at most one bounded query-effect re-entry, D20), and
   * persists the result. Rejects when any I/O step fails (SessionStore,
   * WhatsappOutboundSender, or a query port) — the caller (worker.ts)
   * classifies that rejection via classifyWorkerOutcome().
   */
  process(event: InboundConversationEvent): Promise<void>;
}

export interface ConversationFlowServiceDeps {
  sessionStore: SessionStore;
  sender: WhatsappOutboundSender;
  /** D20: the sole executor of the `reniec_lookup` query effect — handle() never performs I/O itself. */
  reniecLookupClient: ReniecLookupClient;
  /**
   * D20: the sole executor of the `quejas_submit` query effect. REQUIRED as
   * of Phase 7 — worker.ts always constructs and injects the real
   * `HttpQuejasSubmissionClient` (D21 gate cleared for code + fake-only
   * testing per explicit instruction; real-endpoint validation is still
   * pending, see http-quejas-submission-client.ts's loud comment).
   */
  quejasSubmissionClient: QuejasSubmissionClient;
  /**
   * D21/Phase 7: downloads the citizen's photo (by mediaId) before it is
   * base64-encoded (`encodeImagenField`) into the `quejas_submit` payload's
   * `imagen` field. REQUIRED alongside quejasSubmissionClient — both are
   * always present together in production.
   */
  whatsappMediaDownloader: WhatsappMediaDownloader;
  config: {
    /** D19: keys the D17 MSISDN digest used as the session lookup key. */
    sessionKeySecret: string;
    sessionTtlSeconds: number;
  };
}

/** True for a query effect (D20) — false for a plain WhatsApp-send effect. */
function isQueryEffect(effect: FsmEffect): effect is FsmQueryEffect {
  return effect.kind === "reniec_lookup" || effect.kind === "quejas_submit";
}

// D28: a POSITIVE enumeration of the four known send-effect kinds — NEVER
// `!isQueryEffect(effect)`. That negation was a latent bug: with only two
// effect families (send, query) it happened to agree with the positive
// form, but it would silently misclassify any future third effect category
// (e.g. Stage C1's `FsmScheduleEffect`, D28) as sendable and hand it to
// executeEffect(), which has no case for it. Enumerating the kinds directly
// makes a future new category fail loudly (returns false here, and
// executeEffect's exhaustive switch fails to compile) instead of being
// silently routed as a send. Exported (same precedent as soleQueryEffect
// and assertReentryEmittedNoQueryEffect above) so this is directly
// unit-testable without contriving FSM behavior.
export function isSendEffect(effect: FsmEffect): effect is FsmSendEffect {
  return (
    effect.kind === "send_text" ||
    effect.kind === "send_interactive_list" ||
    effect.kind === "send_buttons" ||
    effect.kind === "end_session"
  );
}

function executeEffect(sender: WhatsappOutboundSender, effect: FsmSendEffect): Promise<void> {
  switch (effect.kind) {
    case "send_text":
      return sender.sendText(effect.to, effect.body);
    case "send_interactive_list":
      return sender.sendInteractiveList(effect.to, {
        body: effect.body,
        header: effect.header,
        footer: effect.footer,
        buttonLabel: effect.buttonLabel,
        sections: effect.sections,
      });
    case "send_buttons":
      return sender.sendButtons(effect.to, { body: effect.body, buttons: effect.buttons });
    case "end_session":
      // Stage A defines no dedicated closing message — a future stage may
      // extend this case with real send behavior.
      return Promise.resolve();
  }
}

/** Executes every send effect, in order. Returns how many were sent (feeds the messagesSent counter). */
async function runSendEffects(sender: WhatsappOutboundSender, effects: readonly FsmEffect[]): Promise<number> {
  const sendEffects = effects.filter(isSendEffect);
  for (const effect of sendEffects) {
    await executeEffect(sender, effect);
  }
  return sendEffects.length;
}

// D20: a turn may emit at most ONE query effect. More than one is a
// deterministic FSM bug, not a citizen-triggerable condition — surfaced as
// FsmContractViolationError so BullMQ dead-letters it instead of retrying (or
// this function silently choosing one and dropping the rest).
// Exported (alongside assertReentryEmittedNoQueryEffect below) so the D20
// contract-violation paths are directly unit-testable as pure functions —
// today's real FSM never emits >1 query effect in Phase 4's scope, so these
// two paths would otherwise be untestable without contriving FSM behavior.
export function soleQueryEffect(effects: readonly FsmEffect[]): FsmQueryEffect | undefined {
  const queryEffects = effects.filter(isQueryEffect);
  if (queryEffects.length > 1) {
    throw new FsmContractViolationError(
      `[conversation-flow] FSM turn emitted ${queryEffects.length} query effects in one pass; D20 allows at most 1.`
    );
  }
  return queryEffects[0];
}

// D20: the bounded re-entry is exactly ONE pass. A query effect coming out
// of the re-entered handle() call means the FSM tried to chain re-entries,
// which this contract structurally forbids — never silently ignored.
export function assertReentryEmittedNoQueryEffect(effects: readonly FsmEffect[]): void {
  const found = effects.find(isQueryEffect);
  if (found !== undefined) {
    throw new FsmContractViolationError(
      `[conversation-flow] Reclamo re-entry (D20) emitted another query effect ("${found.kind}") — bounded re-entry never chains.`
    );
  }
}

// D20: the ONLY I/O re-entry point. Executes a query effect against its
// matching port and synthesizes the FsmSystemEvent handle() re-enters with.
// `from` is copied from the triggering InboundConversationEvent (D17
// discipline carried forward) — never from `session.slots`.
async function runQueryEffect(
  clients: {
    reniecLookupClient: ReniecLookupClient;
    quejasSubmissionClient: QuejasSubmissionClient;
    whatsappMediaDownloader: WhatsappMediaDownloader;
  },
  effect: FsmQueryEffect,
  triggeringEvent: InboundConversationEvent
): Promise<FsmSystemEvent> {
  switch (effect.kind) {
    case "reniec_lookup": {
      const result = await clients.reniecLookupClient.lookup(effect.dni);
      return { source: "system", from: triggeringEvent.from, kind: "reniec_lookup_result", result };
    }
    case "quejas_submit": {
      const { submission } = effect;

      // D21: the media-download + base64-encode pipeline only runs when a
      // photo was actually captured (mediaId !== null) — the OMITIR path
      // never touches WhatsappMediaDownloader and submits imagen: null.
      let imagen: string | null = null;
      if (submission.mediaId !== null) {
        try {
          const media = await clients.whatsappMediaDownloader.download(submission.mediaId);
          imagen = encodeImagenField(media);
        } catch (err) {
          // D21: MediaTooLargeError is caught HERE, inside the quejas_submit
          // executor, and converted into the same "rejected" business result
          // shape a real quejas 4xx would produce (D24) — the FSM, not the
          // adapter, owns the citizen-facing wording. quejasSubmissionClient
          // is deliberately never called in this branch: an oversized file
          // never reaches the quejas API. Any other error (TransientFailureError,
          // network/timeout on either Graph API hop) propagates unchanged —
          // BullMQ retries the whole turn, same as reniec_lookup's failure path.
          if (err instanceof MediaTooLargeError) {
            return {
              source: "system",
              from: triggeringEvent.from,
              kind: "quejas_submit_result",
              result: { status: "rejected", reason: "media_too_large" },
            };
          }
          throw err;
        }
      }

      const payload: QuejaPayload = {
        dni: submission.dni,
        nombre_completo: submission.nombreCompleto,
        celular: submission.celular,
        queja: submission.queja,
        imagen,
      };
      const result = await clients.quejasSubmissionClient.submit(payload);
      return { source: "system", from: triggeringEvent.from, kind: "quejas_submit_result", result };
    }
  }
}

// D11/D13 (design revision 2): the sole I/O executor for the conversation
// domain, mirroring webhook-ingestion.ts's role in its own domain — the FSM
// (conversation-fsm.ts) stays pure and zero-I/O; every load, send, query,
// and persist happens here.
//
// Counters live HERE, not in the FSM, per the design's Data Flow section:
// messagesReceived on load, messagesSent after each successful send effect
// (across BOTH passes when a re-entry happens — D20). invalidAttempts is the
// FSM's own responsibility (already applied inside handle()) and is carried
// through unchanged.
//
// Ordering matters: session persistence happens AFTER effects execute (and
// after any query-effect re-entry completes), so a send/query failure is
// retried against the unchanged prior state (the caught error propagates
// before sessionStore.save() is ever reached) — *_pending states are never
// persisted, exactly per D20's "Persistence and retry semantics".
//
// `outcome: "rejected"` needs no special branch here: this function always
// persists the FSM's returned session and resolves, whatever "outcome" the
// (possibly re-entered) turn produced.
//
// D20 bounded re-entry: straight-line code, no loop, no counter. `handle()`
// runs once; if (and only if) it asked for a query effect, that effect is
// executed and `handle()` runs exactly one more time with the synthesized
// result. A second query effect at either point is a contract violation
// (soleQueryEffect / assertReentryEmittedNoQueryEffect above) — thrown, never
// silently absorbed, making a THIRD handle() call structurally impossible.
export function createConversationFlowService(deps: ConversationFlowServiceDeps): ConversationFlowService {
  const { sessionStore, sender, reniecLookupClient, quejasSubmissionClient, whatsappMediaDownloader, config } = deps;

  return {
    async process(event: InboundConversationEvent): Promise<void> {
      const sessionKey = msisdnDigest(event.from ?? "", config.sessionKeySecret);
      const existing = await sessionStore.load(sessionKey);
      const loaded: ConversationSession = existing ?? createSession(sessionKey, config.sessionTtlSeconds);

      const received: ConversationSession = {
        ...loaded,
        counters: { ...loaded.counters, messagesReceived: loaded.counters.messagesReceived + 1 },
      };

      const first = handle(received, event);
      let messagesSent = await runSendEffects(sender, first.effects);

      const query = soleQueryEffect(first.effects);
      let finalResult = first;

      if (query !== undefined) {
        const systemEvent = await runQueryEffect(
          { reniecLookupClient, quejasSubmissionClient, whatsappMediaDownloader },
          query,
          event
        );
        const second = handle(first.session, systemEvent);
        messagesSent += await runSendEffects(sender, second.effects);
        assertReentryEmittedNoQueryEffect(second.effects);
        finalResult = second;
      }

      const persisted: ConversationSession = {
        ...finalResult.session,
        counters: {
          ...finalResult.session.counters,
          messagesSent: finalResult.session.counters.messagesSent + messagesSent,
        },
      };

      await sessionStore.save(persisted);
    },
  };
}
