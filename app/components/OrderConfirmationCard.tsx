"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Copy, MessageCircle, ShieldCheck, X } from "lucide-react";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  formatOrderCode,
} from "@/app/lib/friendlyCopy";
import { buildWhatsAppOrderUrl } from "@/app/lib/phone";
import { ProtectedPurchaseBar } from "@/app/components/ProtectedPurchaseBar";
import { OnChainEscrowAuditLinks } from "@/app/components/OnChainEscrowAuditLinks";
import { Delivery, EscrowTransaction } from "@/app/types/ecobanco";

interface OrderConfirmationCardProps {
  receipt: EscrowTransaction;
  delivery: Delivery | null;
  sellerPhone?: string | null;
  deliveryAddress?: string;
  buyerName?: string;
  buyerPhone?: string;
  onDismiss?: () => void;
}

/**
 * Tarjeta de confirmación de pedido con código corto `#ECO-XXXX`, PIN de entrega
 * y botón opcional "Avisar por WhatsApp" con enlace `https://wa.me/` prellenado.
 */
export function OrderConfirmationCard({
  receipt,
  delivery,
  sellerPhone,
  deliveryAddress,
  buyerName,
  buyerPhone,
  onDismiss,
}: OrderConfirmationCardProps) {
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const orderCode = formatOrderCode(receipt.orderId || receipt.contractId);
  const resolvedAddress =
    delivery?.delivery_address || deliveryAddress || undefined;
  const resolvedSellerPhone = delivery?.seller_phone || sellerPhone || null;

  const whatsappUrl = buildWhatsAppOrderUrl({
    orderCode,
    productName: receipt.productName,
    quantity: receipt.quantity,
    totalBs: receipt.amountMotes,
    sellerName: receipt.sellerName,
    sellerPhone: resolvedSellerPhone,
    buyerName: receipt.buyerName || buyerName,
    buyerPhone,
    deliveryAddress: resolvedAddress,
    specialNotes: receipt.specialNotes,
  });

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(orderCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch {
      // Ignora error de portapapeles en navegadores restringidos
    }
  };

  return (
    <section
      aria-label="Confirmación de pedido"
      className="rounded-3xl bg-surface dark:bg-[#173023] border-2 border-primary dark:border-brote shadow-warm-lg dark:shadow-none p-5 sm:p-6 space-y-4 relative"
    >
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar resumen de pedido"
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-surface-soft dark:bg-bosque text-ink dark:text-arena flex items-center justify-center hover:bg-earth-border/60 transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {/* Código corto legible + sello Pago Protegido */}
      <div className="flex flex-wrap items-center gap-2 pr-10">
        <button
          type="button"
          onClick={() => void handleCopyCode()}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-2xl bg-sol/25 dark:bg-oro/20 border border-sol/50 dark:border-oro/50 font-mono text-base font-extrabold text-[#7A4700] dark:text-brillo active:scale-95 transition"
        >
          <span>{orderCode}</span>
          {copiedCode ? (
            <Check className="w-4 h-4 text-primary dark:text-[#69D86E]" />
          ) : (
            <Copy className="w-4 h-4" />
          )}
        </button>

        <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-primary/15 dark:bg-brote text-primary dark:text-bosque text-xs font-extrabold uppercase">
          <ShieldCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{COMMUNITY_COPY.protectedBadge}</span>
        </span>
      </div>

      {/* Resumen claro del pedido */}
      <div className="space-y-1.5">
        <h2 className="font-brand text-2xl text-ink dark:text-arena leading-tight">
          ¡Pedido confirmado!
        </h2>
        <p className="text-base text-ink dark:text-arena font-semibold">
          {(receipt.quantity ?? 1) > 1 ? `${receipt.quantity}x ` : ""}
          <strong>{receipt.productName}</strong> —{" "}
          <strong className="text-primary dark:text-brillo">
            {formatBs(receipt.amountMotes)}
          </strong>{" "}
          <span className="text-xs font-bold text-ink-muted dark:text-arena/75">
            ({formatMotes(receipt.amountMotes)})
          </span>
        </p>
        <p className="text-xs sm:text-sm text-ink-muted dark:text-arena/80 font-medium">
          Caserita: <strong>{receipt.sellerName}</strong>
          {resolvedAddress ? ` · 📍 ${resolvedAddress}` : ""}
        </p>
        {receipt.specialNotes && (
          <p className="text-xs font-semibold rounded-xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 px-3 py-2 text-ink dark:text-arena">
            📝 <strong>Nota para la caserita:</strong> {receipt.specialNotes}
          </p>
        )}
      </div>

      <ProtectedPurchaseBar
        deliveryStatus={delivery?.delivery_status}
        orderStatus={receipt.status}
        amountBs={receipt.amountMotes}
      />

      <OnChainEscrowAuditLinks
        contractId={receipt.contractId}
        engagementId={receipt.engagementId}
        fundTxHash={receipt.fundTxHash}
        releaseTxHash={receipt.releaseTxHash}
      />

      {/* PIN gigante de entrega para el repartidor */}
      {delivery?.delivery_pin && (
        <div className="rounded-2xl eco-pin-box border-2 border-oro p-4 text-center space-y-2">
          <span className="text-xs font-extrabold uppercase tracking-wider block">
            Dile este código al repartidor cuando recibas tu pedido:
          </span>
          <span className="block font-mono text-5xl font-bold tracking-[0.2em] eco-pin-digits">
            {delivery.delivery_pin}
          </span>
          <div className="pt-1 text-xs font-bold">
            {delivery.subsidized_by_reserve || delivery.used_free_delivery ? (
              <span className="inline-block px-3 py-1 rounded-lg bg-brote/25 border border-brote text-arena">
                🚲 Envío ecológico gratis incluido
              </span>
            ) : (
              <span className="inline-block px-3 py-1 rounded-lg bg-oro/20 border border-oro/60 text-brillo">
                🚲 Repartidor de barrio listo para recoger tu pedido
              </span>
            )}
          </div>
        </div>
      )}

      {/* Botón opcional Avisar por WhatsApp + enlace a Mi Libreta */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="min-h-[52px] px-4 py-3 rounded-2xl bg-[#25D366] hover:brightness-95 text-bosque font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition"
        >
          <MessageCircle className="w-5 h-5 shrink-0" aria-hidden="true" />
          <span>Avisar por WhatsApp</span>
        </a>

        <Link
          href="/perfil-usuario"
          className="min-h-[52px] px-4 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-brote dark:text-bosque font-extrabold text-sm inline-flex items-center justify-center gap-2 transition"
        >
          <span>Ver en Mi Libreta →</span>
        </Link>
      </div>
    </section>
  );
}
