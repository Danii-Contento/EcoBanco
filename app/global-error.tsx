"use client";

import React, { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("EcoBanco Global Error:", error);
  }, [error]);

  return (
    <html lang="es">
      <body className="min-h-screen bg-[#fcfaf5] text-[#2c2416] flex flex-col items-center justify-center p-6 text-center font-sans">
        <div className="max-w-md w-full bg-white border border-[#e8dfcf] p-8 rounded-2xl shadow-md space-y-4">
          <div className="text-4xl">🌱</div>
          <h2 className="text-2xl font-bold text-[#143d2b]">
            EcoBanco Bolivia
          </h2>
          <p className="text-sm text-[#665e52]">
            Estamos reconectando el mercado del barrio. Por favor presiona reintentar o recarga la página.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-2.5 rounded-full bg-[#1b4d36] text-white text-sm font-bold shadow hover:bg-[#143d2b] transition-all"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
