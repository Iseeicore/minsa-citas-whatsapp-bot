import { ImageStorageFailure } from "@/lib/enums/image-storage-failure";

const MESSAGE_BY_FAILURE: Readonly<Record<ImageStorageFailure, (status?: number) => string>> = {
  [ImageStorageFailure.BAD_STATUS]: (status) => `El servicio de imágenes respondió ${status}`,
  [ImageStorageFailure.MISSING_PATH]: () => "El servicio de imágenes no devolvió una ruta",
  [ImageStorageFailure.UNREADABLE_BODY]: () => "El servicio de imágenes respondió un cuerpo que no se pudo leer",
};

export class ImageStorageError extends Error {
  constructor(
    readonly failure: ImageStorageFailure,
    readonly status?: number,
    options?: { cause?: unknown },
  ) {
    super(MESSAGE_BY_FAILURE[failure](status), options);
    this.name = "ImageStorageError";
  }
}
