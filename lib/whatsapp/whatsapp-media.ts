import { MediaFailure } from "@/lib/enums/media-failure";
import { InboundMediaKind } from "@/lib/enums/inbound-media-kind";
import { MediaDownloadStep } from "@/lib/enums/media-download-step";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { logger } from "@/lib/observability/logger";
import { findGraphMediaTarget } from "@/lib/whatsapp/graph-api";
import { GraphTargetStatus } from "@/lib/enums/graph-target-status";
import type { InboundMedia } from "@/lib/fsm/core/types";

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

const failed = (failure: MediaFailure): InboundMedia => ({ kind: InboundMediaKind.FAILURE, failure });

function toUnreadableMediaDownload(step: MediaDownloadStep, status?: number): InboundMedia {
  logger.warn("whatsapp.media_failed", { step, status });
  return failed(MediaFailure.UNREADABLE);
}

export async function downloadWhatsAppMediaAsDataUri(mediaId: string): Promise<InboundMedia> {
  const target = findGraphMediaTarget(mediaId);
  if (target.status === GraphTargetStatus.MISSING_VARIABLE) return failed(MediaFailure.UNREADABLE);
  const { url, headers } = target;

  try {
    const infoResponse = await fetch(url, { headers });
    if (!infoResponse.ok) return toUnreadableMediaDownload(MediaDownloadStep.INFO, infoResponse.status);

    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!info.url || !info.mime_type) return toUnreadableMediaDownload(MediaDownloadStep.INFO_INCOMPLETE);
    const maxBytes = getEvidenceImageMaxBytes();
    if (info.file_size && info.file_size > maxBytes) return failed(MediaFailure.TOO_LARGE);

    const mediaResponse = await fetch(info.url, { headers });
    if (!mediaResponse.ok) return toUnreadableMediaDownload(MediaDownloadStep.DOWNLOAD, mediaResponse.status);

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    if (buffer.length > maxBytes) return failed(MediaFailure.TOO_LARGE);
    return { kind: InboundMediaKind.DATA, dataUri: `data:${info.mime_type};base64,${buffer.toString("base64")}` };
  } catch (error) {
    logger.warn("whatsapp.media_failed", { error });
    return failed(MediaFailure.UNREADABLE);
  }
}
