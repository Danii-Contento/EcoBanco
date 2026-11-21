"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RampWidget, usePollar } from "@pollar/react";
import type { RampOrder } from "@pollar/core";
import {
  ensurePollarWalletAndSync,
  ensurePollarWalletProvisioned,
  extractCompletedRampOrder,
  formatShortStellarAddress,
} from "@/app/lib/pollarWallet";
import { User } from "@/app/types/ecobanco";

export type RampPurpose =
  | "fiat_topup"
  | "prosumer_subscription"
  | "merchant_premium";

export interface RampCreditedEvent {
  pollarOrderId: string;
  creditedBs: number;
  message: string;
  buyer?: User;
  merchant?: User | null;
}

export interface RampPendingEvent {
  pollarOrderId: string;
  state: RampOrder["state"];
  amountBs: number;
}

interface BankQrRechargeModalProps {
  open: boolean;
  role: "buyer" | "merchant";
  userId?: string;
  purpose: RampPurpose;
  amountBs?: number;
  subtitle?: string;
  onClose: () => void;
  onRampCredited?: (event: RampCreditedEvent) => void;
  onRampPending?: (event: RampPendingEvent) => void;
  onRampError?: (message: string) => void;
}

const TEXT_REPLACEMENTS: Array<[RegExp, string]> = [
  [/Comprar\s+cripto|Buy\s+crypto/gi, "Cargar saldo con QR de tu Banco"],
  [/Vender\s+cripto|Sell\s+crypto/gi, "Retirar saldo en Bolivianos"],
  [
    /Elige\s+qué\s+recibes\s+y\s+cuánto\s+pagas/gi,
    "Ingresa el monto en Bolivianos (Bs) para generar tu QR bancario",
  ],
  [/Ya\s+pagué|I've\s+paid/gi, "Ya hice la transferencia"],
  [/QR\s+de\s+pago|Payment\s+QR/gi, "Escanea o descarga el QR de tu Banco"],
  [/\bBOB\b/g, "Bs"],
  [/\bUSDC\b/gi, "Bs"],
  [/\bStellar\b/gi, "EcoBanco"],
  [/\bPollar\b/gi, "EcoBanco"],
  [/\btrustline\b/gi, "activación"],
  [/\bcripto\b|\bcrypto\b/gi, "saldo"],
  [/\bswap\b/gi, "transferencia"],
  [/\bnetwork\b/gi, "conexión"],
  [/billetera/gi, "libreta digital"],
  [/\bwallet\b/gi, "libreta digital"],
];

function sanitizeText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function downloadQrElement(container: HTMLElement) {
  const img = container.querySelector("img");
  if (img && img.src) {
    const link = document.createElement("a");
    link.href = img.src;
    link.download = "ecobanco-qr-pago.png";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    return;
  }

  const svg = container.querySelector("svg");
  if (svg) {
    const serialized = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([serialized], {
      type: "image/svg+xml;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ecobanco-qr-pago.svg";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

function enhancePollarRampDom(subtitleText: string) {
  const modal = document.querySelector(".pollar-ramp-modal");
  if (!modal) return;

  const titleEl = modal.querySelector(".pollar-modal-title");
  if (titleEl && titleEl.textContent !== "Cargar saldo con QR de tu Banco") {
    titleEl.textContent = "Cargar saldo con QR de tu Banco";
  }

  const subEl = modal.querySelector(".pollar-ramp-subtitle");
  if (subEl && subEl.textContent !== subtitleText) {
    subEl.textContent = subtitleText;
  }

  const header = modal.querySelector(".pollar-modal-header");
  if (header && !modal.querySelector("[data-ecobanco-fee-badge='true']")) {
    const badge = document.createElement("div");
    badge.setAttribute("data-ecobanco-fee-badge", "true");
    badge.className = "ecobanco-ramp-fee-badge";
    badge.textContent = "🛡️ Comisión: 0 Bs — Cubierta por EcoBanco";
    header.insertAdjacentElement("afterend", badge);
  }

  const walker = document.createTreeWalker(modal, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentEl = node.parentElement;
    if (
      parentEl &&
      !parentEl.closest("script, style, code") &&
      node.nodeValue &&
      node.nodeValue.trim().length > 0
    ) {
      const nextVal = sanitizeText(node.nodeValue);
      if (nextVal !== node.nodeValue) {
        node.nodeValue = nextVal;
      }
    }
    node = walker.nextNode();
  }

  const qrBlock =
    modal.querySelector(".pollar-ramp-qr")?.parentElement ||
    modal
      .querySelector(".pollar-ramp-payment-field img")
      ?.closest(".pollar-ramp-payment-value");
  if (
    qrBlock instanceof HTMLElement &&
    !qrBlock.querySelector("[data-ecobanco-qr-download='true']")
  ) {
    const dlBtn = document.createElement("button");
    dlBtn.type = "button";
    dlBtn.setAttribute("data-ecobanco-qr-download", "true");
    dlBtn.className = "ecobanco-ramp-download-qr-btn";
    dlBtn.textContent = "⬇️ Descargar QR para mi Banco";
    dlBtn.addEventListener("click", () => downloadQrElement(qrBlock));
    qrBlock.appendChild(dlBtn);
  }
}

const OPEN_RAMP_STATES = new Set<RampOrder["state"]>([
  "created",
  "awaiting_payment",
  "processing",
  "settling_onchain",
]);

export function BankQrRechargeModal({
  open,
  role,
  userId,
  purpose,
  amountBs = 100,
  subtitle = "Paga con el QR de tu banco en Bolivianos (Bs), sin pasos complicados.",
  onClose,
  onRampCredited,
  onRampPending,
  onRampError,
}: BankQrRechargeModalProps) {
  const {
    getClient,
    isAuthenticated: isPollarAuthenticated,
    openLoginModal,
    login,
    wallet,
  } = usePollar();
  const client = getClient();

  const [isPreparingWallet, setIsPreparingWallet] = useState<boolean>(false);
  const [walletReady, setWalletReady] = useState<boolean>(false);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [isConfirmingOrder, setIsConfirmingOrder] = useState<boolean>(false);

  const initialCompletedIdsRef = useRef<Set<string>>(new Set());
  const initialOpenIdsRef = useRef<Set<string>>(new Set());
  const creditedIdsRef = useRef<Set<string>>(new Set());
  const confirmingIdsRef = useRef<Set<string>>(new Set());
  const snapshotLoadedRef = useRef<boolean>(false);
  const openedAtRef = useRef<number>(0);

  const onCreditedRef = useRef(onRampCredited);
  onCreditedRef.current = onRampCredited;
  const onPendingRef = useRef(onRampPending);
  onPendingRef.current = onRampPending;
  const onErrorRef = useRef(onRampError);
  onErrorRef.current = onRampError;

  const prepareWalletForRamp = useCallback(async () => {
    if (!open || !isPollarAuthenticated) return;
    setIsPreparingWallet(true);
    setWalletError(null);
    try {
      const res = userId
        ? await ensurePollarWalletAndSync(client, { userId, role })
        : await ensurePollarWalletProvisioned(client);

      if (!res.synced || !res.stellarAddress) {
        setWalletReady(false);
        setWalletError(
          res.reason === "pollar_not_authenticated"
            ? "Tu sesión de Pollar aún no está activa. Inicia sesión para continuar."
            : "No se pudo preparar tu cuenta Stellar Testnet (G...). Intenta de nuevo."
        );
        return;
      }

      if (res.provisioning === "FAILED") {
        setWalletReady(false);
        setWalletError(
          "La creación de tu cuenta Stellar falló en la red. Intenta nuevamente."
        );
        return;
      }

      setWalletReady(true);
    } finally {
      setIsPreparingWallet(false);
    }
  }, [open, isPollarAuthenticated, client, userId, role]);

  useEffect(() => {
    if (!open) {
      setWalletReady(false);
      setWalletError(null);
      snapshotLoadedRef.current = false;
      initialCompletedIdsRef.current.clear();
      initialOpenIdsRef.current.clear();
      return;
    }

    openedAtRef.current = Date.now();
    if (isPollarAuthenticated) {
      void prepareWalletForRamp();
    } else {
      setWalletReady(false);
    }
  }, [open, isPollarAuthenticated, prepareWalletForRamp]);

  const confirmCompletedOrder = useCallback(
    async (order: RampOrder): Promise<boolean> => {
      if (
        creditedIdsRef.current.has(order.id) ||
        confirmingIdsRef.current.has(order.id)
      ) {
        return true;
      }

      const payload = extractCompletedRampOrder(order, client);
      if (!payload) return false;

      confirmingIdsRef.current.add(order.id);
      setIsConfirmingOrder(true);
      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "confirm_ramp_topup",
            role,
            purpose,
            pollar_order_id: payload.pollarOrderId,
            direction: payload.direction,
            order_state: payload.orderState,
            amountBs: payload.amountBs,
            fiat_currency: payload.fiatCurrency,
            asset_code: payload.assetCode,
            crypto_amount: payload.cryptoAmount,
            onchain_tx_hash: payload.onchainTxHash,
            pollar_user_id: payload.pollarUserId,
            stellar_address: payload.stellarAddress,
          }),
        });
        const data = await res.json();

        if (res.ok) {
          creditedIdsRef.current.add(order.id);
          await client.refreshBalance().catch(() => undefined);
          onCreditedRef.current?.({
            pollarOrderId: data.pollarOrderId || payload.pollarOrderId,
            creditedBs: Number(data.creditedBs ?? payload.amountBs),
            message:
              data.message ||
              `¡Recarga real de ${Math.round(payload.amountBs)} Bs acreditada!`,
            buyer: data.buyer,
            merchant: data.merchant,
          });
          return true;
        }

        if (res.status === 409 && data.duplicate) {
          creditedIdsRef.current.add(order.id);
          return true;
        }

        onErrorRef.current?.(
          data.error || "No se pudo acreditar la orden de Pollar."
        );
        return false;
      } catch {
        onErrorRef.current?.(
          "Error de red validando tu orden de Pollar con EcoBanco."
        );
        return false;
      } finally {
        confirmingIdsRef.current.delete(order.id);
        setIsConfirmingOrder(false);
      }
    },
    [client, role, purpose]
  );

  const checkRampOrdersNow = useCallback(async (): Promise<{
    credited: boolean;
    pendingOrder?: RampOrder;
  }> => {
    try {
      const page = await client.listRampOrders({ limit: 15 });
      let creditedAny = false;
      let pendingOrder: RampOrder | undefined;

      for (const order of page.orders) {
        if (order.direction !== "ONRAMP") continue;

        if (
          order.state === "completed" &&
          !initialCompletedIdsRef.current.has(order.id) &&
          !creditedIdsRef.current.has(order.id)
        ) {
          const ok = await confirmCompletedOrder(order);
          if (ok) creditedAny = true;
        } else if (OPEN_RAMP_STATES.has(order.state)) {
          const isNewOpen =
            !initialOpenIdsRef.current.has(order.id) ||
            Date.parse(order.updatedAt) >= openedAtRef.current - 5000;
          if (isNewOpen && !pendingOrder) {
            pendingOrder = order;
          }
        }
      }

      return { credited: creditedAny, pendingOrder };
    } catch {
      return { credited: false };
    }
  }, [client, confirmCompletedOrder]);

  // Toma snapshot inicial al montar RampWidget y sondea nuevas órdenes completadas
  useEffect(() => {
    if (!open || !isPollarAuthenticated || !walletReady) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const initAndPoll = async () => {
      try {
        const [completedPage, openPage] = await Promise.all([
          client.listRampOrders({ state: "completed", limit: 25 }),
          client.listRampOrders({ open: "true", limit: 15 }),
        ]);
        if (cancelled) return;
        initialCompletedIdsRef.current = new Set(
          completedPage.orders.map((o) => o.id)
        );
        initialOpenIdsRef.current = new Set(openPage.orders.map((o) => o.id));
      } catch {
        // Continúa aun si el snapshot inicial falla
      } finally {
        snapshotLoadedRef.current = true;
      }

      if (cancelled) return;
      pollTimer = setInterval(() => {
        if (!snapshotLoadedRef.current) return;
        void checkRampOrdersNow();
      }, 3000);
    };

    void initAndPoll();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [open, isPollarAuthenticated, walletReady, client, checkRampOrdersNow]);

  // Decoración visual Cripto-Cero sobre el modal de RampWidget
  useEffect(() => {
    if (
      !open ||
      !isPollarAuthenticated ||
      !walletReady ||
      typeof document === "undefined"
    ) {
      return;
    }

    document.body.classList.add("ecobanco-qr-ramp-active");

    const applyEnhancements = () => enhancePollarRampDom(subtitle);
    const rafId = window.requestAnimationFrame(applyEnhancements);

    const observer = new MutationObserver(() => {
      applyEnhancements();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      window.cancelAnimationFrame(rafId);
      observer.disconnect();
      document.body.classList.remove("ecobanco-qr-ramp-active");
    };
  }, [open, isPollarAuthenticated, walletReady, subtitle]);

  const handleWidgetClose = async () => {
    if (snapshotLoadedRef.current) {
      const outcome = await checkRampOrdersNow();
      if (!outcome.credited && outcome.pendingOrder) {
        onPendingRef.current?.({
          pollarOrderId: outcome.pendingOrder.id,
          state: outcome.pendingOrder.state,
          amountBs: Math.round(amountBs),
        });
      }
    }
    onClose();
  };

  if (!open) return null;

  // Paso 1: Resolver pollar_not_authenticated antes de montar <RampWidget>
  if (!isPollarAuthenticated) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-2xl bg-[#16241F] border-2 border-oro p-6 space-y-4 shadow-gold-glow text-center">
          <div className="text-4xl">🔐</div>
          <h3 className="font-brand text-2xl text-arena">
            Conecta tu cuenta Pollar para recargar
          </h3>
          <p className="text-sm text-arena/90 leading-relaxed">
            Para generar tu QR bancario real en Bolivianos (
            <strong>BOB → USDC</strong> en Stellar Testnet) necesitamos
            autenticar tu billetera custodial con Google o código OTP por correo.
          </p>
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={openLoginModal}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg shadow-gold-glow"
            >
              🔑 Iniciar sesión con Google o Email OTP
            </button>
            <button
              type="button"
              onClick={() => login({ provider: "google" })}
              className="w-full py-3 px-4 rounded-xl bg-bosque border-2 border-oro/55 text-brillo font-extrabold text-xs uppercase tracking-wide"
            >
              G Continuar directamente con Google
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm font-bold text-arena/80 hover:text-brillo"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Paso 2: Asegurar cuenta G... READY y trustline USDC antes de abrir RampWidget
  if (!walletReady) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-2xl bg-[#16241F] border-2 border-oro p-6 space-y-4 shadow-gold-glow text-center">
          <div className="text-4xl">{walletError ? "⚠️" : "⏳"}</div>
          <h3 className="font-brand text-2xl text-arena">
            {walletError
              ? "No pudimos preparar tu billetera"
              : "Preparando tu billetera Stellar..."}
          </h3>
          <p className="text-sm text-arena/90 leading-relaxed">
            {walletError
              ? walletError
              : "Estamos activando tu cuenta custodial en Stellar Testnet y el trustline patrocinado de USDC para acreditar tu recarga."}
          </p>
          {wallet?.address && (
            <p className="font-mono text-xs text-brillo">
              Cuenta: {formatShortStellarAddress(wallet.address)}
            </p>
          )}
          {walletError && (
            <button
              type="button"
              disabled={isPreparingWallet}
              onClick={() => void prepareWalletForRamp()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-brand text-base"
            >
              {isPreparingWallet ? "Reintentando..." : "↻ Reintentar"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-bold text-arena/80 hover:text-brillo"
          >
            Cerrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <RampWidget
        language="es"
        initial={{
          direction: "buy",
          country: "BO",
          fiat: "BOB",
          asset: "USDC",
          amount: String(Math.max(10, Math.round(amountBs))),
        }}
        onClose={() => void handleWidgetClose()}
      />
      {isConfirmingOrder && (
        <div className="fixed bottom-4 right-4 z-[95] px-4 py-2.5 rounded-xl bg-[#14201C] border-2 border-brote text-xs font-extrabold text-arena shadow-green-glow">
          ✅ Validando orden Pollar y acreditando en Supabase...
        </div>
      )}
    </>
  );
}
