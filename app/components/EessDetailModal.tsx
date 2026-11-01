"use client";

import { useEffect } from "react";
import { Button } from "@/app/components/ui/Button";
import { LinkButton } from "@/app/components/ui/LinkButton";
import { ButtonVariant } from "@/lib/enums/button-variant";
import type { EessItem } from "@/lib/integrations/minsa/types";
import { buildDirectionsUrl, type Coordinates } from "@/lib/utils/maps-directions";

export default function EessDetailModal({
  eess,
  directionsUrl,
  origin,
  onClose,
}: {
  eess: EessItem;
  directionsUrl: string;
  origin?: Coordinates;
  onClose: () => void;
}) {
  const { latitud, longitud } = eess;
  const destination: Coordinates | null = latitud !== null && longitud !== null ? { latitud, longitud } : null;
  const details = [
    ["Dirección", eess.direccion],
    ["Ubicación", [eess.distrito, eess.provincia, eess.departamento].filter(Boolean).join(", ")],
    ["Horario", eess.horario],
    ["DISA", eess.disa],
    ["Código", eess.codigo],
  ].filter(([, value]) => value);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="eess-modal-title"
      onClick={(event) => event.target === event.currentTarget && onClose()}
      className="fixed inset-0 z-40 flex items-center justify-center bg-brand-navy/60 p-4"
    >
      <div className="max-h-full w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-6 text-brand-navy shadow-2xl md:p-8">
        <h2 id="eess-modal-title" className="font-gotham text-xl leading-tight font-bold md:text-3xl">
          {eess.nombre}
        </h2>
        <dl className="mt-4 space-y-3">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-brand-teal uppercase">{label}</dt>
              <dd className="text-sm md:text-base">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {destination && (
            <LinkButton
              href={buildDirectionsUrl(directionsUrl, destination, origin)}
              target="_blank"
              rel="noopener noreferrer"
              variant={ButtonVariant.PILL_TEAL}
              className="flex-1 px-6 py-3 text-center"
            >
              Cómo llegar
            </LinkButton>
          )}
          <Button
            variant={ButtonVariant.PILL_OUTLINE}
            autoFocus
            onClick={onClose}
            className="flex-1 px-6 py-3"
          >
            Cerrar
          </Button>
        </div>
      </div>
    </div>
  );
}
