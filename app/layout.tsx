import type { Metadata } from "next";
import "./globals.css";
import { PollarAppProvider } from "./providers/PollarAppProvider";

export const metadata: Metadata = {
  title: "EcoBanco Bolivia | Tu mercado del barrio, sin comisiones",
  description:
    "Tu mercado del barrio, sin comisiones y con entrega ecológica. Compra y vende en tu zona, recuperando nuestro valor en comunidad.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-bosque text-arena font-sans antialiased">
        <PollarAppProvider>{children}</PollarAppProvider>
      </body>
    </html>
  );
}
