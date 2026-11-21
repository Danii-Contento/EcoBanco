"use client";

import React from "react";
import { formatBs, formatOrderCode } from "@/app/lib/friendlyCopy";
import { Delivery, Order } from "@/app/types/ecobanco";

interface RiderAvailableListProps {
  deliveries: Delivery[];
  orderById: Map<string, Order>;
  isLoading: boolean;
  actionBusyId: string | null;
  onAcceptDelivery: (deliveryId: string) => void;
}

function buildMapsUrl(address?: string | null, label?: string | null): string {
  const query = [address, label, "Bolivia"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query || "La Paz Bolivia"
  )}`;
}

/**
 * Lista de entregas disponibles optimizada para uso con el pulgar (botones >= 56px).
 */
export function RiderAvailableList({
  deliveries,
  orderById,
  isLoading,
  actionBusyId,
  onAcceptDelivery,
}: RiderAvailableListProps) {
  return (
    <section aria-label="Pedidos Disponibles" className="space-y-4">
      {isLoading ? (
        <div className="h-40 rounded-2xl eco-inset animate-pulse" />
      ) : deliveries.length === 0 ? (
        <div className="rounded-2xl eco-card p-8 text-center space-y-2">
          <div className="text-4xl">🚲</div>
          <h2 className="font-brand text-xl eco-text">
            No hay pedidos disponibles por ahora
          </h2>
          <p className="text-sm eco-text-muted">
            Cuando un vecino haga un pedido en tu zona, aparecerá aquí para que
            lo recojas.
          </p>
        </div>
      ) : (
        deliveries.map((del) => {
          const order = orderById.get(del.order_id);
          const isBusy = actionBusyId === del.id;
          const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));

          return (
            <article
              key={del.id}
              className="rounded-2xl eco-card-gold p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <span className="font-mono text-xs font-extrabold eco-text-gold block">
                    {formatOrderCode(
                      del.order_id || del.contract_id || order?.contract_id
                    )}
                  </span>
                  <h2 className="font-brand text-xl sm:text-2xl eco-text leading-snug">
                    {(del.quantity ?? 1) > 1 ? `${del.quantity}x ` : ""}
                    {del.product_name}
                  </h2>
                </div>
                <div className="text-right shrink-0">
                  <span className="px-3.5 py-1.5 rounded-xl eco-alert-success text-lg font-brand block">
                    +{formatBs(feeBs)}
                  </span>
                </div>
              </div>

              <div className="rounded-2xl eco-inset p-3.5 space-y-2 text-sm">
                <p className="eco-text">
                  🏪 <strong>Recoger en:</strong> {del.seller_name}
                  {del.pickup_address ? ` (${del.pickup_address})` : ""}
                </p>
                <p className="eco-text">
                  📍 <strong>Entregar a:</strong> {del.buyer_name}
                  {del.delivery_address ? ` · ${del.delivery_address}` : ""}
                </p>
                {del.special_notes && (
                  <p className="text-xs font-semibold eco-card-gold rounded-lg px-2.5 py-1.5">
                    📝 <strong>Nota del pedido:</strong> {del.special_notes}
                  </p>
                )}
              </div>

              <div className="space-y-2.5">
                <a
                  href={buildMapsUrl(del.pickup_address, del.seller_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl eco-btn-ghost text-sm font-extrabold inline-flex items-center justify-center gap-2 transition active:scale-95"
                >
                  <span>🗺️ Ver ruta al puesto</span>
                </a>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => onAcceptDelivery(del.id)}
                  className="w-full min-h-[56px] py-4 px-5 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl tracking-wide shadow-gold-glow active:scale-95 transition disabled:opacity-60"
                >
                  {isBusy ? "Tomando pedido..." : "Tomar este Pedido →"}
                </button>
              </div>
            </article>
          );
        })
      )}
    </section>
  );
}
