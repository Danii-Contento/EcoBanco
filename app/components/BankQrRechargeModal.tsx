"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { RampWidget, usePollar } from "@pollar/react";
import type { RampOrder } from "@pollar/core";
import {
  ensurePollarWalletAndSync,
  ensurePollarWalletProvisioned,
  extractCompletedRampOrder,
} from "@/app/lib/pollarWallet";
import {
  COMMUNITY_COPY,
  sanitizeUserError,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
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
  [/Comprar\s+cripto|Buy\s+crypto/gi, "Recargar con QR de tu Banco"],
  [/Vender\s+cripto|Sell\s+crypto/gi, "Retirar saldo en Bolivianos"],
  [
    /Elige\s+qué\s+recibes\s+y\s+cuánto\s+pagas/gi,
    "Ingresa el monto en Bolivianos (Bs) para generar tu QR bancario",
  ],
  [/Ya\s+pagué|I've\s+paid/gi, "Ya hice la transferencia"],
  [/QR\s+de\s+pago|Payment\s+QR/gi, "Escanea o descarga el QR de tu Banco"],
  [/Powered\s+by\s+Pollar/gi, "Protegido por EcoBanco"],
  [/Protegido\s+por\s+Pollar/gi, "Protegido por EcoBanco"],
  [/\bTrustless\s+Work\b/gi, "EcoBanco"],
  [/\bTrustless\b/gi, "EcoBanco"],
  [/\bStellar\b/gi, "EcoBanco"],
  [/\bSoroban\b/gi, "EcoBanco"],
  [/\bPollar\b/gi, "EcoBanco"],
  [/\bTestnet\b/gi, ""],
  [/\bMainnet\b/gi, ""],
  [/\bWeb3\b/gi, ""],
  [/\bblockchain\b/gi, ""],
  [/\bon-?chain\b/gi, ""],
  [/\bBOB\b/g, "Bs"],
  [/\bUSDC\b/gi, "Bs"],
  [/\bXLM\b/gi, "Bs"],
  [/\btrustline\b/gi, "activación"],
  [/\bcustodial\b/gi, ""],
  [/\bcripto\b|\bcrypto\b/gi, "saldo"],
  [/\bswap\b/gi, "transferencia"],
  [/\bnetwork\b/gi, "conexión"],
  [/\bescrow\b/gi, COMMUNITY_COPY.protectedBadge],
  [/\bhash\b/gi, "comprobante"],
  [/billetera(s)?/gi, "libreta$1"],
  [/\bwallet(s)?\b/gi, "libreta$1"],
  [/[GSC][A-Z2-7]{25,}/g, ""],
  [/\b[a-fA-F0-9]{32,}\b/g, ""],
  [/\s{2,}/g, " "],
];

function sanitizeDomText(value: string): string {
  let out = value;
  for (const [pattern, replacement] of TEXT_REPLACEMENTS) {
    out = out.replace(pattern, replacement);
  }
  return out;
}

function scrubTextNodesInElement(root: Element) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const parentEl = node.parentElement;
    if (
      parentEl &&
      !parentEl.closest("script, style, code") &&
      node.nodeValue &&
      node.nodeValue.trim().length > 0
    ) {
      const nextVal = sanitizeDomText(node.nodeValue);
      if (nextVal !== node.nodeValue) {
        node.nodeValue = nextVal;
      }
    }
    node = walker.nextNode();
  }
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

