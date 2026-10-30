export function cutToLimit(value: string, maxLength: number): { text: string; cut: boolean } {
  if (value.length <= maxLength) return { text: value, cut: false };
  return { text: value.slice(0, maxLength), cut: true };
}
