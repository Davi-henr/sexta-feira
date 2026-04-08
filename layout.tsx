import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sexta-feira",
  description: "Sua assistente virtual autônoma e proativa.",
  icons: { icon: "/favicon.ico" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Exo+2:wght@300;400;500;600;700&family=Share+Tech+Mono&family=DM+Sans:wght@300;400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-midnight text-white antialiased">{children}</body>
    </html>
  );
}
