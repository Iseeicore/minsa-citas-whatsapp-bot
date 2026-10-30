import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Checkbox } from "@/app/components/ui/Checkbox";

describe("Checkbox", () => {
  it("is a native checkbox inside its label, so the text toggles it", () => {
    const markup = renderToStaticMarkup(createElement(Checkbox, { label: "Acepto", checked: false, onCheckedChange: () => {} }));

    expect(markup).toMatch(/^<label[^>]*><input type="checkbox"/);
    expect(markup).toContain("Acepto");
    expect(markup).not.toContain("checked=");
  });

  it("shows the checked state it receives", () => {
    const markup = renderToStaticMarkup(createElement(Checkbox, { label: "Acepto", checked: true, onCheckedChange: () => {} }));

    expect(markup).toContain('checked=""');
  });
});
