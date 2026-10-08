import type { Metadata } from "next";

// Every GrantRadar page (matches, funders, starred, history) is titled GrantRadar, not NomBot.
export const metadata: Metadata = {
  title: "GrantRadar",
  description: "Find the private foundations that already fund nonprofits like yours",
};

export default function GrantsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
