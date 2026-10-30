import { MediaFailure } from "@/lib/enums/media-failure";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { logger } from "@/lib/observability/logger";
import { graphApiBaseUrl, graphAuthHeaders } from "@/lib/whatsapp/graph-api";
import type { InboundMedia } from "@/lib/fsm/core/types";

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

export type MediaDownload = InboundMedia;

const failed = (failure: MediaFailure): MediaDownload => ({ kind: InboundMediaKind.FAILURE, failure });

function unreadableAt(step: "info" | "info_incomplete" | "download", status?: number): MediaDownload {
  logger.warn("whatsapp.media_failed", { step, status });
  return failed(MediaFailure.UNREADABLE);
}

export async function downloadWhatsAppMediaAsDataUri(mediaId: string): Promise<MediaDownload> {
  const headers = graphAuthHeaders();

  try {
    const infoResponse = await fetch(`${graphApiBaseUrl()}/${mediaId}`, { headers });
    if (!infoResponse.ok) return unreadableAt("info", infoResponse.status);

    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!info.url || !info.mime_type) return unreadableAt("info_incomplete");
    const maxBytes = getEvidenceImageMaxBytes();
    if (info.file_size && info.file_size > maxBytes) return failed(MediaFailure.TOO_LARGE);

    const mediaResponse = await fetch(info.url, { headers });
    if (!mediaResponse.ok) return unreadableAt("download", mediaResponse.status);

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    if (buffer.length > maxBytes) return failed(MediaFailure.TOO_LARGE);
    return { kind: InboundMediaKind.DATA, dataUri: `data:${info.mime_type};base64,${buffer.toString("base64")}` };
  } catch (error) {
    logger.warn("whatsapp.media_failed", { error });
    return failed(MediaFailure.UNREADABLE);
  }
}
