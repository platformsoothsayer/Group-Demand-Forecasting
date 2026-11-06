import type { Metadata } from "next";
import { IBM_Plex_Sans } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { AppStateProvider } from "@/state/AppState";
import { Shell, LoadingShell } from "@/components/Shell";
import { GROUP_NAME } from "@/config";
import { cssVariables } from "@/theme/tokens";

const plex = IBM_Plex_Sans({
  variable: "--font-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: `Pronóstico de Demanda del Grupo | ${GROUP_NAME}`,
  description: "Demo de pronóstico de demanda con IA. Datos de ejemplo. Soothsayer Analytics.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-MX">
      <head>
        <style dangerouslySetInnerHTML={{ __html: cssVariables() }} />
      </head>
      <body className={`${plex.variable} antialiased`}>
        <Suspense fallback={<LoadingShell />}>
          <AppStateProvider>
            <Shell>{children}</Shell>
          </AppStateProvider>
        </Suspense>
      </body>
    </html>
  );
}
