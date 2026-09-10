import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Protektor — Training & Competence",
  description: "Onboarding, training and competence management for the shop floor.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
