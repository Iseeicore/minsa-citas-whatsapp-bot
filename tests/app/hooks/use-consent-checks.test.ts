import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useConsentChecks } from "@/app/hooks/use-consent-checks";
import type { ConsentCheck } from "@/lib/fsm/core/types";

type Checks = ReturnType<typeof useConsentChecks>;

function renderChecks(checks: readonly ConsentCheck[]): Checks {
  let state: Checks | undefined;
  function Probe() {
    state = useConsentChecks(checks);
    return createElement("span", null, String(state.allChecked));
  }
  renderToStaticMarkup(createElement(Probe));
  return state as Checks;
}

describe("useConsentChecks", () => {
  it("starts with every box unticked and the consent incomplete", () => {
    const state = renderChecks([
      { id: "a", label: "Acepto A" },
      { id: "b", label: "Acepto B" },
    ]);

    expect(state.checked.size).toBe(0);
    expect(state.allChecked).toBe(false);
  });

  it("a consent without boxes is complete from the start", () => {
    expect(renderChecks([]).allChecked).toBe(true);
  });
});
