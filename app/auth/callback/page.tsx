"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const AUTO_CLOSE_DELAY_MS = 1200;

export default function AuthCallbackPage() {
  const [hasError, setHasError] = useState<boolean>(false);
  const [showManualCloseHint, setShowManualCloseHint] =
    useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const receivedError = Boolean(
      params.get("error")?.trim() || params.get("error_description")?.trim()
    );

    if (receivedError) {
      setHasError(true);
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        window.close();
      } catch {
        // Algunos navegadores bloquean el cierre automático si la pestaña no lo permite
      }
    }, AUTO_CLOSE_DELAY_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const handleCloseTab = () => {
    try {
      window.close();
    } catch {
      // Ignora restricciones de cierre del navegador
    }
    setShowManualCloseHint(true);
  };

  return (
    <main className="flex-1 eco-page font-sans flex items-center justify-center px-4 py-10">
      <section
        aria-live="polite"
        className="w-full max-w-md rounded-3xl eco-card-gold p-6 sm:p-8 text-center space-y-5 shadow-warm-lg dark:shadow-gold-glow"
      >
        <div className="flex justify-center">
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center border-2 ${
              hasError
                ? "bg-aji/15 border-aji/40 text-aji dark:bg-red-900/30 dark:border-red-400/50 dark:text-red-200"
                : "bg-primary/15 border-primary/35 text-primary dark:bg-brote/20 dark:border-brote/50 dark:text-[#69D86E]"
            }`}
          >
            {hasError ? (
              <AlertCircle className="w-8 h-8" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="w-8 h-8" aria-hidden="true" />
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="font-brand text-2xl sm:text-3xl eco-text leading-tight">
            {hasError
              ? "No pudimos completar tu acceso"
              : "¡Acceso verificado!"}
          </h1>
          <p className="text-sm sm:text-base eco-text-muted leading-relaxed">
            {hasError
              ? "La verificación fue cancelada o no pudo completarse en este momento. Puedes volver a intentarlo desde EcoBanco."
              : "Tu confirmación se completó correctamente. Ya puedes cerrar esta pestaña y volver a EcoBanco para continuar."}
          </p>
        </div>

        <div className="space-y-2.5 pt-1">
          <button
            type="button"
            onClick={handleCloseTab}
            className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-base sm:text-lg shadow-gold-glow border border-[#fff3cc]/70 active:scale-[0.98] transition"
          >
            Cerrar esta pestaña
          </button>

          <Link
            href="/perfil-usuario"
            className="w-full min-h-[48px] px-5 py-3 rounded-2xl eco-btn-ghost text-sm font-extrabold inline-flex items-center justify-center transition"
          >
            Volver a Mi Libreta
          </Link>
        </div>

        {showManualCloseHint && (
          <p className="text-xs font-semibold eco-text-muted">
            Si tu navegador mantiene esta pestaña abierta, ciérrala manualmente y regresa a la pestaña anterior de EcoBanco.
          </p>
        )}
      </section>
    </main>
  );
}
