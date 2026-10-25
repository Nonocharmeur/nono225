import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nono — AI video studio",
  description: "Turn an idea or image into a short AI video."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="fr" suppressHydrationWarning><body>{children}</body></html>;
}
