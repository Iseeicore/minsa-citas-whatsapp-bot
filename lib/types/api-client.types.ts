import type { ApiErrorCode } from "@/lib/enums/api-error-code";
import type { ApiRequestStatus } from "@/lib/enums/api-request-status";

export type ApiErrorBody = { error?: ApiErrorCode; message?: string };

export type ApiState<T> =
  | { status: ApiRequestStatus.IDLE }
  | { status: ApiRequestStatus.LOADING }
  | { status: ApiRequestStatus.DATA; data: T }
  | { status: ApiRequestStatus.ERROR; message: string };

export type ApiResult<T> = Extract<ApiState<T>, { status: ApiRequestStatus.DATA | ApiRequestStatus.ERROR }>;

export type ApiClient<T> = {
  get: (path: string) => Promise<ApiResult<T>>;
  post: (path: string, body?: unknown) => Promise<ApiResult<T>>;
};
