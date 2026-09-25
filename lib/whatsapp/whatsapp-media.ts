// Downloads a real inbound WhatsApp media attachment as a base64 data URI.
// Two outbound calls — resolve media_id to a temporary signed URL, then
// fetch that URL — never an inbound request of several MB to a Vercel
// function, so Vercel's 4.5MB request-body limit (which forced the
// Sandbox's own upload flow to cap at 3MB client-side) doesn't apply here.
// Same fail-open discipline as lib/fsm/parsing/ai/ and lib/integrations/{minsa/,reniec.ts}: any
// network error, non-2xx response, or oversized file resolves to null
// instead of throwing — the webhook still owes Meta a fast 200.

const MAX_MEDIA_BYTES = 5 * 1024 * 1024; // WhatsApp's own cap for images

type MetaMediaInfo = {
  url?: string;
  mime_type?: string;
  file_size?: number;
};

export async function downloadWhatsAppMediaAsDataUri(mediaId: string): Promise<string | null> {
  const version = graphApiVersion();
  const bearer = `Bearer ${process.env.META_ACCESS_TOKEN}`;

  try {
    const infoResponse = await fetch(`https://graph.facebook.com/${version}/${mediaId}`, {
      headers: { Authorization: bearer },
    });
    if (!infoResponse.ok) return null;

    const info = (await infoResponse.json()) as MetaMediaInfo;
    if (!info.url || !info.mime_type) return null;
    if (info.file_size && info.file_size > MAX_MEDIA_BYTES) return null;

    const mediaResponse = await fetch(info.url, { headers: { Authorization: bearer } });
    if (!mediaResponse.ok) return null;

    const buffer = Buffer.from(await mediaResponse.arrayBuffer());
    return `data:${info.mime_type};base64,${buffer.toString("base64")}`;
  } catch (err) {
    console.error("downloadWhatsAppMediaAsDataUri: failed", err);
    return null;
  }
}import { graphApiVersion } from "@/lib/whatsapp/graph-api";

