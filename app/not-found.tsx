import React from "react";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen eco-page flex flex-col items-center justify-center p-6 text-center font-sans">
      <div className="max-w-md w-full eco-card p-8 rounded-2xl shadow-lg border border-[#e8dfcf] dark:border-[#385542] space-y-4">
        <div className="text-4xl">🌱</div>
        <h2 className="font-brand text-2xl eco-text">
          Página no encontrada
        </h2>
        <p className="text-sm eco-text-muted leading-relaxed">
          El puesto o la sección que buscas no está disponible o cambió de lugar en el mercado.
        </p>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-block px-6 py-2.5 rounded-full eco-btn-primary text-sm font-bold shadow-md hover:brightness-105 transition-all"
          >
            Volver al Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
