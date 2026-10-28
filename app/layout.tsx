import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "@/app/globals.css";
import { cn } from "@/lib/utils/cn";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const gotham = localFont({
  variable: "--ff-gotham",
  src: [
    { path: "./fonts/gotham-medium.otf", weight: "500" },
    { path: "./fonts/gotham-bold.otf", weight: "700" },
  ],
});

const montserrat = localFont({
  variable: "--ff-montserrat",
  src: "./fonts/montserrat-extrabold.otf",
  weight: "800",
});

const poppins = localFont({
  variable: "--ff-poppins",
  src: [
    { path: "./fonts/poppins-regular.ttf", weight: "400" },
    { path: "./fonts/poppins-medium.ttf", weight: "500" },
    { path: "./fonts/poppins-semibold.ttf", weight: "600" },
    { path: "./fonts/poppins-bold.ttf", weight: "700" },
  ],
});

export const metadata: Metadata = {
  title: "WhatsApp Inbox",
  description: "WhatsApp Business Cloud API web inbox MVP",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={cn(
        geistSans.variable,
        geistMono.variable,
        gotham.variable,
        montserrat.variable,
        poppins.variable,
        "h-full antialiased",
      )}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
