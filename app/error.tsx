"use client";

import React, { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("EcoBanco error interceptado:", error);
  }, [error]);

  return (
    <div className="min-h-screen eco-page flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full eco-card p-8 rounded-2xl shadow-lg border border-[#e8dfcf] dark:border-[#385542] space-y-4">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-brote/20 border-2 border-brote/50 flex items-center justify-center text-3xl">
          🌱
        </div>
        <h2 className="font-brand text-2xl eco-text">
          Conectando con el mercado
        </h2>
        <p className="text-sm eco-text-muted leading-relaxed">
          Hubo una pequeña pausa en la conexión con la red comunitaria. Puedes volver a intentar o regresar al inicio.
        </p>
        <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
          <button
            type="button"
            onClick={() => reset()}
            className="px-6 py-2.5 rounded-full eco-btn-primary text-sm font-bold shadow-md hover:brightness-105 active:scale-95 transition-all"
          >
            Reintentar
          </button>
          <Link
            href="/"
            className="px-6 py-2.5 rounded-full eco-btn-ghost text-sm font-bold transition-all text-center"
          >
            Volver al Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
