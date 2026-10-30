import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const widget = vi.hoisted(() => ({ attribute: "data-chat-widget" }));

vi.mock("@/app/components/SandboxWidgetDemo", async () => {
  const { createElement } = await import("react");
  return {
    default: ({ children }: { children: unknown }) => createElement("div", { [widget.attribute]: "" }, children as never),
  };
});

import Home from "@/app/page";
import { OPEN_CHAT_ATTRIBUTE, OPEN_CHAT_HREF } from "@/lib/constants/chat-launcher";
import { getLoginUrl } from "@/lib/integrations/minsa/wire";

const LANDING_SERVICE_TEXT = "Programa tu cita presencial";

beforeEach(() => {
  vi.stubEnv("MINSA_DIGITAL_APP_URL", "https://minsa.test");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the home page", () => {
  it("shows the landing with the chat widget when the Chat-bot is on", () => {
    vi.stubEnv("SANDBOX_ENABLED", "true");

    const markup = renderToStaticMarkup(Home());

    expect(markup).toContain(LANDING_SERVICE_TEXT);
    expect(markup).toContain(widget.attribute);
    expect(markup).toContain(OPEN_CHAT_ATTRIBUTE);
  });

  it.each([undefined, "false"])("shows only the landing, with no dead chat link, when SANDBOX_ENABLED is %j", (value) => {
    vi.stubEnv("SANDBOX_ENABLED", value);

    const markup = renderToStaticMarkup(Home());

    expect(markup).toContain(LANDING_SERVICE_TEXT);
    expect(markup).not.toContain(widget.attribute);
    expect(markup).not.toContain(OPEN_CHAT_ATTRIBUTE);
    expect(markup).not.toContain(`href="${OPEN_CHAT_HREF}"`);
    expect(markup).toContain(`href="${getLoginUrl()}"`);
  });
});

describe("the landing without MINSA_DIGITAL_APP_URL", () => {
  it("renders no fake '#' link to the MINSA Digital login", () => {
    vi.stubEnv("MINSA_DIGITAL_APP_URL", "");

    const markup = renderToStaticMarkup(Home());

    expect(markup).toContain(LANDING_SERVICE_TEXT);
    expect(markup).not.toMatch(/<a href="#"[^>]*>(Ingresar|Citas en línea|Servicios)/);
  });
});
