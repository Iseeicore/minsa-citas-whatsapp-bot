import { FetchJsonStatus } from "@/lib/enums/fetch-json-status";
import { parseJsonOr } from "@/lib/utils/safe-json";
import { isRecord, isString } from "@/lib/utils/type-guards";

export type FetchJsonResult<T> = { status: FetchJsonStatus.OK; data: T } | { status: FetchJsonStatus.FAILED; message: string };

const UNREADABLE = Symbol("unreadable");

function failed<T>(message: string): FetchJsonResult<T> {
  return { status: FetchJsonStatus.FAILED, message };
}

export async function fetchJson<T>(url: string, fallbackMessage: string): Promise<FetchJsonResult<T>> {
  let response: Response;
  let body: unknown;
  try {
    response = await fetch(url);
    body = parseJsonOr(await response.text(), UNREADABLE);
  } catch {
    return failed(fallbackMessage);
  }

  if (!response.ok) {
    const message = isRecord(body) && isString(body.message) ? body.message : fallbackMessage;
    return failed(message);
  }
  if (body === UNREADABLE) return failed(fallbackMessage);
  return { status: FetchJsonStatus.OK, data: body as T };
}
