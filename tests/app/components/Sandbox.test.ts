import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "@/app/components/ui/Banner";
import { BannerTone } from "@/lib/enums/banner-tone";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { imagenMuyPesadaText, textoMuyLargoText } from "@/lib/constants/textos/sandbox";
import { MAX_IMAGE_BYTES } from "@/lib/recepcion/imagenes/data-uri";
import { bytesToMegabytes } from "@/lib/utils/byte-size";

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

const TOO_LONG_TEXT = "No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000).";
const IMAGE_TOO_LARGE_TEXT = "La imagen supera el tamaño máximo permitido (5 MB). Envía una imagen más liviana.";
const MEGABYTE = 1024 * 1024;

function imageFileList(size: number): FileList {
  return [{ name: "foto.jpg", size }] as unknown as FileList;
}

describe("Sandbox", () => {
  it("shows the over-limit warning in the error banner when the composer reports a message too long", () => {
    renderToStaticMarkup(createElement(Sandbox, { showDebugPanel: false, active: false }));

    captured.onTooLong?.();

    expect(captured.stateUpdates).toContain(TOO_LONG_TEXT);
    expect(renderToStaticMarkup(Banner({ tone: BannerTone.ERROR, children: TOO_LONG_TEXT }))).toContain(TOO_LONG_TEXT);
  });

  it("builds the warning from the shared limit", () => {
    expect(textoMuyLargoText(SANDBOX_TEXT_MAX_LENGTH)).toBe(TOO_LONG_TEXT);
  });

  it("uses the same 5 MB image limit as the WhatsApp channel", () => {
    expect(MAX_IMAGE_BYTES).toBe(5 * MEGABYTE);
    expect(imagenMuyPesadaText(bytesToMegabytes(MAX_IMAGE_BYTES))).toBe(IMAGE_TOO_LARGE_TEXT);
  });

  it("rejects an image over the limit with the size warning and does not read it", async () => {
    captured.stateUpdates.length = 0;
    captured.readFileAsDataUri.mockClear();
    renderToStaticMarkup(createElement(Sandbox, { showDebugPanel: false, active: false }));

    await captured.handleImageSelect?.(imageFileList(MAX_IMAGE_BYTES + 1));

    expect(captured.stateUpdates).toContain(IMAGE_TOO_LARGE_TEXT);
    expect(captured.readFileAsDataUri).not.toHaveBeenCalled();
  });

  it("accepts an image between 3 MB and 5 MB", () => {
    captured.stateUpdates.length = 0;
    captured.readFileAsDataUri.mockClear();
    renderToStaticMarkup(createElement(Sandbox, { showDebugPanel: false, active: false }));

    void captured.handleImageSelect?.(imageFileList(4 * MEGABYTE));

    expect(captured.stateUpdates).not.toContain(IMAGE_TOO_LARGE_TEXT);
    expect(captured.readFileAsDataUri).toHaveBeenCalledTimes(1);
  });
});
