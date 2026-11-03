import { SANDBOX_SCROLL_END_TOLERANCE_PX } from "@/lib/constants/limits/sandbox";

type ScrollBox = { scrollTop: number; clientHeight: number; scrollHeight: number };

export function isScrolledToEnd({ scrollTop, clientHeight, scrollHeight }: ScrollBox): boolean {
  return clientHeight > 0 && scrollTop + clientHeight >= scrollHeight - SANDBOX_SCROLL_END_TOLERANCE_PX;
}
