"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/app/providers/ThemeProvider";

export default function Navbar() {
  const pathname = usePathname();
  const { theme, mounted, toggleTheme } = useTheme();
  const isDark = mounted && theme === "dark";

  const navItems = [
    { href: "/", matchPath: "/", label: "Inicio" },
    { href: "/marketplace", matchPath: "/marketplace", label: "Comprar" },
    {
      href: pathname === "/" ? "/panel-caserita?login=1" : "/panel-caserita",
      matchPath: "/panel-caserita",
      label: "Vender",
    },
    {
      href: pathname === "/" ? "/panel-rider?login=1" : "/panel-rider",
      matchPath: "/panel-rider",
      label: "Repartir",
    },
  ];

  return (
    <nav
      aria-label="Navegación principal"
      className="sticky top-0 z-40 w-full bg-surface/95 dark:bg-[#182822]/95 backdrop-blur-md border-b border-earth-border dark:border-oro/25 shadow-warm-card dark:shadow-none transition-colors duration-200"
    >
      {/* Franja superior identitaria de 4px ("hilo de aguayo") */}
      <div className="aguayo-thread" aria-hidden="true" />

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
        {/* Marca EcoBanco Bolivia */}
        <Link
          href="/"
          className="inline-flex items-center gap-3 min-h-[48px] group shrink-0"
        >
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sol via-aji to-primary dark:from-oro dark:via-brillo dark:to-madera p-0.5 shadow-sm dark:shadow-gold-glow flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-primary dark:bg-bosque flex items-center justify-center">
              <span
                className="text-xl group-hover:scale-110 transition-transform"
                aria-hidden="true"
              >
                🌱
              </span>
            </div>
          </div>
          <div className="leading-none">
            <span className="font-brand text-xl sm:text-2xl text-primary dark:text-brillo tracking-tight block">
              EcoBanco
            </span>
            <span className="text-[10px] font-extrabold uppercase tracking-[0.3em] text-ink-muted dark:text-arena/80 block mt-0.5">
              BOLIVIA
            </span>
          </div>
        </Link>

        {/* Interruptor Sol / Luna (Modo Ajayu Día <-> Modo Noche) */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-pressed={isDark}
          aria-label={
            isDark ? "Cambiar a Modo Ajayu (Día)" : "Cambiar a Modo Noche"
          }
          title={
            isDark ? "Cambiar a Modo Ajayu (Día)" : "Cambiar a Modo Noche"
          }
          className="order-2 md:order-3 inline-flex items-center justify-center gap-2 px-3.5 min-h-[48px] rounded-2xl border border-earth-border dark:border-oro/35 bg-surface-soft dark:bg-bosque/80 text-ink dark:text-arena text-sm sm:text-base font-bold hover:border-sol transition-all active:scale-95 shrink-0"
        >
          {isDark ? (
            <>
              <Sun className="w-5 h-5 text-brillo shrink-0" aria-hidden="true" />
              <span>Día</span>
            </>
          ) : (
            <>
              <Moon
                className="w-5 h-5 text-primary shrink-0"
                aria-hidden="true"
              />
              <span>Noche</span>
            </>
          )}
        </button>

        {/* Links de navegación táctiles */}
        <div className="order-3 md:order-2 w-full md:w-auto flex items-center gap-1.5 sm:gap-2 overflow-x-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.matchPath;
            return (
              <Link
                key={item.matchPath}
                href={item.href}
                className={`inline-flex items-center justify-center px-3.5 sm:px-4 min-h-[48px] rounded-2xl text-sm sm:text-base font-bold whitespace-nowrap transition-all ${
                  isActive
                    ? "bg-primary text-white dark:bg-gradient-to-r dark:from-oro dark:to-brillo dark:text-bosque shadow-sm"
                    : "text-ink-muted hover:text-ink hover:bg-surface-soft dark:text-arena/80 dark:hover:text-arena dark:hover:bg-bosque/60"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
