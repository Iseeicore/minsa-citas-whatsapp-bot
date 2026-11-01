import { describe, expect, it } from "vitest";
import { mapsDirectionsUrl } from "@/lib/config/maps";
import { buildDirectionsUrl } from "@/lib/utils/maps-directions";

const BASE = "https://www.google.com/maps/dir/";
const DESTINATION = { latitud: -12.19, longitud: -77.02 };

describe("buildDirectionsUrl", () => {
  it("sends only the destination when there is no origin", () => {
    expect(buildDirectionsUrl(BASE, DESTINATION)).toBe(`${BASE}?api=1&destination=-12.19%2C-77.02`);
  });

  it("sends origin and destination when the user shares the location", () => {
    expect(buildDirectionsUrl(BASE, DESTINATION, { latitud: -12.05, longitud: -77.04 })).toBe(
      `${BASE}?api=1&origin=-12.05%2C-77.04&destination=-12.19%2C-77.02`,
    );
  });
});

describe("mapsDirectionsUrl", () => {
  it("uses MAPS_DIRECTIONS_URL when it is set, and the default otherwise", () => {
    expect(mapsDirectionsUrl({ MAPS_DIRECTIONS_URL: " https://maps.test/dir/ " })).toBe("https://maps.test/dir/");
    expect(mapsDirectionsUrl({})).toBe(BASE);
    expect(mapsDirectionsUrl({ MAPS_DIRECTIONS_URL: "" })).toBe(BASE);
  });
});
