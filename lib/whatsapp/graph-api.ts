import { findMetaAccessToken, findMetaPhoneNumberId } from "@/lib/config/integrations";
import { GraphTargetStatus } from "@/lib/enums/graph-target-status";
import { IntegrationVariable } from "@/lib/enums/integration-variable";
import { logger } from "@/lib/observability/logger";

export type GraphTarget =
  | { status: GraphTargetStatus.READY; url: string; headers: Record<string, string> }
  | { status: GraphTargetStatus.MISSING_VARIABLE; variable: IntegrationVariable };

const DEFAULT_GRAPH_API_VERSION = "v21.0";

function toMissingVariable(variable: IntegrationVariable): GraphTarget {
  logger.error("whatsapp.config_missing", { variable });
  return { status: GraphTargetStatus.MISSING_VARIABLE, variable };
}

function graphApiBaseUrl(): string {
  return `https://graph.facebook.com/${graphApiVersion()}`;
}

function findGraphTarget(path: string | undefined, missingPath: IntegrationVariable): GraphTarget {
  const accessToken = findMetaAccessToken();
  if (accessToken === undefined) return toMissingVariable(IntegrationVariable.META_ACCESS_TOKEN);
  if (path === undefined) return toMissingVariable(missingPath);
  return { status: GraphTargetStatus.READY, url: `${graphApiBaseUrl()}/${path}`, headers: { Authorization: `Bearer ${accessToken}` } };
}

export function graphApiVersion(): string {
  return process.env.META_GRAPH_API_VERSION || DEFAULT_GRAPH_API_VERSION;
}

export function findGraphMessagesTarget(): GraphTarget {
  const phoneNumberId = findMetaPhoneNumberId();
  return findGraphTarget(phoneNumberId === undefined ? undefined : `${phoneNumberId}/messages`, IntegrationVariable.META_PHONE_NUMBER_ID);
}

export function findGraphMediaTarget(mediaId: string): GraphTarget {
  return findGraphTarget(mediaId, IntegrationVariable.META_ACCESS_TOKEN);
}
