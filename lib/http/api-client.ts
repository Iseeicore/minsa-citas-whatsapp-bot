import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { ApiClient, ApiErrorBody, ApiErrorTexts, ApiResult, ApiState } from "@/lib/types/api-client.types";
import { isRecord, isString } from "@/lib/utils/type-guards";

const JSON_HEADERS = { "Content-Type": "application/json" };

function apiErrorMessage(body: unknown): string | undefined {
  const message = isRecord(body) ? (body as ApiErrorBody).message : undefined;
  return isString(message) ? message : undefined;
}

function postInit(body: unknown): RequestInit {
  return body === undefined ? { method: "POST" } : { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) };
}

async function fetchApiResult<T>(path: string, texts: ApiErrorTexts, init?: RequestInit): Promise<ApiResult<T>> {
  const unreachable: ApiResult<T> = { status: ApiRequestStatus.ERROR, message: texts.unreachable ?? texts.failed };
  try {
    const response = await fetch(path, init);
    const body: unknown = await response.json().catch(() => undefined);
    if (!response.ok) return { status: ApiRequestStatus.ERROR, message: apiErrorMessage(body) ?? texts.failed };
    return body === undefined ? unreachable : { status: ApiRequestStatus.DATA, data: body as T };
  } catch {
    return unreachable;
  }
}

export function getApi<T>(path: string, texts: ApiErrorTexts, init?: Pick<RequestInit, "signal">): Promise<ApiResult<T>> {
  return fetchApiResult<T>(path, texts, init);
}

export function postApi<T>(path: string, body: unknown, texts: ApiErrorTexts): Promise<ApiResult<T>> {
  return fetchApiResult<T>(path, texts, postInit(body));
}

export function createApiClient<T>(errorText: string, onState: (state: ApiState<T>) => void): ApiClient<T> {
  const texts: ApiErrorTexts = { failed: errorText };

  async function track(send: () => Promise<ApiResult<T>>, signal?: AbortSignal | null): Promise<ApiResult<T>> {
    onState({ status: ApiRequestStatus.LOADING });
    const result = await send();
    if (!signal?.aborted) onState(result);
    return result;
  }

  return {
    get: (path, init) => track(() => getApi<T>(path, texts, init), init?.signal),
    post: (path, body) => track(() => postApi<T>(path, body, texts)),
  };
}
