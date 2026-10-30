import { redirect } from "next/navigation";
import VisorConsola from "@/app/configuracion-visor-sandbox/VisorConsola";
import { HEALTH_PATH, isSandboxPageEnabled } from "@/lib/config/sandbox-page";
import { evidenceImageMaxBytes } from "@/lib/config/evidence";

export const dynamic = "force-dynamic";

export default function ConfiguracionVisorSandboxPage() {
  if (!isSandboxPageEnabled()) redirect(HEALTH_PATH);

  return <VisorConsola imageMaxBytes={evidenceImageMaxBytes()} />;
}
