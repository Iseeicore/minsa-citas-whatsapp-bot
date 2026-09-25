const DEFAULT_GRAPH_API_VERSION = "v21.0";

// `||`, not `??`: an empty value (docker compose or a copied .env.example can
// leave one) would otherwise build https://graph.facebook.com//... and fail.
export function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
}
