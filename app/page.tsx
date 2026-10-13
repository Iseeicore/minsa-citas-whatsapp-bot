import { redirect } from "next/navigation";
import { homeDestination } from "@/lib/config/sandbox-page";

export const dynamic = "force-dynamic";

export default function Home() {
  redirect(homeDestination());
}
