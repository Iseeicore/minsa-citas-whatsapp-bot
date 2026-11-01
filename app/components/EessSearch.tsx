"use client";

import Image from "next/image";
import { useState } from "react";
import EessDetailModal from "@/app/components/EessDetailModal";
import { useUserLocation } from "@/app/hooks/use-user-location";
import { InputSearchAsync } from "@/app/components/ui/InputSearchAsync";
import { EESS_SEARCH_MIN_CHARS } from "@/lib/constants/limits/eess";
import type { EessItem } from "@/lib/integrations/minsa/types";

const place = (eess: EessItem) => [eess.distrito, eess.provincia, eess.departamento].filter(Boolean).join(", ");

export default function EessSearch({ directionsUrl }: { directionsUrl: string }) {
  const [selected, setSelected] = useState<EessItem | null>(null);
  const origin = useUserLocation();

  return (
    <>
      <InputSearchAsync<EessItem>
        endpoint="/api/eess"
        id="eess-search"
        label="Encuentra tu establecimiento de salud más cercano"
        placeholder="Nombre o código del establecimiento"
        minChars={EESS_SEARCH_MIN_CHARS}
        emptyText="No encontramos establecimientos con ese nombre."
        errorText="No pudimos consultar los establecimientos. Intenta de nuevo."
        className="rounded-3xl bg-landing-search-mobile bg-cover px-4 py-3 text-white md:gap-6 md:bg-landing-search md:px-8 md:py-4"
        icon={<Image src="/landing/ubicacion.webp" alt="" width={200} height={204} className="size-12 shrink-0 md:size-20" />}
        itemKey={(eess) => eess.codigo}
        itemTitle={(eess) => eess.nombre}
        itemDescription={place}
        onSelect={setSelected}
      />
      {selected && <EessDetailModal eess={selected} directionsUrl={directionsUrl} origin={origin} onClose={() => setSelected(null)} />}
    </>
  );
}
