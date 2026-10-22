import type { ComponentType, ReactNode } from "react";
import type { ListRow } from "@/lib/fsm/core/types";
import type { ListPager } from "@/lib/utils/list-rows";

export type ListItemPresentation = { label: string; Icon?: ComponentType<{ className?: string }> };

export type ListItemRenderer = (item: ListRow, presentation: ListItemPresentation) => ReactNode;

export type ListPickerProps = {
  items: ListRow[];
  searchThreshold: number;
  pageSize: number;
  onSelect: (id: string, label: string) => void;
  pager?: ListPager;
  presentItem?: (item: ListRow) => ListItemPresentation;
  renderItem?: ListItemRenderer;
  disabled?: boolean;
};
