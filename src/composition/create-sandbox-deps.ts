// Dev-only sandbox composition root (design D33/D37/D40, spec SBX-7): wires
// the memory session store + the four sandbox fakes + the REAL
// createConversationFlowService into one self-contained SandboxComposition.
// Called ONLY from buildApp when the D33 gate passes (sandboxEnabled === true
// && nodeEnv !== "production") — never from worker.ts / server.ts, so the
// production composition is untouched. Synchronous and never throws: no DAO,
// no queue, no HTTP, no Redis — every port is satisfied in-memory.
import type pino from "pino";
import type { ConversationFlowService } from "../services/conversation-flow.js";
import { createConversationFlowService } from "../services/conversation-flow.js";
import { createMemorySessionStore } from "../adapters/memory-session-store.js";
import type { SessionStore } from "../ports/session-store.js";
import type { ReniecPerson } from "../ports/reniec-lookup-client.js";
import type { QuejaPayload } from "../ports/quejas-submission-client.js";
import type { SandboxCaptures } from "../fakes/sandbox-fakes.js";
import {
  createSandboxCapturingSender,
  createSandboxMediaDownloader,
  createSandboxMinsaCatalogClient,
  createSandboxMinsaIdentityClient,
  createSandboxQuejasSubmissionClient,
  createSandboxReniecLookupClient,
} from "../fakes/sandbox-fakes.js";
import type { SandboxCatalogOptions } from "../fakes/sandbox-fakes.js";

/** D37 add-on knobs for a sandbox buildApp composition (dev-only). */
export interface SandboxOptions {
  readonly quejas?: {
    readonly mode: "accepted" | "rejected";
    readonly reference?: string;
    readonly reason?: string;
  };
  readonly reniecTable?: Readonly<Record<string, ReniecPerson>>;
  readonly mediaBytes?: Uint8Array;
  readonly catalog?: SandboxCatalogOptions;
}

export interface SandboxComposition {
  readonly flow: ConversationFlowService;
  readonly sessionStore: SessionStore;
  readonly captures: SandboxCaptures;
  /**
   * Read-only accessor over the fake quejas client's submission log — the
   * route-side assertion seam that proves what the FSM actually submitted
   * (image-message E2E, IMG-2). No route behavior depends on it.
   */
  readonly quejasLog: () => readonly QuejaPayload[];
}

export interface CreateSandboxDepsInput {
  config: { sessionKeySecret: string; sessionTtlSeconds: number };
  logger: pino.Logger;
  options?: SandboxOptions;
}

export function createSandboxDeps(deps: CreateSandboxDepsInput): SandboxComposition {
  const { config, logger, options } = deps;

  const sessionStore = createMemorySessionStore({ logger });
  const { sender, captures } = createSandboxCapturingSender();
  const reniecLookupClient = createSandboxReniecLookupClient(options?.reniecTable);
  const quejas = createSandboxQuejasSubmissionClient(
    options?.quejas ?? { mode: "accepted", reference: "DEV-REF-001" }
  );
  const whatsappMediaDownloader = createSandboxMediaDownloader(options?.mediaBytes);
  const minsaIdentityClient = createSandboxMinsaIdentityClient();
  const minsaCatalogClient = createSandboxMinsaCatalogClient(options?.catalog);

  const flow = createConversationFlowService({
    sessionStore,
    sender,
    reniecLookupClient,
    quejasSubmissionClient: quejas.client,
    whatsappMediaDownloader,
    minsaIdentityClient,
    minsaCatalogClient,
    // SBX-7: undefined is valid per the deps contract (conversation-flow.ts
    // L91) — a future schedule_check effect would throw
    // ScheduledCheckSchedulerNotConfiguredError rather than silently drop
    // the timer (documented dev signal, design §8).
    scheduledCheckScheduler: undefined,
    config,
  });

  return { flow, sessionStore, captures, quejasLog: quejas.submitted };
}