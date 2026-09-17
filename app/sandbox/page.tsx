import Sandbox from "@/app/components/Sandbox";

export const metadata = {
  title: "MINSA Digital",
  description: "Agenda tu cita o registra un reclamo con el Ministerio de Salud del Perú.",
};

export default function SandboxPage() {
  return (
    <div className="h-screen bg-gray-100">
      <Sandbox showDebugPanel={false} />
    </div>
  );
}
