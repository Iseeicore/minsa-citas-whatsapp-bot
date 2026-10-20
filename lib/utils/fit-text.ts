import { truncateForRow } from "@/lib/fsm/core/handlers-shared";

const shortenBy = (value: string, overflow: number): string => {
  const kept = value.length - overflow;
  return kept > 0 ? truncateForRow(value, kept) : "";
};

export function renderWithinLength(values: string[], render: (values: string[]) => string, maxLength: number): string {
  const fitted = values.reduce<string[]>((current, _value, index) => {
    const overflow = render(current).length - maxLength;
    if (overflow <= 0) return current;
    return current.map((value, position) => (position === index ? shortenBy(value, overflow) : value));
  }, values);
  return render(fitted);
}
