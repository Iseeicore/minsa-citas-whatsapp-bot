import { redirect } from "next/navigation";
import SandboxWidgetDemo from "@/app/components/SandboxWidgetDemo";
import { HEALTH_PATH, isSandboxPageEnabled } from "@/lib/config/sandbox-page";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "MINSA Digital",
  description: "Agenda tu cita o registra una incidencia con el Ministerio de Salud del Perú.",
};

export default function SandboxPage() {
  if (!isSandboxPageEnabled()) redirect(HEALTH_PATH);

  return <SandboxWidgetDemo />;
}
