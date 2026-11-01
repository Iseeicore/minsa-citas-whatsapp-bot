import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { useApi } from "@/app/hooks/use-api";

function Probe() {
  const api = useApi<string>("No se pudo completar la acción.");
  return createElement("span", null, `${api.state.status} ${typeof api.get} ${typeof api.post}`);
}

describe("useApi", () => {
  it("starts idle and exposes get and post", () => {
    expect(renderToStaticMarkup(createElement(Probe))).toBe("<span>idle function function</span>");
  });
});
