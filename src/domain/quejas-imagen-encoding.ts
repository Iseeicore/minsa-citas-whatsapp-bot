import type { DownloadedMedia } from "../ports/whatsapp-media-downloader.js";

// D21: ALL uncertainty about the quejas API's accepted `imagen` wire format
// is deliberately isolated behind this one pure function, per design's
// explicit rationale — an unvalidated third-party contract should occupy
// exactly one function and one unit test, so a spike result of "bare
// base64", "data URI", or "multipart" costs one file, not a cross-cutting
// change.
//
// ****************************************************************
// FLAGGED ASSUMPTION — UNVALIDATED, deferred by explicit user instruction
// (not resolved): this data-URI/base64 encoding has NEVER been confirmed
// against the real quejas endpoint (design's own "HARD PRE-APPLY GATE").
// Per the orchestrator's explicit direction, this PR implements and
// unit-tests the D21-assumed shape against FAKES only — no call to the real
// quejas endpoint occurs anywhere in this codebase yet. Before this code is
// wired into production traffic (Phase 7), base64 acceptance MUST be
// confirmed either by a real test call that verifies a retrievable image, or
// by the API owner's written statement naming the accepted encoding. Until
// then, treat this function's output shape as a guess, not a contract.
// ****************************************************************
export function encodeImagenField(media: DownloadedMedia): string {
  const base64 = Buffer.from(media.bytes).toString("base64");
  return `data:${media.mimeType};base64,${base64}`;
}
