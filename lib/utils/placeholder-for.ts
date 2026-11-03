import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { ApiState } from "@/lib/types/api-client.types";

export function placeholderFor<T>(state: ApiState<T[]>, texts: { loading: string; empty: string }): string | undefined {
  if (state.status === ApiRequestStatus.LOADING) return texts.loading;
  if (state.status === ApiRequestStatus.DATA && state.data.length === 0) return texts.empty;
  return undefined;
}
