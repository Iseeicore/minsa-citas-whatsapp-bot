const DEFAULT_GRAPH_API_VERSION = "v21.0";

export function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
}
