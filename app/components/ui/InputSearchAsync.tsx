"use client";

import { useEffect, useRef, useState, type FocusEvent, type ReactNode } from "react";
import { Button } from "@/app/components/ui/Button";
import { SearchField } from "@/app/components/ui/SearchField";
import { usePagedSearch } from "@/app/hooks/use-paged-search";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { cn } from "@/lib/utils/cn";

const STATUS_CLASS_NAME = "px-5 py-4 text-center text-sm text-gray-500";

export function InputSearchAsync<T>({
  endpoint,
  id,
  label,
  placeholder,
  icon,
  className,
  minChars = 3,
  errorText = "No pudimos completar la búsqueda. Intenta de nuevo.",
  emptyText = "No encontramos resultados.",
  itemKey,
  itemTitle,
  itemDescription,
  onSelect,
}: {
  endpoint: string;
  id: string;
  label: string;
  placeholder?: string;
  icon?: ReactNode;
  className?: string;
  minChars?: number;
  errorText?: string;
  emptyText?: string;
  itemKey: (item: T) => string;
  itemTitle: (item: T) => string;
  itemDescription?: (item: T) => string;
  onSelect: (item: T) => void;
}) {
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const { active, items, searching, failed, loadMoreFailed, hasMore, loadingMore, loadMore } = usePagedSearch<T>(
    endpoint,
    term,
    minChars,
    errorText,
  );
  const listRef = useRef<HTMLUListElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const root = listRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel) return;
    const observer = new IntersectionObserver(([entry]) => entry.isIntersecting && loadMore(), { root, rootMargin: "80px" });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore, items.length, hasMore]);

  function closeOnOutsideFocus(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }

  return (
    <div onBlur={closeOnOutsideFocus} className="relative">
      <div className={cn("flex items-center gap-3", className)}>
        {icon}
        <SearchField
          id={id}
          label={label}
          labelClassName="font-gotham text-sm leading-tight md:text-2xl"
          placeholder={placeholder}
          autoComplete="off"
          value={term}
          onValueChange={(value) => {
            setTerm(value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onSearch={() => setOpen(true)}
        />
      </div>

      {open && term.trim().length > 0 && (
        <div className="absolute inset-x-0 top-full z-10 mt-2 overflow-hidden rounded-2xl bg-white text-brand-navy shadow-2xl">
          {!active && <p className={STATUS_CLASS_NAME}>Escribe al menos {minChars} letras para buscar.</p>}
          {searching && <p className={STATUS_CLASS_NAME} role="status">Buscando…</p>}
          {failed && <p className={STATUS_CLASS_NAME} role="alert">{errorText}</p>}
          {active && !searching && !failed && items.length === 0 && <p className={STATUS_CLASS_NAME}>{emptyText}</p>}
          {items.length > 0 && (
            <ul ref={listRef} tabIndex={-1} className="max-h-56 overflow-y-auto outline-none md:max-h-72">
              {items.map((item) => (
                <li key={itemKey(item)} className="border-b border-brand-sky last:border-0">
                  <Button
                    variant={ButtonVariant.UNSTYLED}
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                    className="block w-full px-5 py-3 text-left transition hover:bg-brand-sky"
                  >
                    <span className="block font-gotham text-sm leading-tight font-bold md:text-lg">{itemTitle(item)}</span>
                    {itemDescription && <span className="block text-xs text-gray-500 md:text-sm">{itemDescription(item)}</span>}
                  </Button>
                </li>
              ))}
              {(hasMore || loadMoreFailed) && (
                <li ref={sentinelRef} className={STATUS_CLASS_NAME} role="status">
                  {loadMoreFailed ? errorText : loadingMore ? "Cargando más…" : ""}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
