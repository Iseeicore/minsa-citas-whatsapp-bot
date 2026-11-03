"use client";

import { useCallback, useEffect, useState } from "react";
import type { ApiState } from "@/lib/types/api-client.types";
import { getApi } from "@/lib/http/api-client";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import { computePollDelay, shouldKeepPolling } from "@/lib/utils/poll-backoff";
import { readRequestData } from "@/lib/utils/read-request-data";

type ConversationPolling<T> = {
  state: ApiState<T>;
  update: (change: (data: T) => T) => void;
};

export function useConversationPolling<T>(url: string, fallbackMessage: string): ConversationPolling<T> {
  const [state, setState] = useState<ApiState<T>>({ status: ApiRequestStatus.LOADING });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function poll() {
      const result = await getApi<T>(url, { failed: fallbackMessage });
      if (cancelled) return;
      if (result.status === ApiRequestStatus.ERROR) {
        failures += 1;
        setState((current) => ({ status: ApiRequestStatus.ERROR, message: result.message, lastData: readRequestData(current) }));
      } else {
        failures = 0;
        setState({ status: ApiRequestStatus.DATA, data: result.data });
      }
      if (shouldKeepPolling(failures)) timer = setTimeout(poll, computePollDelay(failures));
    }

    poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [url, fallbackMessage]);

  const update = useCallback((change: (data: T) => T) => {
    setState((current) => {
      if (current.status === ApiRequestStatus.DATA) return { status: ApiRequestStatus.DATA, data: change(current.data) };
      if (current.status === ApiRequestStatus.ERROR && current.lastData !== undefined) return { ...current, lastData: change(current.lastData) };
      return current;
    });
  }, []);

  return { state, update };
}
