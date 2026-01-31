import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "La Réussite — Solitaire Tarot",
  description: "Jeu de solitaire adapté au Tarot à 78 cartes",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
