"use client";

import { useId } from "react";
import { Button } from "@/app/components/ui/Button";
import { Dialog } from "@/app/components/ui/Dialog";
import { Heading } from "@/app/components/ui/Heading";
import { LinkButton } from "@/app/components/ui/LinkButton";
import { ButtonVariant } from "@/lib/enums/button-variant";
import { HeadingVariant } from "@/lib/enums/ui/heading-variant";
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
  const titleId = useId();
  const { latitud, longitud } = eess;
  const destination: Coordinates | null = latitud !== null && longitud !== null ? { latitud, longitud } : null;
  const details = [
    ["Dirección", eess.direccion],
    ["Ubicación", [eess.distrito, eess.provincia, eess.departamento].filter(Boolean).join(", ")],
    ["Horario", eess.horario],
    ["DISA", eess.disa],
    ["Código", eess.codigo],
  ].filter(([, value]) => value);

  return (
    <Dialog
      onClose={onClose}
      labelledBy={titleId}
      closeOnBackdrop
      className="m-auto w-11/12 max-w-lg rounded-3xl bg-white text-brand-navy shadow-2xl outline-none backdrop:bg-brand-navy/60"
    >
      <div className="p-6 md:p-8">
        <Heading level={2} variant={HeadingVariant.LANDING_DIALOG} id={titleId}>
          {eess.nombre}
        </Heading>
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
    </Dialog>
  );
}
