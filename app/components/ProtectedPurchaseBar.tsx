"use client";

import React from "react";

interface ProtectedPurchaseBarProps {
  deliveryStatus?: string;
  orderStatus?: string;
  amountBs?: number;
  compact?: boolean;
}

function resolveStep(deliveryStatus?: string, orderStatus?: string): 1 | 2 | 3 {
  const statusLower = (deliveryStatus || "").toLowerCase();
  if (statusLower === "delivered" || orderStatus === "RELEASED") {
    return 3;
  }
  if (statusLower === "in_transit") {
    return 2;
  }
  return 2; // Paso 1 ya quedó guardado al pagar; paso 2 está activo preparando el pedido
}

export function ProtectedPurchaseBar({
  deliveryStatus,
  orderStatus,
  amountBs,
  compact = false,
}: ProtectedPurchaseBarProps) {
  const statusLower = (deliveryStatus || "").toLowerCase();
  const isDelivered = statusLower === "delivered" || orderStatus === "RELEASED";
  const isInTransit = statusLower === "in_transit";
  const currentStep = resolveStep(deliveryStatus, orderStatus);

  const steps = [
    {
      num: 1,
      done: true,
      active: false,
      label:
        amountBs && amountBs > 0
          ? `Pago guardado de forma segura (${Math.round(amountBs)} Bs retenidos).`
          : "Pago guardado de forma segura (Bs retenidos).",
    },
    {
      num: 2,
      done: isInTransit || isDelivered,
      active: !isInTransit && !isDelivered,
      label: isInTransit
        ? "Pedido listo y en camino con tu repartidor ecológico."
        : "La caserita está preparando tu pedido.",
    },
    {
      num: 3,
      done: isDelivered,
      active: isInTransit && !isDelivered,
      label: "Pedido entregado → Pago liberado a la caserita.",
    },
  ];

  const fillPercent = isDelivered ? 100 : isInTransit ? 72 : 42;

  return (
    <div
      aria-label="Progreso de Compra Protegida"
      className={`rounded-2xl bg-[#0F1A16] border border-brote/45 ${
        compact ? "p-3 space-y-2.5" : "p-4 space-y-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-brote">
          🛡️ Compra Protegida
        </span>
        <span className="px-2.5 py-0.5 rounded-full bg-brote/15 border border-brote/40 text-[11px] font-bold text-arena">
          Comisión: 0 Bs — Cubierta por EcoBanco
        </span>
      </div>

      {!compact && (
        <p className="text-xs text-arena/90 leading-relaxed">
          Tu dinero se guarda seguro y solo pasa a la caserita cuando recibes tu
          pedido.
        </p>
      )}

      {/* Barra visual de progreso */}
      <div className="w-full h-2.5 rounded-full bg-bosque border border-arena/20 overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-oro via-brillo to-brote transition-all duration-500"
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {/* 3 pasos de delivery tradicional */}
      <ol className="space-y-2">
        {steps.map((step) => {
          const isComplete = step.done;
          const isCurrent = step.active || (!isComplete && step.num === currentStep);
          return (
            <li
              key={step.num}
              className={`flex items-start gap-2.5 text-xs leading-snug ${
                isComplete
                  ? "text-arena font-semibold"
                  : isCurrent
                  ? "text-brillo font-bold"
                  : "text-arena/70"
              }`}
            >
              <span
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                  isComplete
                    ? "bg-brote text-bosque"
                    : isCurrent
                    ? "bg-oro text-bosque"
                    : "bg-bosque border border-arena/30 text-arena/75"
                }`}
              >
                {isComplete ? "✓" : step.num}
              </span>
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
