const DEFAULT_GRAPH_API_VERSION = "v21.0";

export function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
}

export function graphApiBaseUrl(): string {
  return `https://graph.facebook.com/${graphApiVersion()}`;
}

export function graphAuthHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${process.env.META_ACCESS_TOKEN}` };
}
