"use client";

import React from "react";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  formatOrderCode,
} from "@/app/lib/friendlyCopy";
import { Delivery, Order, Rider } from "@/app/types/ecobanco";

interface RiderEarningsTabProps {
  rider: Rider | null;
  completedDeliveries: Delivery[];
  orderById: Map<string, Order>;
  totalEarnedBs: number;
  subsidizedCount: number;
}

/**
 * Pestaña de ganancias e historial de entregas completadas del repartidor.
 */
export function RiderEarningsTab({
  rider,
  completedDeliveries,
  orderById,
  totalEarnedBs,
  subsidizedCount,
}: RiderEarningsTabProps) {
  return (
    <section aria-label="Mis Ganancias" className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-2xl eco-card-gold p-5">
          <span className="text-xs font-extrabold uppercase tracking-wider eco-text-muted block">
            Dinero Disponible (Bs)
          </span>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="font-brand text-4xl eco-text-gold">
              {totalEarnedBs}
            </span>
            <span className="text-lg font-extrabold eco-text-gold">Bs</span>
          </div>
          <p className="text-xs eco-text-green font-bold">
            🛡️ {COMMUNITY_COPY.zeroCommission}
          </p>
          <p className="text-xs eco-text-muted mt-1">
            🚲 {subsidizedCount} entregas cubiertas por EcoBanco
          </p>
        </div>

        <div className="rounded-2xl eco-card-green p-5">
          <span className="text-xs font-extrabold uppercase tracking-wider eco-text-green block">
            Puntos de Trueque (MOTES)
          </span>
          <div className="my-2 flex items-baseline gap-1.5">
            <span className="font-brand text-4xl eco-text-green">
              {totalEarnedBs}
            </span>
            <span className="text-sm font-extrabold eco-text-green uppercase">
              MOTES
            </span>
          </div>
          <p className="text-xs font-bold eco-text">
            {COMMUNITY_COPY.moteParityDetail}
          </p>
          <p className="text-xs eco-text-muted mt-1">
            {rider?.completedDeliveries ?? 0} entregas completadas
          </p>
        </div>
      </div>

      <div className="rounded-2xl eco-card p-5 space-y-3.5">
        <h2 className="font-brand text-xl eco-text">
          Historial de Entregas ({completedDeliveries.length})
        </h2>

        {completedDeliveries.length === 0 ? (
          <p className="text-sm eco-text-muted">
            Completa tu primera entrega confirmando el código con el vecino para
            ver aquí tus ganancias en Bolivianos (Bs).
          </p>
        ) : (
          <div className="space-y-2.5">
            {completedDeliveries.map((del) => {
              const order = orderById.get(del.order_id);
              const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));
              return (
                <div
                  key={del.id}
                  className="p-4 rounded-xl eco-inset space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="font-mono text-xs font-bold eco-text-gold block">
                        {formatOrderCode(
                          del.order_id || del.contract_id || order?.contract_id
                        )}{" "}
                        · ✅ Entregado
                      </span>
                      <h3 className="font-bold text-sm eco-text">
                        {(del.quantity ?? 1) > 1 ? `${del.quantity}x ` : ""}
                        {del.product_name}
                      </h3>
                      <p className="text-xs eco-text-muted">
                        {del.seller_name} → {del.buyer_name}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-brand text-xl eco-text-gold block">
                        +{formatBs(feeBs)}
                      </span>
                      <span className="text-xs font-bold eco-text-green">
                        +{formatMotes(feeBs)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
