import Landing from "@/app/components/Landing";
import SandboxWidgetDemo from "@/app/components/SandboxWidgetDemo";

type LandingWithChatProps = { loginUrl: string; imageMaxBytes: number; chatEnabled: boolean };

export default function LandingWithChat({ loginUrl, imageMaxBytes, chatEnabled }: LandingWithChatProps) {
  const landing = <Landing loginUrl={loginUrl} chatEnabled={chatEnabled} />;
  if (!chatEnabled) return landing;

  return <SandboxWidgetDemo imageMaxBytes={imageMaxBytes}>{landing}</SandboxWidgetDemo>;
}
