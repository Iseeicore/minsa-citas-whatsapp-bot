import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { API_ERRORS } from "@/lib/http/api-error";
import { ApiErrorCode } from "@/lib/enums/api-error-code";

const captured = vi.hoisted(() => ({
  onTooLong: undefined as (() => void) | undefined,
  handleImageSelect: undefined as ((fileList: FileList | null) => Promise<void> | void) | undefined,
  readFileAsDataUri: vi.fn(() => new Promise<string>(() => {})),
  stateUpdates: [] as unknown[],
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      const [value, setValue] = actual.useState(initial);
      return [
        value,
        (next: unknown) => {
          captured.stateUpdates.push(next);
          setValue(next);
        },
      ];
    },
  };
});

vi.mock("@/app/components/sandbox-chat/Composer", () => ({
  Composer: (props: { onTooLong: () => void; handleImageSelect: (fileList: FileList | null) => Promise<void> | void }) => {
    captured.onTooLong = props.onTooLong;
    captured.handleImageSelect = props.handleImageSelect;
    return null;
  },
}));

vi.mock("@/app/components/sandbox-chat/browser", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/components/sandbox-chat/browser")>();
  return { ...actual, readFileAsDataUri: captured.readFileAsDataUri };
});

import Sandbox from "@/app/components/Sandbox";

const TOO_LONG_TEXT = API_ERRORS[ApiErrorCode.TEXT_TOO_LONG].message;
const IMAGE_TOO_LARGE_TEXT = "La imagen supera el tamaño máximo permitido (5 MB). Envía una imagen más liviana.";
const MEGABYTE = 1024 * 1024;
const IMAGE_MAX_BYTES = getEvidenceImageMaxBytes({});

function imageFileList(size: number): FileList {
  return [{ name: "foto.jpg", size }] as unknown as FileList;
}

function renderSandbox(imageMaxBytes = IMAGE_MAX_BYTES): void {
  renderToStaticMarkup(createElement(Sandbox, { imageMaxBytes, showDebugPanel: false, active: false }));
}

beforeEach(() => {
  captured.stateUpdates.length = 0;
  captured.readFileAsDataUri.mockClear();
});

describe("Sandbox", () => {
  it("shows the same over-limit warning as the API when the composer reports a message too long", () => {
    renderSandbox();

    captured.onTooLong?.();

    expect(captured.stateUpdates).toContain(TOO_LONG_TEXT);
  });

  it.each([
    ["checks the image against the limit the server passes, not a value of its own", 3 * MEGABYTE, 4 * MEGABYTE, "La imagen supera el tamaño máximo permitido (3 MB). Envía una imagen más liviana."],
    ["rejects an image over the limit with the size warning and does not read it", IMAGE_MAX_BYTES, IMAGE_MAX_BYTES + 1, IMAGE_TOO_LARGE_TEXT],
  ])("%s", async (_case, imageMaxBytes, size, warning) => {
    renderSandbox(imageMaxBytes);

    await captured.handleImageSelect?.(imageFileList(size));

    expect(captured.stateUpdates).toContain(warning);
    expect(captured.readFileAsDataUri).not.toHaveBeenCalled();
  });

  it("accepts an image between 3 MB and 5 MB", () => {
    renderSandbox();

    void captured.handleImageSelect?.(imageFileList(4 * MEGABYTE));

    expect(captured.stateUpdates).not.toContain(IMAGE_TOO_LARGE_TEXT);
    expect(captured.readFileAsDataUri).toHaveBeenCalledTimes(1);
  });
});
