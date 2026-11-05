import { afterEach, describe, expect, it, vi } from "vitest";
import { findContactPhoneNumber } from "@/lib/config/contact-phone";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("findContactPhoneNumber", () => {
  it("devuelve el número sin los espacios de los extremos", () => {
    vi.stubEnv("CONTACT_PHONE_NUMBER", " 989 655 177 ");

    expect(findContactPhoneNumber()).toBe("989 655 177");
  });

  it.each(["", "   ", undefined])("sin número (%j) no devuelve nada", (value) => {
    vi.stubEnv("CONTACT_PHONE_NUMBER", value);

    expect(findContactPhoneNumber()).toBeUndefined();
  });
});
