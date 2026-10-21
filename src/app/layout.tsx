import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "FaceWise — Face-Powered Attendance",
  description:
    "Privacy-first face recognition attendance: on-device embeddings (InsightFace-family SFace) with an LBPH fallback, authoritative PostgreSQL records and full audit trail.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-200 antialiased">{children}</body>
    </html>
  );
}
