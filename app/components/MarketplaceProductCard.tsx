"use client";

import React from "react";
import { ArrowRight, Bike, Clock, MapPin, Store } from "lucide-react";
import { formatBs, formatMotes } from "@/app/lib/friendlyCopy";
import {
  extractNeighborhoodZone,
  getCategoryOption,
  inferProductCategory,
} from "@/app/lib/marketplaceFilters";
import { Product } from "@/app/types/ecobanco";

interface MarketplaceProductCardProps {
  product: Product;
  disabled?: boolean;
  onOrderClick: (product: Product) => void;
}

/**
 * Tarjeta grande de producto diseñada para uso táctil con el pulgar (Modo Día Ajayu + Modo Noche).
 */
export function MarketplaceProductCard({
  product,
  disabled = false,
  onOrderClick,
}: MarketplaceProductCardProps) {
  const category = inferProductCategory(product);
  const categoryOption = getCategoryOption(category);
  const zoneLabel =
    extractNeighborhoodZone(product.sellerAddress) || "Barrio local";
  const hasFreeDelivery = Number(product.sellerFreeDeliveries ?? 0) > 0;

  return (
    <article className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/30 shadow-warm-card hover:shadow-warm-lg dark:shadow-none overflow-hidden flex flex-col transition-all duration-200">
      {/* Foto nítida protagonista */}
      <div className="relative bg-surface-soft dark:bg-[#14221D]">
        {product.imageUrl ? (
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-60 sm:h-64 object-cover border-b border-earth-border dark:border-oro/20"
          />
        ) : (
          <div className="w-full h-44 flex flex-col items-center justify-center gap-2 border-b border-earth-border dark:border-oro/20">
            <span className="text-5xl" aria-hidden="true">
              {categoryOption.emoji}
            </span>
            <span className="text-xs font-extrabold uppercase tracking-wider text-ink-muted dark:text-arena/70">
              {categoryOption.label}
            </span>
          </div>
        )}

        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
          <span className="px-3 py-1.5 rounded-full bg-bosque/90 border border-brote/80 text-xs font-extrabold text-arena shadow">
            🟢 Abierto
          </span>
          <span className="px-3 py-1.5 rounded-full bg-surface/95 dark:bg-bosque/90 border border-earth-border dark:border-oro/40 text-xs font-extrabold text-ink dark:text-arena shadow">
            {categoryOption.emoji} {categoryOption.label}
          </span>
        </div>

        {hasFreeDelivery && (
          <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-sol dark:bg-oro text-ink dark:text-bosque text-xs font-extrabold shadow">
            <Bike className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>Envío gratis</span>
          </span>
        )}
      </div>

      <div className="p-4 sm:p-5 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3.5">
          {/* Caserita + Zona / Barrio */}
          <div className="flex items-start gap-3">
            {product.sellerAvatarUrl ? (
              <img
                src={product.sellerAvatarUrl}
                alt={product.sellerName}
                className="w-12 h-12 rounded-2xl object-cover border-2 border-sol dark:border-oro shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 flex items-center justify-center text-primary dark:text-brillo shrink-0">
                <Store className="w-6 h-6" aria-hidden="true" />
              </div>
            )}

            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm sm:text-base font-extrabold text-primary dark:text-[#69D86E] truncate">
                  {product.sellerName}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 text-ink dark:text-arena">
                  <MapPin
                    className="w-3.5 h-3.5 text-aji dark:text-brillo shrink-0"
                    aria-hidden="true"
                  />
                  <span>{product.sellerAddress || zoneLabel}</span>
                </span>

                {product.sellerSchedule && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-soft dark:bg-[#14221D] text-ink-muted dark:text-arena/80">
                    <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>{product.sellerSchedule}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Nombre y descripción del producto */}
          <div className="space-y-1">
            <h2 className="font-brand text-2xl text-ink dark:text-arena leading-tight">
              {product.name}
            </h2>
            {product.description && (
              <p className="text-sm sm:text-base text-ink-muted dark:text-arena/80 leading-relaxed line-clamp-2">
                {product.description}
              </p>
            )}
          </div>
        </div>

        {/* Precio destacado en Bs + equivalencia en MOTES y CTA para el pulgar */}
        <div className="pt-3.5 border-t border-earth-border dark:border-oro/20 flex items-end justify-between gap-3">
          <div className="space-y-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider text-ink-muted dark:text-arena/70">
              Precio del barrio
            </span>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-brand text-3xl text-ink dark:text-brillo leading-none">
                {formatBs(product.priceMotes)}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-sol/20 dark:bg-oro/20 border border-sol/40 dark:border-oro/40 text-xs font-extrabold text-[#8A5100] dark:text-brillo">
                = {formatMotes(product.priceMotes)}
              </span>
            </div>
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() => onOrderClick(product)}
            className="min-h-[54px] px-5 sm:px-6 rounded-2xl bg-aji hover:bg-aji-hover text-white dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-base sm:text-lg shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition-all disabled:opacity-60 inline-flex items-center gap-2 shrink-0"
          >
            <span>Pedir ahora</span>
            <ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" />
          </button>
        </div>
      </div>
    </article>
  );
}
