"use client";

import React from "react";
import {
  COMMUNITY_COPY,
  getProtectedPurchaseSteps,
} from "@/app/lib/friendlyCopy";

interface ProtectedPurchaseBarProps {
  deliveryStatus?: string;
  orderStatus?: string;
  amountBs?: number;
  compact?: boolean;
}

export function ProtectedPurchaseBar({
  deliveryStatus,
  orderStatus,
  amountBs,
  compact = false,
}: ProtectedPurchaseBarProps) {
  const { currentStep, fillPercent, steps } = getProtectedPurchaseSteps({
    deliveryStatus,
    orderStatus,
    amountBs,
  });

  return (
    <div
      aria-label="Pago Protegido EcoBanco"
      className={`rounded-2xl eco-card-green ${
        compact ? "p-3 space-y-2.5" : "p-4 space-y-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider eco-text-green">
          🛡️ {COMMUNITY_COPY.protectedBadge}
        </span>
        <span className="px-2.5 py-0.5 rounded-full eco-alert-success text-[11px] font-bold">
          {COMMUNITY_COPY.zeroCommission}
        </span>
      </div>

      {/* Sello claro y humano de Pago Protegido EcoBanco */}
      <p className="text-xs sm:text-sm font-semibold eco-text leading-relaxed rounded-xl eco-inset px-3 py-2">
        {COMMUNITY_COPY.protectedSeal}
      </p>

      {/* Barra visual de progreso */}
      <div className="w-full h-2.5 rounded-full eco-inset overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-oro via-brillo to-brote transition-all duration-500"
          style={{ width: `${fillPercent}%` }}
        />
      </div>

      {/* 3 pasos de entrega barrial */}
      <ol className="space-y-2">
        {steps.map((step) => {
          const isComplete = step.done;
          const isCurrent =
            step.active || (!isComplete && step.num === currentStep);
          return (
            <li
              key={step.num}
              className={`flex items-start gap-2.5 text-xs leading-snug ${
                isComplete
                  ? "eco-text font-semibold"
                  : isCurrent
                  ? "eco-text-gold font-bold"
                  : "eco-text-muted"
              }`}
            >
              <span
                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                  isComplete
                    ? "bg-brote text-bosque"
                    : isCurrent
                    ? "bg-oro text-bosque"
                    : "eco-inset eco-text-muted"
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
