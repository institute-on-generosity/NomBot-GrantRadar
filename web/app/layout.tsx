import type { Metadata, Viewport } from "next";
import { Geist_Mono } from "next/font/google";
import { Sidebar } from "@/components/Sidebar";
import "./globals.css";

// UI type is the system font (SF on Apple devices); mono only for raw IRS records.
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GrantRadar",
  description: "Find the private foundations that already fund nonprofits like yours",
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }],
};

export default function RootLayout({ children, panel }: LayoutProps<"/">) {
  return (
    <html lang="en" className={geistMono.variable}>
      <body>
        <div className="shell">
          <Sidebar />
          <div className="content">{children}</div>
          {panel}
        </div>
      </body>
    </html>
  );
}
