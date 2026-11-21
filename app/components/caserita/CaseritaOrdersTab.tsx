"use client";

import React, { useMemo } from "react";
import {
  formatBs,
  formatOrderCode,
  getDeliveryStatusCopy,
  getPaymentProtectionCopy,
  normalizeDeliveryStatusKey,
} from "@/app/lib/friendlyCopy";
import { ProtectedPurchaseBar } from "@/app/components/ProtectedPurchaseBar";
import { Delivery, Order } from "@/app/types/ecobanco";

interface CaseritaOrdersTabProps {
  deliveries: Delivery[];
  orderById: Map<string, Order>;
  isLoading: boolean;
  onRefresh: () => void;
}

/**
 * Pestaña "Mis Pedidos" para caseritas: muestra primero los pedidos activos
 * con su código corto #ECO-XXXX y el PIN de recojo para entregar al repartidor.
 */
export function CaseritaOrdersTab({
  deliveries,
  orderById,
  isLoading,
  onRefresh,
}: CaseritaOrdersTabProps) {
  const sortedDeliveries = useMemo(() => {
    const rank = (status?: string) => {
      const key = normalizeDeliveryStatusKey(status);
      if (key === "pending") return 0;
      if (key === "in_transit") return 1;
      return 2;
    };

    return [...deliveries].sort((a, b) => {
      const diff = rank(a.delivery_status) - rank(b.delivery_status);
      if (diff !== 0) return diff;
      return Date.parse(b.created_at || "") - Date.parse(a.created_at || "");
    });
  }, [deliveries]);

  return (
    <section
      id="mis-movimientos"
      aria-label="Mis pedidos"
      className="rounded-2xl eco-card p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-brand text-xl sm:text-2xl eco-text">
          📦 Mis Pedidos ({sortedDeliveries.length})
        </h2>
        <button
          type="button"
          disabled={isLoading}
          onClick={onRefresh}
          className="px-4 min-h-[48px] rounded-2xl eco-btn-ghost text-sm font-extrabold disabled:opacity-60 active:scale-95 transition"
        >
          {isLoading ? "Actualizando..." : "🔄 Actualizar"}
        </button>
      </div>

      {isLoading && sortedDeliveries.length === 0 ? (
        <div className="h-36 rounded-2xl eco-inset animate-pulse" />
      ) : sortedDeliveries.length === 0 ? (
        <div className="rounded-2xl eco-inset p-7 text-center space-y-2">
          <div className="text-4xl">🧺</div>
          <p className="text-base font-bold eco-text">
            Todavía no tienes pedidos nuevos
          </p>
          <p className="text-sm eco-text-muted leading-relaxed">
            Cuando un vecino compre de tu puesto, aparecerá aquí con tu código
            para entregar al repartidor.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDeliveries.map((del) => {
            const order = orderById.get(del.order_id);
            const delStatus = getDeliveryStatusCopy(del.delivery_status);
            const protection = getPaymentProtectionCopy(
              order?.status,
              del.delivery_status
            );
            const orderAmount = Math.round(
              Number(del.amount_motes ?? order?.amount_motes ?? 0)
            );
            const isDelivered = delStatus.key === "delivered";

            return (
              <article
                key={del.id}
                className="rounded-2xl eco-inset p-4 space-y-3.5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-extrabold eco-text-gold">
                        {formatOrderCode(
                          del.order_id || del.contract_id || order?.contract_id
                        )}
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full eco-alert-success text-xs font-extrabold uppercase">
                        {delStatus.label}
                      </span>
                    </div>
                    <h3 className="font-brand text-lg sm:text-xl eco-text leading-snug">
                      {(del.quantity ?? 1) > 1 ? `${del.quantity}x ` : ""}
                      {del.product_name}
                    </h3>
                    <p className="text-xs sm:text-sm eco-text-muted">
                      Vecino: <strong>{del.buyer_name || "Vecino"}</strong>
                      {del.rider_name
                        ? ` · Repartidor: ${del.rider_name}`
                        : ""}
                    </p>
                    {del.special_notes && (
                      <p className="text-xs font-semibold eco-card-gold rounded-xl px-3 py-2">
                        📝 <strong>Nota del cliente:</strong>{" "}
                        {del.special_notes}
                      </p>
                    )}
                  </div>

                  <div className="text-right shrink-0">
                    <span className="font-brand text-2xl eco-text-gold block">
                      +{formatBs(orderAmount)}
                    </span>
                    <span
                      className={`text-xs font-extrabold ${
                        protection.isReleased
                          ? "eco-text-green"
                          : "eco-text-gold"
                      }`}
                    >
                      {protection.sellerLabel}
                    </span>
                  </div>
                </div>

                <ProtectedPurchaseBar
                  deliveryStatus={del.delivery_status}
                  orderStatus={order?.status}
                  amountBs={orderAmount}
                  compact
                />

                {!isDelivered && del.pickup_pin && (
                  <div className="rounded-2xl eco-pin-box border-2 border-oro p-4 text-center space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-wider block">
                      🔑 Código de recojo para el repartidor:
                    </span>
                    <span className="block font-mono text-4xl font-bold tracking-[0.2em] eco-pin-digits">
                      {del.pickup_pin}
                    </span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
