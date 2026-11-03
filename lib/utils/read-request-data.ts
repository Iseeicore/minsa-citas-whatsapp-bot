import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { ApiState } from "@/lib/types/api-client.types";

export function readRequestData<T>(state: ApiState<T>): T | undefined {
  if (state.status === ApiRequestStatus.DATA) return state.data;
  if (state.status === ApiRequestStatus.ERROR) return state.lastData;
  return undefined;
}
