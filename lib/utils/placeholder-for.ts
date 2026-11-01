import { RequestStatus } from "@/lib/enums/request-status";
import type { RequestState } from "@/lib/types/request-state.types";

export function placeholderFor<T>(state: RequestState<T[]>, texts: { loading: string; empty: string }): string | undefined {
  if (state.status === RequestStatus.LOADING) return texts.loading;
  if (state.status === RequestStatus.DATA && state.data.length === 0) return texts.empty;
  return undefined;
}
