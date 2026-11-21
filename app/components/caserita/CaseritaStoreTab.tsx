"use client";

import React from "react";
import { formatBs } from "@/app/lib/friendlyCopy";
import { Product, User } from "@/app/types/ecobanco";

interface CaseritaStoreTabProps {
  merchant: User;
  products: Product[];
  isLoadingData: boolean;
  isStoreOpen: boolean;
  isTogglingOpen: boolean;
  currentMotes: number;
  subscriptionCost: number;
  motesProgressPct: number;
  libretaSlot?: React.ReactNode;
  onToggleStoreOpen: () => void;
  onOpenConfig: () => void;
  onOpenCreateProduct: () => void;
  onOpenEditProduct: (item: Product) => void;
  onDeleteProduct: (id: string) => void;
}

/**
 * Pestaña "Vender / Mi Puesto" para caseritas: estado abierto/cerrado,
 * progreso de Caserita Aliada, botón táctil para subir producto y catálogo.
 */
export function CaseritaStoreTab({
  merchant,
  products,
  isLoadingData,
  isStoreOpen,
  isTogglingOpen,
  currentMotes,
  subscriptionCost,
  motesProgressPct,
  libretaSlot,
  onToggleStoreOpen,
  onOpenConfig,
  onOpenCreateProduct,
  onOpenEditProduct,
  onDeleteProduct,
}: CaseritaStoreTabProps) {
  return (
    <div className="space-y-5">
      {/* Estado rápido del puesto */}
      <section
        aria-label="Estado del puesto"
        className={`rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${
          isStoreOpen ? "eco-card-green" : "eco-card"
        }`}
      >
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden="true">
              {isStoreOpen ? "🟢" : "🔴"}
            </span>
            <h2 className="font-brand text-lg sm:text-xl eco-text">
              {isStoreOpen ? "Puesto Abierto" : "Puesto Cerrado"}
            </h2>
          </div>
          <p className="text-xs sm:text-sm eco-text-muted">
            {isStoreOpen
              ? "Tus productos están visibles ahora en el Mercado del Barrio."
              : "Tu puesto está oculto temporalmente en el mercado."}
          </p>
        </div>

        <button
          type="button"
          disabled={isTogglingOpen}
          onClick={onToggleStoreOpen}
          className={`px-5 min-h-[56px] rounded-2xl font-extrabold text-sm sm:text-base transition active:scale-95 disabled:opacity-60 ${
            isStoreOpen
              ? "eco-btn-danger"
              : "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow-green-glow"
          }`}
        >
          {isTogglingOpen
            ? "Actualizando..."
            : isStoreOpen
            ? "Cerrar puesto"
            : "Abrir puesto"}
        </button>
      </section>

      {/* Libreta Comunitaria si está activa */}
      {libretaSlot}

      {/* Plan Gratuito o Caserita Aliada */}
      {!merchant.isProsumer ? (
        <section
          aria-label="Plan gratuito rumbo a Caserita Aliada"
          className="rounded-2xl eco-card-gold p-5 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="px-2.5 py-1 rounded-full eco-alert-success text-xs font-extrabold uppercase">
              🌱 Plan Gratuito
            </span>
            <span className="font-brand text-lg eco-text-gold">
              {currentMotes} / {subscriptionCost} MOTES
            </span>
          </div>

          <div className="w-full h-3.5 rounded-full eco-inset overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-brote via-oro to-brillo transition-all duration-500"
              style={{ width: `${motesProgressPct}%` }}
            />
          </div>

          <p className="text-sm eco-text leading-snug">
            Rumbo a <strong className="eco-text-gold">Caserita Aliada</strong>:
            llevas <strong>{currentMotes}</strong> de{" "}
            <strong>100 MOTES</strong> en ventas. Al llegar a 100 desbloqueas
            gratis tu{" "}
            <strong className="eco-text-green">
              cobro directo a QR bancario + 5 envíos ecológicos
            </strong>
            .
          </p>

          <button
            type="button"
            onClick={onOpenConfig}
            className="min-h-[48px] inline-flex items-center text-xs sm:text-sm font-extrabold eco-text-gold underline"
          >
            ¿Quieres activar Caserita Aliada hoy? Ver en Configuración →
          </button>
        </section>
      ) : (
        <section
          aria-label="Plan Caserita Aliada"
          className="rounded-2xl eco-card-green p-4 flex flex-wrap items-center justify-between gap-2"
        >
          <div>
            <span className="text-xs font-extrabold uppercase eco-text-green block">
              ⭐ Caserita Aliada Activa
            </span>
            <p className="text-xs sm:text-sm eco-text-muted">
              🚲 {merchant.free_deliveries_remaining ?? merchant.freeDeliveries ?? 0}{" "}
              envíos ecológicos disponibles ·{" "}
              {merchant.bankQrUrl
                ? "✅ QR bancario listo"
                : "Sube tu QR en ⚙️ Configuración"}
            </p>
          </div>
        </section>
      )}

      {/* Subir y gestionar productos */}
      <section
        aria-label="Subir y gestionar productos"
        className="space-y-4"
      >
        <button
          type="button"
          onClick={onOpenCreateProduct}
          className="w-full min-h-[56px] py-4 px-6 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl sm:text-2xl tracking-wide shadow-green-glow active:scale-[0.98] transition-all border-2 border-white/40"
        >
          + Subir Producto (3 pasos)
        </button>

        <div className="space-y-3">
          <h2 className="font-brand text-xl sm:text-2xl eco-text">
            Mis Productos ({products.length})
          </h2>

          {isLoadingData && products.length === 0 ? (
            <div className="h-32 rounded-2xl eco-inset animate-pulse" />
          ) : products.length === 0 ? (
            <div className="rounded-2xl eco-card p-7 text-center space-y-2">
              <div className="text-4xl">🧺</div>
              <p className="text-base font-bold eco-text">
                Todavía no subiste productos
              </p>
              <p className="text-sm eco-text-muted">
                Pulsa &ldquo;+ Subir Producto (3 pasos)&rdquo;, saca una foto,
                ponle nombre y precio en Bolivianos (Bs).
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {products.map((item) => (
                <article
                  key={item.id}
                  className="rounded-2xl eco-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3.5">
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-20 h-20 rounded-2xl object-cover border-2 border-oro/60 shrink-0"
                    />
                    <div className="space-y-0.5">
                      <span className="font-brand text-2xl eco-text-gold block">
                        {formatBs(item.priceMotes)}
                      </span>
                      <h3 className="font-brand text-lg eco-text leading-tight">
                        {item.name}
                      </h3>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-oro/15 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenEditProduct(item)}
                      className="px-4 min-h-[48px] rounded-xl eco-btn-ghost text-sm font-extrabold"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteProduct(item.id)}
                      className="px-4 min-h-[48px] rounded-xl eco-btn-danger text-sm font-extrabold"
                    >
                      Quitar
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
