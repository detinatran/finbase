import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Leash — AI wallet agent",
  description: "An autonomous on-chain wallet agent that cannot go rogue: least privilege, a deterministic policy engine and an on-chain PolicyWallet.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
