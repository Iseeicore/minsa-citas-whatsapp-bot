import { describe, expect, it } from "vitest";
import { TipoDocumento } from "@/lib/enums/tipo-documento";
import {
  isValidDniFormat,
  isValidDocumentoFormat,
  isValidOtpFormat,
  tipoDocumentoDe,
} from "@/lib/fsm/parsing/text/identity-format";

describe("isValidDocumentoFormat", () => {
  it.each(["12345678", "123456789", " 12345678 ", " 123456789 "])("accepts %j (8 digits DNI or 9 digits carnet, trimmed)", (value) => {
    expect(isValidDocumentoFormat(value)).toBe(true);
  });

  it.each(["", "0", "1234567", "1234567890", "1234567a", "12345678a", "abcdefgh", "1234 5678", "12345 6789", "-12345678", "12345678.9"])(
    "rejects %j",
    (value) => {
      expect(isValidDocumentoFormat(value)).toBe(false);
    },
  );
});

describe("tipoDocumentoDe", () => {
  it("8 digits is a DNI (01)", () => {
    expect(tipoDocumentoDe("12345678")).toBe(TipoDocumento.DNI);
    expect(TipoDocumento.DNI).toBe("01");
  });

  it("9 digits is a carnet de extranjería (03)", () => {
    expect(tipoDocumentoDe("123456789")).toBe(TipoDocumento.CARNET_EXTRANJERIA);
    expect(TipoDocumento.CARNET_EXTRANJERIA).toBe("03");
  });

  it("ignores the spaces around the number", () => {
    expect(tipoDocumentoDe(" 123456789 ")).toBe(TipoDocumento.CARNET_EXTRANJERIA);
  });
});

describe("isValidDniFormat", () => {
  it("accepts exactly 8 digits (trimmed)", () => {
    expect(isValidDniFormat("12345678")).toBe(true);
    expect(isValidDniFormat(" 12345678 ")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isValidDniFormat("1234567")).toBe(false);
    expect(isValidDniFormat("123456789")).toBe(false);
    expect(isValidDniFormat("1234567a")).toBe(false);
  });
});

describe("isValidOtpFormat", () => {
  it("accepts 4 to 8 digits", () => {
    expect(isValidOtpFormat("1234")).toBe(true);
    expect(isValidOtpFormat("12345678")).toBe(true);
  });

  it("rejects short, long, or non-numeric codes", () => {
    expect(isValidOtpFormat("123")).toBe(false);
    expect(isValidOtpFormat("123456789")).toBe(false);
    expect(isValidOtpFormat("12a4")).toBe(false);
  });
});
