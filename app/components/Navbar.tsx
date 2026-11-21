"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Navbar() {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Inicio" },
    { href: "/marketplace", label: "Quiero Comprar" },
    { href: "/panel-caserita", label: "Quiero Vender" },
    { href: "/perfil-usuario", label: "Mi Perfil" },
  ];

  return (
    <nav className="sticky top-0 z-40 w-full backdrop-blur-md bg-bosque/90 border-b border-oro/25">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-3 group">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-oro via-brillo to-madera p-0.5 shadow-gold-glow flex items-center justify-center">
            <div className="w-full h-full rounded-full bg-bosque flex items-center justify-center">
              <span className="text-xl group-hover:scale-110 transition-transform">
                🌱
              </span>
            </div>
          </div>
          <div className="leading-none">
            <span className="font-brand text-xl text-oro tracking-tight block">
              EcoBanco
            </span>
            <span className="text-[9px] font-bold uppercase tracking-[0.35em] text-arena/70 block">
              BOLIVIA
            </span>
          </div>
        </Link>

        {/* Navigation Links */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  isActive
                    ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow-sm"
                    : "text-arena/80 hover:text-brillo hover:bg-arena/5"
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
