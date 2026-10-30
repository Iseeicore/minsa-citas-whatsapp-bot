import { BYTES_PER_MEGABYTE } from "@/lib/constants/limits/bytes";

export function bytesToMegabytes(bytes: number): number {
  return bytes / BYTES_PER_MEGABYTE;
}
