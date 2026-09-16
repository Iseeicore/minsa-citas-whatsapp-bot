import { describe, expect, it } from "vitest";
import {
  AppError,
  BusinessRejectionError,
  MalformedPayloadError,
  QueueUnavailableError,
  TransientFailureError,
} from "./errors.js";

// D9: these types carry NO statusCode field on purpose — they must remain
// usable from the non-HTTP worker process (src/worker.ts), which has no
// concept of an HTTP status code. The HTTP mapping lives exclusively in
// src/error-handler.ts's statusFor().
describe("domain errors", () => {
  it("QueueUnavailableError is an AppError and an Error, with no statusCode field", () => {
    const err = new QueueUnavailableError("dao rejected");

    expect(err).toBeInstanceOf(QueueUnavailableError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("QueueUnavailableError");
    expect(err.message).toBe("dao rejected");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("MalformedPayloadError is an AppError and an Error, with no statusCode field", () => {
    const err = new MalformedPayloadError("bad json");

    expect(err).toBeInstanceOf(MalformedPayloadError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("MalformedPayloadError");
    expect(err.message).toBe("bad json");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("preserves the original cause when constructed with { cause }", () => {
    const cause = new Error("ECONNREFUSED");
    const err = new QueueUnavailableError("dao rejected", { cause });

    expect(err.cause).toBe(cause);
  });

  it("QueueUnavailableError and MalformedPayloadError are distinct types — instanceof does not cross-match", () => {
    const queueErr = new QueueUnavailableError("x");
    const payloadErr = new MalformedPayloadError("y");

    expect(queueErr).not.toBeInstanceOf(MalformedPayloadError);
    expect(payloadErr).not.toBeInstanceOf(QueueUnavailableError);
  });

  // D14: pulled forward from PR6 (task 6.1) because meta-whatsapp-sender.ts
  // (PR4) already needs to throw TransientFailureError on a non-2xx/timeout
  // Graph API response — classifyWorkerOutcome() itself (task 6.3) still
  // lands in PR6.
  it("TransientFailureError is an AppError and an Error, with no statusCode field", () => {
    const err = new TransientFailureError("meta graph api unreachable");

    expect(err).toBeInstanceOf(TransientFailureError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("TransientFailureError");
    expect(err.message).toBe("meta graph api unreachable");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("BusinessRejectionError is an AppError and an Error, with no statusCode field", () => {
    const err = new BusinessRejectionError("citizen rejected the flow");

    expect(err).toBeInstanceOf(BusinessRejectionError);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("BusinessRejectionError");
    expect(err.message).toBe("citizen rejected the flow");
    expect((err as unknown as { statusCode?: unknown }).statusCode).toBeUndefined();
  });

  it("TransientFailureError and BusinessRejectionError are distinct types — instanceof does not cross-match", () => {
    const transient = new TransientFailureError("x");
    const business = new BusinessRejectionError("y");

    expect(transient).not.toBeInstanceOf(BusinessRejectionError);
    expect(business).not.toBeInstanceOf(TransientFailureError);
  });
});
