import React from "react";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-bosque text-arena font-sans flex flex-col justify-center px-5 py-6">
      <main className="w-full max-w-md sm:max-w-xl mx-auto space-y-6 sm:space-y-8 text-center">
        {/* 1. Logo EcoBanco (🌱) e Identidad */}
        <header className="flex flex-col items-center justify-center space-y-3">
          <div className="relative group">
            <div className="absolute -inset-2 rounded-full bg-gradient-to-tr from-oro via-brillo to-brote opacity-50 blur-lg transition duration-500" />
            <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-oro via-brillo to-madera p-1.5 shadow-gold-glow flex items-center justify-center">
              <div className="w-full h-full rounded-full bg-gradient-to-b from-madera via-[#4d2d14] to-bosque flex items-center justify-center shadow-inner border border-brillo/40">
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

          <div className="space-y-1">
            <h1 className="font-brand text-4xl sm:text-6xl text-transparent bg-clip-text bg-gradient-to-b from-brillo via-oro to-[#b87d14] drop-shadow-[0_4px_12px_rgba(224,162,48,0.35)] tracking-tight">
              EcoBanco
            </h1>
            <p className="text-xs font-extrabold uppercase tracking-[0.45em] text-arena pl-1.5">
              BOLIVIA
            </p>
          </div>
        </header>

        {/* 2. Titular Principal y Subtítulo */}
        <section className="space-y-2.5 px-1">
          <h2 className="font-brand text-2xl sm:text-3xl text-arena leading-snug drop-shadow">
            Tu mercado del barrio,{" "}
            <span className="text-brillo">
              sin comisiones y con entrega ecológica
            </span>
          </h2>
          <p className="text-sm sm:text-base font-semibold text-arena/90 leading-relaxed max-w-md mx-auto">
            Compra y vende en tu zona, recuperando nuestro valor en comunidad
          </p>
        </section>

        {/* 3. Dos Tarjetas Principales (Alto contraste bajo el sol, táctiles y claras) */}
        <section
          aria-label="Seleccionar Acción"
          className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-5 pt-1"
        >
          {/* Tarjeta 1: QUIERO VENDER -> /panel-caserita */}
          <Link
            href="/panel-caserita"
            className="group rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-oro via-brillo to-[#c58316] text-bosque shadow-gold-glow hover:brightness-105 active:scale-[0.98] transition-all duration-200 border-2 border-[#fff3cc]/80 flex flex-col items-center justify-center text-center space-y-3"
          >
            <div className="w-16 h-16 rounded-2xl bg-bosque/15 border border-bosque/25 flex items-center justify-center text-3xl">
              🏪
            </div>
            <div className="space-y-1.5">
              <span className="block font-brand text-2xl sm:text-3xl tracking-tight text-bosque">
                QUIERO VENDER
              </span>
              <p className="text-sm font-bold text-bosque leading-snug">
                Abre tu puesto digital gratis y recibe pedidos por WhatsApp
              </p>
            </div>
          </Link>

          {/* Tarjeta 2: QUIERO COMPRAR -> /marketplace */}
          <Link
            href="/marketplace"
            className="group rounded-2xl p-6 sm:p-8 bg-gradient-to-br from-[#1C3628] via-[#172C22] to-[#112019] text-arena shadow-green-glow hover:border-brote active:scale-[0.98] transition-all duration-200 border-2 border-brote flex flex-col items-center justify-center text-center space-y-3"
          >
            <div className="w-16 h-16 rounded-2xl bg-brote/25 border border-brote/60 flex items-center justify-center text-3xl">
              🛒
            </div>
            <div className="space-y-1.5">
              <span className="block font-brand text-2xl sm:text-3xl tracking-tight text-brillo">
                QUIERO COMPRAR
              </span>
              <p className="text-sm font-semibold text-arena leading-snug">
                Pide comida, abarrotes y productos de tus caseritas cercanas
              </p>
            </div>
          </Link>
        </section>

        {/* 4. Acceso para Repartidor de Barrio */}
        <footer className="pt-2">
          <Link
            href="/panel-rider"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#192A23] hover:bg-[#22382E] border-2 border-oro/45 hover:border-brillo text-sm font-bold text-arena hover:text-brillo transition-all"
          >
            <span aria-hidden="true">🚲</span>
            <span>Repartidor de Barrio (Bici / Moto Eléctrica)</span>
            <span aria-hidden="true" className="text-brillo font-extrabold">
              →
            </span>
          </Link>
        </footer>
      </main>
    </div>
  );
}
