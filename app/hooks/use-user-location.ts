"use client";

import { useEffect, useState } from "react";
import type { Coordinates } from "@/lib/utils/maps-directions";

const GEOLOCATION_OPTIONS: PositionOptions = { timeout: 15_000, maximumAge: 300_000 };

export function useUserLocation(): Coordinates | undefined {
  const [location, setLocation] = useState<Coordinates>();

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      ({ coords }) => setLocation({ latitud: coords.latitude, longitud: coords.longitude }),
      () => undefined,
      GEOLOCATION_OPTIONS,
    );
  }, []);

  return location;
}
