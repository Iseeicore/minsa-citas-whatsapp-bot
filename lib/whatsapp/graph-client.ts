import { graphApiBaseUrl, graphAuthHeaders } from "@/lib/whatsapp/graph-api";
import { HTTP_BAD_GATEWAY } from "@/lib/constants/http-status";
import { GraphResultStatus } from "@/lib/enums/graph-result-status";
import type { GraphResult } from "@/lib/types/graph-api.types";

const failed = (httpStatus: number, error: unknown = null): GraphResult<never> => ({ status: GraphResultStatus.ERROR, httpStatus, error });

async function request<T>(path: string, init: RequestInit): Promise<GraphResult<T>> {
  let response: Response;
  try {
    response = await fetch(`${graphApiBaseUrl()}${path}`, {
      ...init,
      headers: { ...graphAuthHeaders(), "Content-Type": "application/json" },
    });
  } catch {
    return failed(HTTP_BAD_GATEWAY);
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (body === undefined) return failed(response.ok ? HTTP_BAD_GATEWAY : response.status);
  return response.ok ? { status: GraphResultStatus.DATA, data: body as T } : failed(response.status, body);
}

export const graphClient = {
  get: <T>(path: string): Promise<GraphResult<T>> => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown): Promise<GraphResult<T>> => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
