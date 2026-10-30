import type { Metadata } from "next";
import LandingWithChat from "@/app/components/LandingWithChat";
import { SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { getLoginUrl } from "@/lib/integrations/minsa/wire";
import { getEvidenceImageMaxBytes } from "@/lib/config/evidence";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: SANDBOX_PAGE_TITLE_TEXT };

export default function Home() {
  return <LandingWithChat loginUrl={getLoginUrl()} imageMaxBytes={getEvidenceImageMaxBytes()} />;
}
