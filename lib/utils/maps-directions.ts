export type Coordinates = { latitud: number; longitud: number };

const asParam = ({ latitud, longitud }: Coordinates) => `${latitud},${longitud}`;

export function buildDirectionsUrl(baseUrl: string, destination: Coordinates, origin?: Coordinates): string {
  const url = new URL(baseUrl);
  url.searchParams.set("api", "1");
  if (origin) url.searchParams.set("origin", asParam(origin));
  url.searchParams.set("destination", asParam(destination));
  return url.toString();
}
