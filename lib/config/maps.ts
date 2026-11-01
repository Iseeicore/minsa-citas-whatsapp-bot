const DEFAULT_DIRECTIONS_URL = "https://www.google.com/maps/dir/";

export function mapsDirectionsUrl(env: Record<string, string | undefined> = process.env): string {
  return env.MAPS_DIRECTIONS_URL?.trim() || DEFAULT_DIRECTIONS_URL;
}
