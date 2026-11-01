import type { RequestStatus } from "@/lib/enums/request-status";

export type RequestState<T> =
  | { status: RequestStatus.LOADING }
  | { status: RequestStatus.ERROR; message: string; lastData: T | undefined }
  | { status: RequestStatus.DATA; data: T };
