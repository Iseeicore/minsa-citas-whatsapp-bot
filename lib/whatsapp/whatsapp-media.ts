import { MediaFailure } from "@/lib/enums/media-failure";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { logger } from "@/lib/observability/logger";
import { graphApiBaseUrl, graphAuthHeaders } from "@/lib/whatsapp/graph-api";

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

export type MediaDownload = { dataUri: string } | { failure: MediaFailure };

const failed = (failure: MediaFailure): MediaDownload => ({ failure });

export async function downloadWhatsAppMediaAsDataUri(mediaId: string): Promise<MediaDownload> {
  const headers = graphAuthHeaders();

  try {
    const infoResponse = await fetch(`${graphApiBaseUrl()}/${mediaId}`, { headers });
    if (!infoResponse.ok) return failed(MediaFailure.UNREADABLE);

    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!info.url || !info.mime_type) return failed(MediaFailure.UNREADABLE);
    const maxBytes = getEvidenceImageMaxBytes();
    if (info.file_size && info.file_size > maxBytes) return failed(MediaFailure.TOO_LARGE);

    const mediaResponse = await fetch(info.url, { headers });
    if (!mediaResponse.ok) return failed(MediaFailure.UNREADABLE);

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    if (buffer.length > maxBytes) return failed(MediaFailure.TOO_LARGE);
    return { dataUri: `data:${info.mime_type};base64,${buffer.toString("base64")}` };
  } catch (error) {
    logger.warn("whatsapp.media_failed", { error });
    return failed(MediaFailure.UNREADABLE);
  }
}
