export type EmptyPageJump = { page: number; skips: number; clearBackFrom: boolean };

export type EmptyPagePaging = { page: number; totalPages: number; skips: number; backFrom: number | undefined };

export function findPageAfterEmpty(paging: EmptyPagePaging, maxSkips: number): EmptyPageJump | undefined {
  const { page, totalPages, skips, backFrom } = paging;
  const canSkip = skips < maxSkips;

  if (backFrom !== undefined) {
    if (page > 1 && canSkip) {
      return { page: page - 1, skips: skips + 1, clearBackFrom: false };
    }
    return { page: backFrom, skips: maxSkips, clearBackFrom: true };
  }

  if (page < totalPages && canSkip) {
    return { page: page + 1, skips: skips + 1, clearBackFrom: false };
  }

  return undefined;
}

export function listAvailableEstablecimientos<T extends { quotasOnline: number; renipressCode: string }>(
  items: T[],
  discarded: string[],
): T[] {
  return items.filter((item) => item.quotasOnline > 0 && !discarded.includes(item.renipressCode));
}
