import Landing from "@/app/components/Landing";
import SandboxWidgetDemo from "@/app/components/SandboxWidgetDemo";

export default function LandingWithChat({ loginUrl, imageMaxBytes }: { loginUrl: string; imageMaxBytes: number }) {
  return (
    <SandboxWidgetDemo imageMaxBytes={imageMaxBytes}>
      <Landing loginUrl={loginUrl} />
    </SandboxWidgetDemo>
  );
}
