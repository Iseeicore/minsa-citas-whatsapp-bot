import { HttpStatus } from "@/lib/enums/http-status";

export function isServerErrorStatus(status: number): boolean {
  return status >= HttpStatus.INTERNAL_SERVER_ERROR;
}
