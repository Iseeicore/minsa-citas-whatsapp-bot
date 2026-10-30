import type { Metadata } from "next";
import Landing from "@/app/components/Landing";
import SandboxWidgetDemo from "@/app/components/SandboxWidgetDemo";
import { SANDBOX_PAGE_TITLE_TEXT } from "@/lib/constants/textos/menu";
import { loginUrl } from "@/lib/integrations/minsa/wire";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: SANDBOX_PAGE_TITLE_TEXT };

export default function Home() {
  return (
    <SandboxWidgetDemo>
      <Landing loginUrl={loginUrl()} />
    </SandboxWidgetDemo>
  );
}
