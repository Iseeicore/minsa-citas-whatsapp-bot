import { BYTES_PER_MEGABYTE } from "@/lib/constants/limits/bytes";

export const formatMegabytes = (bytes: number): string => `${bytes / BYTES_PER_MEGABYTE} MB`;
