import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Banner } from "@/app/components/ui/Banner";
import { BannerTone } from "@/lib/enums/banner-tone";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";
import { textoMuyLargoText } from "@/lib/constants/textos/sandbox";

const captured = vi.hoisted(() => ({ onTooLong: undefined as (() => void) | undefined, stateUpdates: [] as unknown[] }));

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
  Composer: (props: { onTooLong: () => void }) => {
    captured.onTooLong = props.onTooLong;
    return null;
  },
}));

import Sandbox from "@/app/components/Sandbox";

const TOO_LONG_TEXT = "No podemos procesar tu mensaje: reduce la cantidad de caracteres (máximo 1000).";

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
});
