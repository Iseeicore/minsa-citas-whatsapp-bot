import { redirect } from "next/navigation";
import LandingWithChat from "@/app/components/LandingWithChat";
import { HEALTH_PATH, isSandboxPageEnabled } from "@/lib/config/sandbox-page";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";
import { isSandboxEnabled } from "@/lib/config/sandbox";
import { SANDBOX_PAGE_DESCRIPTION_TEXTS, SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { getLoginUrl } from "@/lib/integrations/minsa/wire";
import { currentServiceOffer } from "@/lib/services/service-offer";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: SANDBOX_PAGE_TITLE_TEXT,
    description: SANDBOX_PAGE_DESCRIPTION_TEXTS[currentServiceOffer()],
  };
}

export default function SandboxPage() {
  if (!isSandboxPageEnabled()) redirect(HEALTH_PATH);

  return <LandingWithChat loginUrl={getLoginUrl()} imageMaxBytes={getEvidenceImageMaxBytes()} chatEnabled={isSandboxEnabled()} />;
}
