// Shared by every Gemini call in this folder.

export const REQUEST_TIMEOUT_MS = 15_000;

export type GeminiGenerateContentBody = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};
