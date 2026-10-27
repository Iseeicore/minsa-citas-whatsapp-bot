import { describe, expect, it } from "vitest";
import { toGraphTextMessage } from "@/lib/utils/graph-text-message";

describe("toGraphTextMessage", () => {
  it("builds the Graph text message for one recipient", () => {
    expect(toGraphTextMessage("51987654321", "hola")).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      recipient: "51987654321",
      type: "text",
      text: { body: "hola" },
    });
  });
});
