import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Composer } from "@/app/components/sandbox-chat/Composer";
import { TextInput } from "@/app/components/ui/TextInput";
import { SANDBOX_TEXT_MAX_LENGTH } from "@/lib/constants/sandbox-text-limit";

type TextInputProps = { onValueChange: (value: string) => void };

const composerProps = () => ({
  from: "web-1",
  loading: false,
  inputText: "",
  setInputText: vi.fn(),
  handleSend: () => {},
  handleImageSelect: () => {},
  onTooLong: vi.fn(),
});

function findTextInput(node: ReactNode): ReactElement<TextInputProps> | undefined {
  if (!isValidElement<{ children?: ReactNode }>(node)) return undefined;
  if (node.type === TextInput) return node as ReactElement<TextInputProps>;
  const children = Array.isArray(node.props.children) ? node.props.children : [node.props.children];
  return children.map(findTextInput).find(Boolean);
}

function typeInto(value: string) {
  const props = composerProps();
  findTextInput(Composer(props))?.props.onValueChange(value);
  return props;
}

describe("Composer", () => {
  it("keeps a message of exactly the limit without warning", () => {
    const text = "a".repeat(SANDBOX_TEXT_MAX_LENGTH);
    const props = typeInto(text);

    expect(props.setInputText).toHaveBeenCalledWith(text);
    expect(props.onTooLong).not.toHaveBeenCalled();
  });

  it("cuts a typed or pasted message over the limit to the limit and warns", () => {
    const props = typeInto("b".repeat(SANDBOX_TEXT_MAX_LENGTH + 500));

    expect(props.setInputText).toHaveBeenCalledWith("b".repeat(SANDBOX_TEXT_MAX_LENGTH));
    expect(props.onTooLong).toHaveBeenCalledTimes(1);
  });

  it("leaves the input without a native maxlength, so the browser never cuts a paste in silence", () => {
    expect(renderToStaticMarkup(createElement(Composer, composerProps()))).not.toContain("maxlength");
  });
});
