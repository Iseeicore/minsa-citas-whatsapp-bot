import { describe, expect, it } from "vitest";
import { describeLimit } from "@/lib/utils/describe-limit";

describe("describeLimit", () => {
  it("writes the count, the noun and the window in seconds", () => {
    expect(describeLimit(20, 60_000, "messages")).toBe("more than 20 messages in 60 s");
  });

  it("keeps a fraction of a second when the window has one", () => {
    expect(describeLimit(6, 1_500, "evidence images")).toBe("more than 6 evidence images in 1.5 s");
  });
});
