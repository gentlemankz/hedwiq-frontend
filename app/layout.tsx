import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// Import LiveKit styles FIRST, then our overrides
import "@livekit/components-styles";
import "@livekit/components-styles/prefabs";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hedwiq - AI-Powered Meetings",
  description: "Next-generation agentic meeting application with native AI capabilities",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
