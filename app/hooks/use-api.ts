"use client";

import { useMemo, useState } from "react";
import { createApiClient } from "@/lib/http/api-client";
import { ApiRequestStatus } from "@/lib/enums/api-request-status";
import type { ApiClient, ApiState } from "@/lib/types/api-client.types";

export function useApi<T>(errorText: string): ApiClient<T> & { state: ApiState<T> } {
  const [state, setState] = useState<ApiState<T>>({ status: ApiRequestStatus.IDLE });
  const client = useMemo(() => createApiClient<T>(errorText, setState), [errorText]);
  return { ...client, state };
}
