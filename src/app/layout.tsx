import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { SocketProvider } from "@/lib/socket-context";
import { HostEngineListener } from "@/components/game/host-engine-listener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Football Historic Championship — Multiplayer",
  description: "Crie salas, monte times com lendas históricas e dispute campeonatos em tempo real com amigos e bots.",
  keywords: ["futebol", "histórico", "campeonato", "multiplayer", "draft", "bots"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        <SocketProvider>
          <HostEngineListener />
          {children}
        </SocketProvider>
        <Toaster />
        <SonnerToaster richColors position="top-center" />
      </body>
    </html>
  );
}
