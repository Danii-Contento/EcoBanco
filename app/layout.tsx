import type { Metadata } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import { PollarAppProvider } from "./providers/PollarAppProvider";
import { ThemeProvider } from "./providers/ThemeProvider";

export const metadata: Metadata = {
  title: "EcoBanco Bolivia | Recuperando nuestro valor en comunidad",
  description:
    "Tu mercado del barrio en Bolivia, sin comisiones y con entrega ecológica. Recuperando nuestro valor en comunidad.",
};

const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem('ecobanco_theme');var m=t==='dark'?'dark':'light';document.documentElement.dataset.theme=m;if(m==='dark'){document.documentElement.classList.add('dark');}else{document.documentElement.classList.remove('dark');}}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" data-theme="light" suppressHydrationWarning>
      <body className="min-h-screen eco-page font-sans text-base antialiased flex flex-col">
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
          suppressHydrationWarning
        />
        <ThemeProvider>
          <PollarAppProvider>
            <Navbar />
            <div className="flex-1 flex flex-col">{children}</div>
          </PollarAppProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
