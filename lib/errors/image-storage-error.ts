import { ImageStorageFailure } from "@/lib/enums/image-storage-failure";

export class ImageStorageError extends Error {
  constructor(
    readonly failure: ImageStorageFailure,
    readonly status?: number,
  ) {
    super(
      failure === ImageStorageFailure.BAD_STATUS
        ? `El servicio de imágenes respondió ${status}`
        : "El servicio de imágenes no devolvió una ruta",
    );
    this.name = "ImageStorageError";
  }
}
