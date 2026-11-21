"use client";

import React from "react";
import { useTheme } from "@/app/providers/ThemeProvider";

export function ThemeToggleSetting() {
  const { theme, mounted, setTheme } = useTheme();
  const isDark = mounted && theme === "dark";

  return (
    <div className="rounded-2xl eco-inset p-4 min-h-[64px] flex items-center justify-between gap-4">
      <div className="space-y-1">
        <span className="block text-base font-extrabold eco-text">
          {isDark ? "🌙 Modo Noche activado" : "☀️ Modo Ajayu (Día) activado"}
        </span>
        <p className="text-sm eco-text-muted leading-snug">
          El Modo Día viene por defecto con alto contraste bajo el sol. Puedes
          cambiar entre Modo Día y Modo Noche cuando prefieras.
        </p>
      </div>

      <button
        type="button"
        role="switch"
        aria-checked={isDark}
        aria-label={isDark ? "Cambiar a Modo Ajayu (Día)" : "Cambiar a Modo Noche"}
        onClick={() => setTheme(isDark ? "light" : "dark")}
        className={`relative inline-flex h-12 w-20 shrink-0 items-center rounded-full border-2 transition-colors ${
          isDark
            ? "bg-oro border-brillo"
            : "bg-primary border-primary-hover"
        }`}
      >
        <span
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm shadow transition-transform ${
            isDark ? "translate-x-9" : "translate-x-1"
          }`}
        >
          {isDark ? "🌙" : "☀️"}
        </span>
      </button>
    </div>
  );
}
