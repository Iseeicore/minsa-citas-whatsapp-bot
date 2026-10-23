export type ReferenceOptionClassNames = {
  card: string;
  title: string;
  badge: string;
};

const AVAILABLE: ReferenceOptionClassNames = {
  card: "border-sb-bubble-border",
  title: "text-sb-navy",
  badge: "bg-sb-panel text-sb-navy",
};

const UNAVAILABLE: ReferenceOptionClassNames = {
  card: "cursor-not-allowed border-sb-bubble-border bg-sb-muted text-sb-muted-text hover:bg-sb-muted",
  title: "text-sb-muted-text",
  badge: "bg-white text-sb-muted-text",
};

export function referenceOptionClassNames(unavailable: boolean): ReferenceOptionClassNames {
  return unavailable ? UNAVAILABLE : AVAILABLE;
}
