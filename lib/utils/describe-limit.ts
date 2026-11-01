import { SECOND_MS } from "@/lib/constants/limits/time-units";

export const describeLimit = (count: number, windowMs: number, noun: string): string =>
  `more than ${count} ${noun} in ${windowMs / SECOND_MS} s`;
