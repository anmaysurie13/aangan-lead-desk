import type { Metadata } from "next";
import { Archivo_Black, Space_Grotesk, Space_Mono } from "next/font/google";
import "./globals.css";

const archivoBlack = Archivo_Black({ variable: "--font-archivo-black", weight: "400", subsets: ["latin"] });
const spaceGrotesk = Space_Grotesk({ variable: "--font-space-grotesk", weight: ["500", "600", "700"], subsets: ["latin"] });
const spaceMono = Space_Mono({ variable: "--font-space-mono", weight: ["400", "700"], subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Aangan Lead Desk",
  description: "Inbound phone enquiry desk for Aangan Studio",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${archivoBlack.variable} ${spaceGrotesk.variable} ${spaceMono.variable}`}>
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
