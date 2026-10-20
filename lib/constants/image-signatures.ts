import { ImageMimeType } from "@/lib/enums/image-mime-type";

const FILE_START_OFFSET = 0;
const WEBP_FORMAT_OFFSET = 8;

const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const RIFF_SIGNATURE = [0x52, 0x49, 0x46, 0x46];
const WEBP_SIGNATURE = [0x57, 0x45, 0x42, 0x50];

export const IMAGE_SIGNATURES: Readonly<Record<ImageMimeType, ReadonlyArray<{ offset: number; bytes: readonly number[] }>>> = {
  [ImageMimeType.JPEG]: [{ offset: FILE_START_OFFSET, bytes: JPEG_SIGNATURE }],
  [ImageMimeType.PNG]: [{ offset: FILE_START_OFFSET, bytes: PNG_SIGNATURE }],
  [ImageMimeType.WEBP]: [
    { offset: FILE_START_OFFSET, bytes: RIFF_SIGNATURE },
    { offset: WEBP_FORMAT_OFFSET, bytes: WEBP_SIGNATURE },
  ],
};
