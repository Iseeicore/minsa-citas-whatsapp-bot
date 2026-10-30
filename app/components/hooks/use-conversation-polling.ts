"use client";

import { useCallback, useEffect, useState } from "react";
import type { RequestState } from "@/app/components/types";
import { fetchJson } from "@/app/components/http/fetch-json";
import { FetchJsonStatus } from "@/lib/enums/fetch-json-status";
import { RequestStatus } from "@/lib/enums/request-status";
import { computePollDelay, shouldKeepPolling } from "@/lib/utils/poll-backoff";

type ConversationPolling<T> = {
  state: RequestState<T>;
  update: (change: (data: T) => T) => void;
};

export function readRequestData<T>(state: RequestState<T>): T | undefined {
  if (state.status === RequestStatus.DATA) return state.data;
  if (state.status === RequestStatus.ERROR) return state.lastData;
  return undefined;
}

export function useConversationPolling<T>(url: string, fallbackMessage: string): ConversationPolling<T> {
  const [state, setState] = useState<RequestState<T>>({ status: RequestStatus.LOADING });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;

    async function poll() {
      const result = await fetchJson<T>(url, fallbackMessage);
      if (cancelled) return;
      if (result.status === FetchJsonStatus.FAILED) {
        failures += 1;
        setState((current) => ({ status: RequestStatus.ERROR, message: result.message, lastData: readRequestData(current) }));
      } else {
        failures = 0;
        setState({ status: RequestStatus.DATA, data: result.data });
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
      if (current.status === RequestStatus.DATA) return { status: RequestStatus.DATA, data: change(current.data) };
      if (current.status === RequestStatus.ERROR && current.lastData !== undefined) return { ...current, lastData: change(current.lastData) };
      return current;
    });
  }, []);

  return { state, update };
}
