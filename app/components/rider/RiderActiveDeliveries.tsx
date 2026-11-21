"use client";

import React from "react";
import {
  formatBs,
  formatOrderCode,
  normalizeDeliveryStatusKey,
} from "@/app/lib/friendlyCopy";
import { toWhatsAppDigits } from "@/app/lib/phone";
import { Delivery, Order } from "@/app/types/ecobanco";

interface RiderActiveDeliveriesProps {
  deliveries: Delivery[];
  orderById: Map<string, Order>;
  pinInputs: Record<string, string>;
  actionBusyId: string | null;
  onPinChange: (deliveryId: string, digits: string) => void;
  onValidatePickup: (deliveryId: string) => void;
  onValidateDelivery: (deliveryId: string) => void;
}

function buildMapsUrl(address?: string | null, label?: string | null): string {
  const query = [address, label, "Bolivia"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    query || "La Paz Bolivia"
  )}`;
}

/**
 * Vista de entregas en curso pensada para usarse con una mano en la calle:
 * botones táctiles >= 56px, acciones apiladas al ancho completo y cero exposición de PINs secretos.
 */
export function RiderActiveDeliveries({
  deliveries,
  orderById,
  pinInputs,
  actionBusyId,
  onPinChange,
  onValidatePickup,
  onValidateDelivery,
}: RiderActiveDeliveriesProps) {
  return (
    <section aria-label="Pedidos En Curso" className="space-y-4">
      {deliveries.length === 0 ? (
        <div className="rounded-2xl eco-card p-8 text-center space-y-2">
          <div className="text-4xl">🚲</div>
          <h2 className="font-brand text-xl eco-text">
            No tienes entregas en curso
          </h2>
          <p className="text-sm eco-text-muted">
            Toma un pedido en Disponibles para recogerlo donde la caserita y
            llevarlo al vecino.
          </p>
        </div>
      ) : (
        deliveries.map((del) => {
          const status = normalizeDeliveryStatusKey(del.delivery_status);
          const isBusy = actionBusyId === del.id;
          const order = orderById.get(del.order_id);
          const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));
          const sellerWaDigits = toWhatsAppDigits(del.seller_phone);
          const isPickupStep = status === "pending";
          const routeAddress = isPickupStep
            ? del.pickup_address
            : del.delivery_address;
          const routeLabel = isPickupStep ? del.seller_name : del.buyer_name;

          return (
            <article
              key={del.id}
              className="rounded-2xl eco-card-green p-4 sm:p-5 space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-extrabold eco-text-gold">
                      {formatOrderCode(
                        del.order_id || del.contract_id || order?.contract_id
                      )}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-oro text-bosque text-xs font-extrabold uppercase">
                      {status === "in_transit"
                        ? "🚲 En Camino al Vecino"
                        : "🏪 Recoger en Puesto"}
                    </span>
                  </div>
                  <h2 className="font-brand text-xl sm:text-2xl eco-text leading-snug">
                    {(del.quantity ?? 1) > 1 ? `${del.quantity}x ` : ""}
                    {del.product_name}
                  </h2>
                </div>
                <span className="font-brand text-xl eco-text-gold shrink-0">
                  +{formatBs(feeBs)}
                </span>
              </div>

              <div className="rounded-2xl eco-inset p-3.5 space-y-2 text-sm">
                <p className="eco-text">
                  🏪 <strong>Caserita:</strong> {del.seller_name}
                  {del.pickup_address ? ` · ${del.pickup_address}` : ""}
                </p>
                <p className="eco-text">
                  📍 <strong>Vecino:</strong> {del.buyer_name}
                  {del.delivery_address ? ` · ${del.delivery_address}` : ""}
                </p>
                {del.special_notes && (
                  <p className="text-xs font-semibold eco-card-gold rounded-lg px-2.5 py-1.5">
                    📝 <strong>Nota del pedido:</strong> {del.special_notes}
                  </p>
                )}
              </div>

              {/* Accesos rápidos a una mano para mapa y contacto */}
              <div
                className={`grid gap-2.5 ${
                  sellerWaDigits ? "grid-cols-2" : "grid-cols-1"
                }`}
              >
                <a
                  href={buildMapsUrl(routeAddress, routeLabel)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[48px] px-3 py-2.5 rounded-2xl eco-btn-ghost text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
                >
                  <span>
                    {isPickupStep ? "🗺️ Ir al Puesto" : "🗺️ Ir donde el Vecino"}
                  </span>
                </a>

                {sellerWaDigits && (
                  <a
                    href={`https://wa.me/${sellerWaDigits}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="min-h-[48px] px-3 py-2.5 rounded-2xl bg-[#25D366] text-bosque text-xs sm:text-sm font-extrabold inline-flex items-center justify-center gap-1.5 active:scale-95 transition"
                  >
                    <span>📲 WhatsApp Caserita</span>
                  </a>
                )}
              </div>

              {isPickupStep ? (
                <div className="rounded-2xl eco-pin-box border-2 border-oro p-4 sm:p-5 space-y-4">
                  <div className="text-center space-y-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-oro block">
                      Paso 1 · Al recoger en el puesto
                    </span>
                    <p className="text-base font-bold leading-snug">
                      Pídele el código de 4 números a tu caserita al recoger el
                      pedido.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-arena/15">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      aria-label="Código de 4 números de la caserita"
                      value={pinInputs[del.id] || ""}
                      onChange={(e) =>
                        onPinChange(del.id, e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="• • • •"
                      className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-bosque border-2 border-oro font-mono text-3xl font-bold tracking-[0.35em] text-center text-brillo"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onValidatePickup(del.id)}
                      className="w-full min-h-[56px] py-4 px-5 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-xl shadow-gold-glow active:scale-95 transition disabled:opacity-60"
                    >
                      {isBusy ? "Confirmando recojo..." : "Confirmar Recojo →"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl eco-pin-box border-2 border-brote p-4 sm:p-5 space-y-4">
                  <div className="text-center space-y-1.5">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-brote block">
                      Paso 2 · Al entregar al vecino
                    </span>
                    <p className="text-base font-bold leading-snug">
                      Pídele el código de 4 números al vecino al entregar el
                      pedido para cobrar tu envío.
                    </p>
                  </div>

                  <div className="space-y-3 pt-2 border-t border-arena/15">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={4}
                      aria-label="Código de 4 números del vecino"
                      value={pinInputs[del.id] || ""}
                      onChange={(e) =>
                        onPinChange(del.id, e.target.value.replace(/\D/g, ""))
                      }
                      placeholder="• • • •"
                      className="w-full min-h-[56px] px-4 py-3 rounded-2xl bg-bosque border-2 border-brote font-mono text-3xl font-bold tracking-[0.35em] text-center text-brillo"
                    />
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => onValidateDelivery(del.id)}
                      className="w-full min-h-[56px] py-4 px-5 rounded-2xl bg-gradient-to-r from-brote to-[#5cd060] text-bosque font-brand text-xl shadow-green-glow active:scale-95 transition disabled:opacity-60"
                    >
                      {isBusy
                        ? "Confirmando entrega..."
                        : "Confirmar Entrega y Cobrar ✓"}
                    </button>
                  </div>
                </div>
              )}
            </article>
          );
        })
      )}
    </section>
  );
}
