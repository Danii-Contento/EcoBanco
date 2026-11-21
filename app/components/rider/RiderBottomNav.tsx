"use client";

import React from "react";

export type RiderTab = "disponibles" | "en_curso" | "ganancias";

interface RiderBottomNavProps {
  activeTab: RiderTab;
  availableCount: number;
  inProgressCount: number;
  completedCount: number;
  onSelectTab: (tab: RiderTab) => void;
}

/**
 * Barra inferior fija de navegación para uso a una mano con botones >= 56px.
 */
export function RiderBottomNav({
  activeTab,
  availableCount,
  inProgressCount,
  completedCount,
  onSelectTab,
}: RiderBottomNavProps) {
  return (
    <nav
      aria-label="Navegación de entregas"
      className="fixed bottom-0 inset-x-0 z-30 border-t border-earth-border dark:border-oro/30 bg-surface/95 dark:bg-[#14201C]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-warm-lg"
    >
      <div className="max-w-md sm:max-w-2xl mx-auto px-3 py-2 grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onSelectTab("disponibles")}
          className={`min-h-[60px] px-2 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
            activeTab === "disponibles"
              ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow"
              : "eco-btn-ghost"
          }`}
        >
          <span className="text-base leading-none" aria-hidden="true">
            📦
          </span>
          <span>Disponibles ({availableCount})</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab("en_curso")}
          className={`min-h-[60px] px-2 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition flex flex-col items-center justify-center gap-0.5 active:scale-95 relative ${
            activeTab === "en_curso"
              ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow"
              : inProgressCount > 0
              ? "eco-card-green font-extrabold"
              : "eco-btn-ghost"
          }`}
        >
          <span className="text-base leading-none" aria-hidden="true">
            🚲
          </span>
          <span>En Curso ({inProgressCount})</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab("ganancias")}
          className={`min-h-[60px] px-2 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition flex flex-col items-center justify-center gap-0.5 active:scale-95 ${
            activeTab === "ganancias"
              ? "bg-gradient-to-r from-oro via-brillo to-oro text-bosque shadow"
              : "eco-btn-ghost"
          }`}
        >
          <span className="text-base leading-none" aria-hidden="true">
            💵
          </span>
          <span>Ganancias ({completedCount})</span>
        </button>
      </div>
    </nav>
  );
}
