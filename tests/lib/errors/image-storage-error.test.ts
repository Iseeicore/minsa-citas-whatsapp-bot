import { describe, expect, it } from "vitest";
import { ImageStorageError } from "@/lib/errors/image-storage-error";
import { ImageStorageFailure } from "@/lib/enums/image-storage-failure";

describe("ImageStorageError", () => {
  it("keeps the message of a rejected upload byte for byte", () => {
    expect(new ImageStorageError(ImageStorageFailure.BAD_STATUS, 503).message).toBe("El servicio de imágenes respondió 503");
  });

  it("keeps the message of an answer without a path byte for byte", () => {
    expect(new ImageStorageError(ImageStorageFailure.MISSING_PATH).message).toBe("El servicio de imágenes no devolvió una ruta");
  });

  it("is an Error named after its class that carries the failure and the status", () => {
    const error = new ImageStorageError(ImageStorageFailure.BAD_STATUS, 503);

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ImageStorageError);
    expect(error.name).toBe("ImageStorageError");
    expect(error.failure).toBe(ImageStorageFailure.BAD_STATUS);
    expect(error.status).toBe(503);
  });

  it("has no status when the service answered without a path", () => {
    const error = new ImageStorageError(ImageStorageFailure.MISSING_PATH);

    expect(error.failure).toBe(ImageStorageFailure.MISSING_PATH);
    expect(error.status).toBeUndefined();
  });

  it("fixes the value of each failure", () => {
    expect(ImageStorageFailure.BAD_STATUS).toBe("bad_status");
    expect(ImageStorageFailure.MISSING_PATH).toBe("missing_path");
  });
});
