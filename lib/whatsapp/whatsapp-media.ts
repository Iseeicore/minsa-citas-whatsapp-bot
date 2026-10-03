import { logger } from "@/lib/observability/logger";
import { graphApiBaseUrl, graphAuthHeaders } from "@/lib/whatsapp/graph-api";

const MAX_MEDIA_BYTES = 5 * 1024 * 1024;

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

export async function downloadWhatsAppMediaAsDataUri(mediaId: string): Promise<string | null> {
  const headers = graphAuthHeaders();

  try {
    const infoResponse = await fetch(`${graphApiBaseUrl()}/${mediaId}`, { headers });
    if (!infoResponse.ok) return null;

    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!info.url || !info.mime_type) return null;
    if (info.file_size && info.file_size > MAX_MEDIA_BYTES) return null;

    const mediaResponse = await fetch(info.url, { headers });
    if (!mediaResponse.ok) return null;

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    return `data:${info.mime_type};base64,${buffer.toString("base64")}`;
  } catch (error) {
    logger.warn("whatsapp.media_failed", { error });
    return null;
  }
}
