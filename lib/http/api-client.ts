import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { ApiClient, ApiErrorBody, ApiResult, ApiState } from "@/lib/types/api-client.types";
import { isRecord, isString } from "@/lib/utils/type-guards";

const JSON_HEADERS = { "Content-Type": "application/json" };

function apiErrorMessage(body: unknown): string | undefined {
  const message = isRecord(body) ? (body as ApiErrorBody).message : undefined;
  return isString(message) ? message : undefined;
}

async function fetchApiResult<T>(path: string, errorText: string, init?: RequestInit): Promise<ApiResult<T>> {
  const failed: ApiResult<T> = { status: ApiRequestStatus.ERROR, message: errorText };
  try {
    const response = await fetch(path, init);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) return { status: ApiRequestStatus.ERROR, message: apiErrorMessage(body) ?? errorText };
    return body === undefined ? failed : { status: ApiRequestStatus.DATA, data: body as T };
  } catch {
    return failed;
  }
}

export function createApiClient<T>(errorText: string, onState: (state: ApiState<T>) => void): ApiClient<T> {
  async function request(path: string, init?: RequestInit): Promise<ApiResult<T>> {
    onState({ status: ApiRequestStatus.LOADING });
    const result = await fetchApiResult<T>(path, errorText, init);
    onState(result);
    return result;
  }

  return {
    get: (path) => request(path),
    post: (path, body) =>
      request(path, body === undefined ? { method: "POST" } : { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) }),
  };
}
