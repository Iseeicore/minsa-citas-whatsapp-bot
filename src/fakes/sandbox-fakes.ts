// Dev-only sandbox fakes (design D40, spec SBX-2..SBX-5): hand-written fakes
// for the four driven ports composed by the sandbox route. Promoted to runtime
// (instead of living only inside test files) because the dev sandbox composes
// them at runtime — the shape mirrors conversation-flow.test.ts's in-file
// fakes (L60-146), which is why there is no `fetch`, no I/O, and no logger
// anywhere in this module. All factories are pure closures: each call owns its
// own state (D4 discipline), so concurrent sandbox sessions never share state.
//
// Structural typing only — these implement the EXISTING port interfaces
// (src/ports/*), never new ones: WhatsappOutboundSender, ReniecLookupClient,
// QuejasSubmissionClient, WhatsappMediaDownloader.
import type { ButtonMessage, InteractiveList, WhatsappOutboundSender } from "../ports/whatsapp-outbound-sender.js";
import type { ReniecLookupClient, ReniecLookupResult, ReniecPerson } from "../ports/reniec-lookup-client.js";
import type { QuejaPayload, QuejasSubmissionClient, QuejaSubmissionResult } from "../ports/quejas-submission-client.js";
import type { DownloadedMedia, WhatsappMediaDownloader } from "../ports/whatsapp-media-downloader.js";

/** One outbound message recorded by the sandbox capturing sender (D36). */
export type SandboxCapturedSend =
  | { readonly kind: "text"; readonly to: string; readonly body: string }
  | { readonly kind: "interactive_list"; readonly to: string; readonly list: InteractiveList }
  | { readonly kind: "buttons"; readonly to: string; readonly buttons: ButtonMessage };

/**
 * Per-recipient capture drain (D36): `drain(from)` returns a snapshot of that
 * recipient's sends in exact emission order and removes them from the buffer,
 * so each sandbox request sees exactly its own turn's sends. Sends to other
 * recipients are untouched and survive.
 */
export interface SandboxCaptures {
  drain(from: string): readonly SandboxCapturedSend[];
}

/** D40 / SBX-2: fake WhatsappOutboundSender that records every send into one ordered buffer. */
export function createSandboxCapturingSender(): {
  sender: WhatsappOutboundSender;
  captures: SandboxCaptures;
} {
  const buffer: SandboxCapturedSend[] = [];

  const sender: WhatsappOutboundSender = {
    async sendText(to: string, body: string) {
      buffer.push({ kind: "text", to, body });
    },
    async sendInteractiveList(to: string, list: InteractiveList) {
      buffer.push({ kind: "interactive_list", to, list });
    },
    async sendButtons(to: string, buttons: ButtonMessage) {
      buffer.push({ kind: "buttons", to, buttons });
    },
  };

  const captures: SandboxCaptures = {
    drain(from: string): readonly SandboxCapturedSend[] {
      const snapshot = buffer.filter((send) => send.to === from);
      // Remove every captured send for `from`; `snapshot` keeps the snapshot
      // semantics the route contract needs (filter is stable → emission order).
      for (let i = buffer.length - 1; i >= 0; i--) {
        if (buffer[i].to === from) buffer.splice(i, 1);
      }
      return snapshot;
    },
  };

  return { sender, captures };
}

/** D40 / SBX-3: fixed DNI → ReniecPerson table for known citizens. */
const SANDBOX_DEFAULT_RENIEC_TABLE: Readonly<Record<string, ReniecPerson>> = {
  "12345678": { nombres: "JUAN CARLOS", apellidoPaterno: "QUISPE", apellidoMaterno: "PEREZ" },
};

/**
 * D40 / SBX-3: fake ReniecLookupClient backed by a lookup table. Unknown DNI →
 * `{ status: "not_found" }`. An override table REPLACES the default table
 * entirely (no merging), so sandbox tests control exactly what is resolvable.
 * Zero network — no RENIEC call ever happens.
 */
export function createSandboxReniecLookupClient(table?: Readonly<Record<string, ReniecPerson>>): ReniecLookupClient {
  const lookupTable = table ?? SANDBOX_DEFAULT_RENIEC_TABLE;

  return {
    async lookup(dni: string): Promise<ReniecLookupResult> {
      const person = lookupTable[dni];
      return person === undefined ? { status: "not_found" } : { status: "found", ...person };
    },
  };
}

/** D40 / SBX-4: configuration for the fake quejas submission client. */
export interface SandboxQuejasOptions {
  readonly mode: "accepted" | "rejected";
  readonly reference?: string;
  readonly reason?: string;
}

/**
 * D40 / SBX-4: fake QuejasSubmissionClient configurable per call site.
 *
 * Accepted mode returns `{ status: "accepted", reference }` when a reference
 * is configured (omitted otherwise, per the port's optional field). Rejected
 * mode returns `{ status: "rejected", reason }` — the release notes omit a
 * real fallback because the composition root (T4) always supplies a reason on
 * the rejected path; `"sandbox_rejected"` is a documented synthetic default so
 * the port's non-optional `reason: string` contract can never be violated.
 *
 * `submitted()` is the read-only log seam the route tests use to prove what
 * the FSM actually submitted (image-message E2E, IMG-2). Zero network.
 */
export function createSandboxQuejasSubmissionClient(opts: SandboxQuejasOptions): {
  client: QuejasSubmissionClient;
  submitted(): readonly QuejaPayload[];
} {
  const log: QuejaPayload[] = [];

  const result: QuejaSubmissionResult =
    opts.mode === "accepted"
      ? { status: "accepted", ...(opts.reference !== undefined ? { reference: opts.reference } : {}) }
      : { status: "rejected", reason: opts.reason ?? "sandbox_rejected" };

  const client: QuejasSubmissionClient = {
    async submit(payload: QuejaPayload): Promise<QuejaSubmissionResult> {
      log.push(payload);
      return result;
    },
  };

  return {
    client,
    submitted(): readonly QuejaPayload[] {
      return log;
    },
  };
}

/**
 * D40 / SBX-5: fake WhatsappMediaDownloader returning synthetic bytes with no
 * HTTP call. Defaults to `Uint8Array([1, 2, 3])` with `mimeType: "image/png"`
 * and a `sizeBytes` always matched to the byte length — safe for
 * encodeImagenField, which accepts any byte buffer.
 */
export function createSandboxMediaDownloader(bytes?: Uint8Array): WhatsappMediaDownloader {
  const syntheticBytes = bytes ?? new Uint8Array([1, 2, 3]);

  return {
    async download(_mediaId: string): Promise<DownloadedMedia> {
      return { bytes: syntheticBytes, mimeType: "image/png", sizeBytes: syntheticBytes.length };
    },
  };
}