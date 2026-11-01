"use client";

import { useCallback, useEffect, useState } from "react";
import { useApi } from "@/app/hooks/use-api";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { Paged } from "@/lib/types/api-client.types";

const DEBOUNCE_MS = 300;

type MorePages<T> = { query: string; items: T[]; page: number };

export function usePagedSearch<T>(endpoint: string, term: string, minChars: number, errorText: string) {
  const query = term.trim();
  const active = query.length >= minChars;
  const [debounced, setDebounced] = useState("");
  const [loaded, setLoaded] = useState("");
  const [more, setMore] = useState<MorePages<T>>({ query: "", items: [], page: 0 });
  const firstPage = useApi<Paged<T>>(errorText);
  const nextPage = useApi<Paged<T>>(errorText);

  const urlFor = useCallback((search: string, page: number) => `${endpoint}?${new URLSearchParams({ search, page: String(page) })}`, [endpoint]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const { get: getFirstPage } = firstPage;
  useEffect(() => {
    if (debounced.length < minChars) return;
    const controller = new AbortController();
    getFirstPage(urlFor(debounced, 1), { signal: controller.signal }).then(() => {
      if (!controller.signal.aborted) setLoaded(debounced);
    });
    return () => controller.abort();
  }, [debounced, minChars, getFirstPage, urlFor]);

  const ready = active && loaded === query;
  const first = ready && firstPage.state.status === ApiRequestStatus.DATA ? firstPage.state.data : undefined;
  const extra = ready && more.query === query ? more : undefined;
  const page = extra?.page ?? first?.page ?? 0;
  const hasMore = page < (first?.totalPages ?? 0);
  const loadingMore = nextPage.state.status === ApiRequestStatus.LOADING;

  const loadMore = useCallback(() => {
    if (!hasMore || loadingMore) return;
    nextPage.get(urlFor(query, page + 1)).then((result) => {
      if (result.status !== ApiRequestStatus.DATA) return;
      setMore((current) => ({
        query,
        items: current.query === query ? [...current.items, ...result.data.items] : result.data.items,
        page: result.data.page,
      }));
    });
  }, [hasMore, loadingMore, nextPage, urlFor, query, page]);

  return {
    active,
    items: [...(first?.items ?? []), ...(extra?.items ?? [])],
    searching: active && !ready,
    failed: ready && firstPage.state.status === ApiRequestStatus.ERROR,
    loadMoreFailed: ready && nextPage.state.status === ApiRequestStatus.ERROR,
    hasMore,
    loadingMore,
    loadMore,
  };
}
