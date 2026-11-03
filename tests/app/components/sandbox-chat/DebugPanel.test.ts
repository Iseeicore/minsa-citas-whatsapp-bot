import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DebugPanel } from "@/app/components/sandbox-chat/DebugPanel";
import type { SandboxSessionView } from "@/lib/types/sandbox-reply.types";

const render = (from: string | null, session: SandboxSessionView | null): string =>
  renderToStaticMarkup(createElement(DebugPanel, { from, session }));

describe("DebugPanel", () => {
  it("marca cada etiqueta y su valor con dt y dd, sin span sueltos", () => {
    const markup = render(null, null);

    expect(markup).toContain('<dt class="inline font-medium text-gray-800">from:</dt> <dd class="inline text-gray-600">…</dd>');
    expect(markup).toContain('<dt class="inline font-medium text-gray-800">state:</dt> <dd class="inline text-gray-600">—</dd>');
    expect(markup.match(/<dt/g)).toHaveLength(4);
    expect(markup).not.toContain("<span");
  });

  it("muestra slots y counters como JSON en ese orden", () => {
    const markup = render("51999", { state: "MENU", slots: { dni: "123" }, counters: { intentos: 2 } } as unknown as SandboxSessionView);

    expect(markup).toContain(">51999</dd>");
    expect(markup).toContain(">MENU</dd>");
    expect(markup.indexOf("&quot;dni&quot;: &quot;123&quot;")).toBeLessThan(markup.indexOf("&quot;intentos&quot;: 2"));
    expect(markup.match(/<dd><pre/g)).toHaveLength(2);
  });
});
