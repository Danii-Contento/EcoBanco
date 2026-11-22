import React from "react";
import Link from "next/link";
import { ArrowRight, Bike, ShoppingBasket, Store, User } from "lucide-react";
import { SessionResetOnHome } from "@/app/components/SessionResetOnHome";

export default function LandingPage() {
  return (
    <div className="flex-1 eco-page font-sans flex flex-col justify-center px-4 sm:px-6 py-8 sm:py-12">
      <SessionResetOnHome />

      <main className="w-full max-w-5xl mx-auto space-y-8 sm:space-y-10">
        {/* 1. Encabezado / Hero con Identidad Ajayu */}
        <header className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center justify-center relative">
            <div
              className="absolute -inset-2 rounded-full bg-gradient-to-tr from-sol via-aji to-primary dark:from-oro dark:via-brillo dark:to-brote opacity-30 blur-lg"
              aria-hidden="true"
            />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-aguayo-fucsia via-sol to-primary dark:from-oro dark:via-brillo dark:to-madera p-1.5 shadow-warm-card dark:shadow-gold-glow flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-primary dark:bg-bosque flex items-center justify-center border border-white/30 dark:border-brillo/40">
                <span
                  className="text-4xl sm:text-5xl select-none"
                  role="img"
                  aria-label="Brote EcoBanco"
                >
                  🌱
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface dark:bg-surface border border-earth-border dark:border-oro/35 shadow-sm text-sm font-bold text-primary dark:text-brillo">
              <span>☀️ Mercado barrial solidario · 0 Bs de comisión</span>
            </span>

            <h1 className="font-brand text-4xl sm:text-5xl lg:text-6xl text-ink dark:text-brillo tracking-tight leading-tight">
              EcoBanco{" "}
              <span className="text-primary dark:text-oro">Bolivia</span>
            </h1>

            <p className="font-brand text-xl sm:text-2xl lg:text-3xl text-aji dark:text-arena leading-snug">
              Recuperando nuestro valor en comunidad
            </p>
          </div>

          <p className="text-base sm:text-lg font-medium text-ink-muted dark:text-arena/85 leading-relaxed max-w-xl mx-auto">
            Compra comida y productos frescos de tu barrio, vende desde tu
            puesto sin cobros extra y realiza entregas ecológicas en bici o moto.
          </p>
        </header>

        {/* 2. Tres Tarjetas Claras y Humanas (Alto contraste bajo el sol, táctiles >= 48px) */}
        <section
          aria-label="¿Qué quieres hacer hoy?"
          className="grid grid-cols-1 md:grid-cols-3 gap-5"
        >
          {/* Tarjeta 1: Comprar a mis caseritas (Verde Altiplano #1A6B4E) */}
          <Link
            href="/marketplace"
            className="group rounded-2xl bg-surface dark:bg-[#173023] border-2 border-earth-border dark:border-brote/50 hover:border-primary dark:hover:border-brote shadow-warm-card hover:shadow-warm-lg dark:shadow-none p-6 flex flex-col justify-between gap-5 transition-all duration-200 active:scale-[0.99]"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-14 h-14 rounded-2xl bg-primary/12 dark:bg-brote/20 border border-primary/25 dark:border-brote/45 flex items-center justify-center text-primary dark:text-[#69D86E]">
                  <ShoppingBasket className="w-7 h-7" aria-hidden="true" />
                </div>
                <span className="px-3 py-1 rounded-full bg-primary/10 dark:bg-brote/20 text-primary dark:text-[#69D86E] text-sm font-bold">
                  Explora libre
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="font-brand text-2xl text-ink dark:text-arena leading-snug">
                  Comprar a mis caseritas
                </h2>
                <p className="text-base text-ink-muted dark:text-arena/85 leading-relaxed">
                  Explora puestos abiertos en tu barrio y protege tus compras
                  con tu WhatsApp y PIN de 4 números.
                </p>
              </div>
            </div>

            <div className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-primary group-hover:bg-primary-hover dark:bg-brote dark:group-hover:brightness-105 text-white dark:text-bosque text-base font-bold flex items-center justify-between gap-2 transition-colors">
              <span>Ver puestos abiertos</span>
              <ArrowRight
                className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform"
                aria-hidden="true"
              />
            </div>
          </Link>

          {/* Tarjeta 2: Vender desde mi puesto (Ladrillo alteño / Ají #D9532F -> Login directo) */}
          <Link
            href="/panel-caserita?login=1"
            className="group rounded-2xl bg-surface dark:bg-[#1D2B24] border-2 border-earth-border dark:border-oro/50 hover:border-aji dark:hover:border-brillo shadow-warm-card hover:shadow-warm-lg dark:shadow-none p-6 flex flex-col justify-between gap-5 transition-all duration-200 active:scale-[0.99]"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-14 h-14 rounded-2xl bg-aji/12 dark:bg-oro/20 border border-aji/25 dark:border-oro/45 flex items-center justify-center text-aji dark:text-brillo">
                  <Store className="w-7 h-7" aria-hidden="true" />
                </div>
                <span className="px-3 py-1 rounded-full bg-aji/10 dark:bg-oro/20 text-aji dark:text-brillo text-sm font-bold">
                  Puesto gratis
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="font-brand text-2xl text-ink dark:text-arena leading-snug">
                  Vender desde mi puesto
                </h2>
                <p className="text-base text-ink-muted dark:text-arena/85 leading-relaxed">
                  Ingresa a tu puesto digital gratis, sube fotos y recibe
                  pedidos sin comisiones.
                </p>
              </div>
            </div>

            <div className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-aji group-hover:bg-aji-hover dark:bg-gradient-to-r dark:from-oro dark:to-brillo text-white dark:text-bosque text-base font-bold flex items-center justify-between gap-2 transition-all">
              <span>Ingresar a mi puesto</span>
              <ArrowRight
                className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform"
                aria-hidden="true"
              />
            </div>
          </Link>

          {/* Tarjeta 3: Entregar en bici/moto (Sol / MOTES #E5A024 -> Login directo) */}
          <Link
            href="/panel-rider?login=1"
            className="group rounded-2xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/40 hover:border-sol dark:hover:border-brillo shadow-warm-card hover:shadow-warm-lg dark:shadow-none p-6 flex flex-col justify-between gap-5 transition-all duration-200 active:scale-[0.99]"
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div className="w-14 h-14 rounded-2xl bg-sol/20 dark:bg-oro/15 border border-sol/40 dark:border-oro/40 flex items-center justify-center text-[#9A5B00] dark:text-brillo">
                  <Bike className="w-7 h-7" aria-hidden="true" />
                </div>
                <span className="px-3 py-1 rounded-full bg-sol/20 dark:bg-oro/20 text-[#7A4700] dark:text-brillo text-sm font-bold">
                  Entrega verde
                </span>
              </div>

              <div className="space-y-2">
                <h2 className="font-brand text-2xl text-ink dark:text-arena leading-snug">
                  Entregar en bici/moto
                </h2>
                <p className="text-base text-ink-muted dark:text-arena/85 leading-relaxed">
                  Ingresa como repartidor de barrio, toma envíos cercanos y gana
                  directo en tu libreta.
                </p>
              </div>
            </div>

            <div className="w-full min-h-[48px] px-5 py-3 rounded-2xl bg-sol group-hover:brightness-95 dark:bg-bosque dark:border dark:border-oro/60 text-ink dark:text-brillo text-base font-bold flex items-center justify-between gap-2 transition-all">
              <span>Ingresar como repartidor</span>
              <ArrowRight
                className="w-5 h-5 shrink-0 group-hover:translate-x-1 transition-transform"
                aria-hidden="true"
              />
            </div>
          </Link>
        </section>

        {/* 3. Acceso secundario para revisar pedidos como vecino */}
        <footer className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            href="/perfil-usuario"
            className="inline-flex items-center justify-center gap-2.5 px-6 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 hover:border-sol text-ink dark:text-arena text-base font-bold shadow-warm-card dark:shadow-none transition-all active:scale-95"
          >
            <User
              className="w-5 h-5 text-primary dark:text-brillo shrink-0"
              aria-hidden="true"
            />
            <span>Mis pedidos / Mi perfil</span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
