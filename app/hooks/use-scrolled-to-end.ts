import { useCallback, useEffect, useRef, useState } from "react";
import { isScrolledToEnd } from "@/lib/utils/scroll-end";

export function useScrolledToEnd<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(false);

  const check = useCallback(() => {
    if (ref.current && isScrolledToEnd(ref.current)) setScrolledToEnd(true);
  }, []);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    return () => observer.disconnect();
  }, [check]);

  return { ref, scrolledToEnd, onScroll: check };
}