function enhanceRechargeModalDom(subtitleText: string) {
  const allModalCards = document.querySelectorAll(".pollar-modal-card");
  allModalCards.forEach((card) => {
    scrubTextNodesInElement(card);
  });

  const modal = document.querySelector(".pollar-ramp-modal");
  if (!modal) return;

  const titleEl = modal.querySelector(".pollar-modal-title");
  if (titleEl && titleEl.textContent !== "Recargar con QR de tu Banco") {
    titleEl.textContent = "Recargar con QR de tu Banco";
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
    badge.textContent = `🛡️ ${COMMUNITY_COPY.zeroCommission}`;
    header.insertAdjacentElement("afterend", badge);
  }

  scrubTextNodesInElement(modal);

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
            ? COMMUNITY_COPY.rechargeAuthRequired
            : COMMUNITY_COPY.walletPreparingError
        );
        return;
      }

      if (res.provisioning === "FAILED") {
        setWalletReady(false);
        setWalletError(COMMUNITY_COPY.walletPreparingError);
        return;
      }

      setWalletReady(true);
    } catch (err) {
      setWalletReady(false);
      setWalletError(sanitizeUserError(err));
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
              translateBackendMessage(data.message) ||
              `¡Recarga de ${Math.round(
                payload.amountBs
              )} Bs sumada a tu libreta comunitaria!`,
            buyer: data.buyer,
            merchant: data.merchant,
          });
          return true;
        }

        if (res.status === 409 && data.duplicate) {
          creditedIdsRef.current.add(order.id);
          return true;
        }

        onErrorRef.current?.(sanitizeUserError(data.error));
        return false;
      } catch (err) {
        onErrorRef.current?.(sanitizeUserError(err));
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

  // Toma snapshot inicial al montar el generador QR y sondea nuevas recargas completadas
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

  // Adaptación visual comunitaria sobre los diálogos de ingreso y generación de QR
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const isRampVisible = isPollarAuthenticated && walletReady;
    if (isRampVisible) {
      document.body.classList.add("ecobanco-qr-ramp-active");
    }

    const applyEnhancements = () => enhanceRechargeModalDom(subtitle);
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

  // Paso 1: Confirmar acceso rápido del vecino antes de abrir el generador de QR bancario
  if (!isPollarAuthenticated) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-2xl eco-card-gold p-6 space-y-4 shadow-gold-glow text-center">
          <div className="text-4xl">📲</div>
          <h3 className="font-brand text-2xl eco-text">
            Confirma tu correo para generar tu QR
          </h3>
          <p className="text-sm eco-text-muted leading-relaxed">
            Para generar el código QR bancario por{" "}
            <strong className="eco-text-gold">
              {Math.max(1, Math.round(amountBs))} Bs
            </strong>{" "}
            y validar tu pago al instante, confirma tu acceso rápido con Google
            o con tu correo.
          </p>
          <div className="space-y-2.5 pt-1">
            <button
              type="button"
              onClick={openLoginModal}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg shadow-gold-glow"
            >
              🔑 Continuar con Google o correo
            </button>
            <button
              type="button"
              onClick={() => login({ provider: "google" })}
              className="w-full py-3 px-4 rounded-xl eco-btn-ghost font-extrabold text-xs uppercase tracking-wide"
            >
              G Continuar directo con Google
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2 text-sm font-bold eco-text-muted hover:eco-text"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Paso 2: Preparación silenciosa de la libreta antes de abrir el QR bancario
  if (!walletReady) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-2xl eco-card-gold p-6 space-y-4 shadow-gold-glow text-center">
          <div className="text-4xl">{walletError ? "⚠️" : "⏳"}</div>
          <h3 className="font-brand text-2xl eco-text">
            {walletError
              ? "No pudimos generar tu QR"
              : "Generando tu QR bancario..."}
          </h3>
          <p className="text-sm eco-text-muted leading-relaxed">
            {walletError
              ? walletError
              : "Estamos preparando el código QR en Bolivianos (Bs) para que puedas pagar desde tu banco."}
          </p>
          {walletError && (
            <button
              type="button"
              disabled={isPreparingWallet}
              onClick={() => void prepareWalletForRamp()}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-brand text-base"
            >
              {isPreparingWallet ? "Intentando de nuevo..." : "↻ Intentar nuevamente"}
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-sm font-bold eco-text-muted hover:eco-text"
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
          amount: String(Math.max(1, Math.round(amountBs))),
        }}
        onClose={() => void handleWidgetClose()}
      />
      {isConfirmingOrder && (
        <div className="fixed bottom-4 right-4 z-[95] px-4 py-2.5 rounded-xl eco-alert-success text-xs font-extrabold shadow-green-glow">
          ✅ Validando tu pago QR en Bolivianos (Bs)...
        </div>
      )}
    </>
  );
}
