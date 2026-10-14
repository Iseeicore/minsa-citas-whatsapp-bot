import { redirect } from "next/navigation";
import SandboxWidgetDemo from "@/app/components/SandboxWidgetDemo";
import { HEALTH_PATH, isSandboxPageEnabled } from "@/lib/config/sandbox-page";
import { serviceCatalog } from "@/lib/services/service-catalog";
import { MenuChoice } from "@/lib/enums/menu-choice";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return {
    title: "MINSA Digital",
    description: serviceCatalog.isEnabled(MenuChoice.REGISTRAR_INCIDENCIA)
      ? "Agenda tu cita o registra una incidencia con el Ministerio de Salud del Perú."
      : "Agenda tu cita con el Ministerio de Salud del Perú.",
  };
}

export default function SandboxPage() {
  if (!isSandboxPageEnabled()) redirect(HEALTH_PATH);

  return <SandboxWidgetDemo />;
}
