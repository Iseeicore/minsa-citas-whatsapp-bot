import type { SessionStore } from "../ports/session-store.js";
import type { WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import type { FsmEffect } from "../domain/conversation-fsm.js";
import { handle } from "../domain/conversation-fsm.js";
import type { ConversationSession } from "../domain/conversation-session.js";
import { createSession } from "../domain/conversation-session.js";
import type { InboundConversationEvent } from "../domain/inbound-conversation-event.js";
import { msisdnDigest } from "../domain/msisdn-fingerprint.js";

export interface ConversationFlowService {
  /**
   * Loads/creates the session, runs the pure FSM, executes its effects, and
   * persists the result. Rejects when any I/O step fails (SessionStore or
   * WhatsappOutboundSender) — the caller (worker.ts) classifies that
   * rejection via classifyWorkerOutcome().
   */
  process(event: InboundConversationEvent): Promise<void>;
}

export interface ConversationFlowServiceDeps {
  sessionStore: SessionStore;
  sender: WhatsappOutboundSender;
  config: {
    /** D19: keys the D17 MSISDN digest used as the session lookup key. */
    sessionKeySecret: string;
    sessionTtlSeconds: number;
  };
}

function executeEffect(sender: WhatsappOutboundSender, effect: FsmEffect): Promise<void> {
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

// D11/D13 (design revision 2): the sole I/O executor for the conversation
// domain, mirroring webhook-ingestion.ts's role in its own domain — the FSM
// (conversation-fsm.ts) stays pure and zero-I/O; every load, send, and
// persist happens here.
//
// Counters live HERE, not in the FSM, per the design's Data Flow section:
// messagesReceived on load, messagesSent after each successful send effect.
// invalidAttempts is the FSM's own responsibility (already applied inside
// handle()) and is carried through unchanged.
//
// Ordering matters: session persistence happens AFTER effects execute, so a
// send failure is retried against the unchanged prior state (the caught
// error propagates before sessionStore.save() is ever reached).
//
// `outcome: "rejected"` (Stage A's main_menu never produces it — see
// conversation-fsm.ts) needs no special branch here: this function always
// persists the FSM's returned session and resolves, whether the FSM turn
// was "continue" or a future state's "rejected". The two only differ in
// what a FUTURE state handler puts in the session, not in this loop's
// control flow.
export function createConversationFlowService(deps: ConversationFlowServiceDeps): ConversationFlowService {
  const { sessionStore, sender, config } = deps;

  return {
    async process(event: InboundConversationEvent): Promise<void> {
      const sessionKey = msisdnDigest(event.from ?? "", config.sessionKeySecret);
      const existing = await sessionStore.load(sessionKey);
      const loaded: ConversationSession = existing ?? createSession(sessionKey, config.sessionTtlSeconds);

      const received: ConversationSession = {
        ...loaded,
        counters: { ...loaded.counters, messagesReceived: loaded.counters.messagesReceived + 1 },
      };

      const result = handle(received, event);

      for (const effect of result.effects) {
        await executeEffect(sender, effect);
      }

      const persisted: ConversationSession = {
        ...result.session,
        counters: {
          ...result.session.counters,
          messagesSent: result.session.counters.messagesSent + result.effects.length,
        },
      };

      await sessionStore.save(persisted);
    },
  };
}
