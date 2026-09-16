// Driven port for downloading a citizen-submitted WhatsApp media attachment
// via Meta's Graph API two-hop flow (design D21, spec's "WhatsApp Media
// Download for Photo Attachment" requirement). One HTTP implementation owned
// by infrastructure (src/adapters/meta-media-downloader.ts).
export interface DownloadedMedia {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface WhatsappMediaDownloader {
  /** Downloads a citizen-submitted media attachment by its Meta media id (InboundConversationEvent.mediaId). */
  download(mediaId: string): Promise<DownloadedMedia>;
}
