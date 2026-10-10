import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cyber-Mario AI Arena — Autonomous GPT-6 Decisions Agent",
  description: "Live autonomous AI benchmark playing Super Mario Bros Level 1-1 with OpenAI Decisions API (GPT-6 Luna), Gemini Flash, and Heuristic Solvers on Vercel.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
