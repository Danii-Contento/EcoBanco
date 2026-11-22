"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { RampWidget, usePollar } from "@pollar/react";
import type { RampOrder } from "@pollar/core";
import {
  ensurePollarWalletAndSync,
  ensurePollarWalletProvisioned,
  extractCompletedRampOrder,
  extractPollarUserId,
  payWithPollarWallet,
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

const QUICK_TOPUP_AMOUNTS_BS = [20, 50, 100, 200] as const;

function createQrOrderRef(): string {
  return `ECO${Date.now().toString(36).toUpperCase()}${Math.random()
    .toString(36)
    .slice(2, 6)
    .toUpperCase()}`;
}

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
  const [rampRouteMode, setRampRouteMode] = useState<
    "checking" | "live_ramp" | "testnet_qr"
  >("checking");

  const isSubscriptionPurpose =
    purpose === "merchant_premium" || purpose === "prosumer_subscription";
  const initialSanitizedAmountBs = isSubscriptionPurpose
    ? Math.max(100, Math.round(amountBs))
    : Math.min(500, Math.max(1, Math.round(amountBs)));

  const [selectedAmountBs, setSelectedAmountBs] = useState<number>(
    initialSanitizedAmountBs
  );
  const [orderRef, setOrderRef] = useState<string>(() => createQrOrderRef());
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [isSubmittingTestnetQr, setIsSubmittingTestnetQr] =
    useState<boolean>(false);
  const [testnetSubmitError, setTestnetSubmitError] = useState<string | null>(
    null
  );

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
      setRampRouteMode("checking");
      setQrDataUrl("");
      setIsSubmittingTestnetQr(false);
      setTestnetSubmitError(null);
      snapshotLoadedRef.current = false;
      initialCompletedIdsRef.current.clear();
      initialOpenIdsRef.current.clear();
      return;
    }

    setRampRouteMode("checking");
    setSelectedAmountBs(initialSanitizedAmountBs);
    setOrderRef(createQrOrderRef());
    setTestnetSubmitError(null);
    openedAtRef.current = Date.now();
    if (isPollarAuthenticated) {
      void prepareWalletForRamp();
    } else {
      setWalletReady(false);
    }
  }, [open, isPollarAuthenticated, prepareWalletForRamp, initialSanitizedAmountBs]);

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

  // Detecta si existen rutas fiat en vivo o si corresponde mostrar el QR de prueba en Testnet
  useEffect(() => {
    if (!open || !isPollarAuthenticated || !walletReady) {
      return;
    }
    let cancelled = false;
    setRampRouteMode("checking");

    const checkRoutes = async () => {
      try {
        const res = await client.getRampRoutes("ONRAMP");
        if (cancelled) return;
        const routes = Array.isArray(res?.routes) ? res.routes : [];
        setRampRouteMode(routes.length > 0 ? "live_ramp" : "testnet_qr");
      } catch {
        if (!cancelled) {
          setRampRouteMode("testnet_qr");
        }
      }
    };

    void checkRoutes();

    return () => {
      cancelled = true;
    };
  }, [open, isPollarAuthenticated, walletReady, client]);

  // Genera imagen QR comunitaria cuando está activo el flujo QR de Testnet
  useEffect(() => {
    if (!open || rampRouteMode !== "testnet_qr") return;
    const validBs =
      Number.isFinite(selectedAmountBs) && selectedAmountBs >= 1
        ? Math.min(500, Math.round(selectedAmountBs))
        : 1;
    let cancelled = false;

    const payload = `ECOBANCO-BO|REF:${orderRef}|MONTO:${validBs}BS|COMISION:0BS`;
    void QRCode.toDataURL(payload, {
      width: 240,
      margin: 2,
      color: { dark: "#132A1E", light: "#FFFFFF" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl("");
      });

    return () => {
      cancelled = true;
    };
  }, [open, rampRouteMode, orderRef, selectedAmountBs]);

  // Toma snapshot inicial al montar el generador QR en vivo y sondea nuevas recargas completadas
  useEffect(() => {
    if (
      !open ||
      !isPollarAuthenticated ||
      !walletReady ||
      rampRouteMode !== "live_ramp"
    ) {
      return;
    }
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
  }, [
    open,
    isPollarAuthenticated,
    walletReady,
    rampRouteMode,
    client,
    checkRampOrdersNow,
  ]);

  // Adaptación visual comunitaria sobre los diálogos de ingreso y generación de QR en vivo
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const isLiveRampVisible =
      isPollarAuthenticated && walletReady && rampRouteMode === "live_ramp";
    if (!isLiveRampVisible) {
      document.body.classList.remove("ecobanco-qr-ramp-active");
      return;
    }

    document.body.classList.add("ecobanco-qr-ramp-active");

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
  }, [open, isPollarAuthenticated, walletReady, rampRouteMode, subtitle]);

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

  const handleSelectQuickAmount = (bs: number) => {
    setSelectedAmountBs(bs);
    setOrderRef(createQrOrderRef());
    setTestnetSubmitError(null);
  };

  const handleCustomAmountChange = (raw: string) => {
    const numeric = Number(raw);
    if (!raw.trim()) {
      setSelectedAmountBs(0);
      setTestnetSubmitError(null);
      return;
    }
    if (Number.isFinite(numeric)) {
      setSelectedAmountBs(Math.min(500, Math.max(0, Math.round(numeric))));
      setOrderRef(createQrOrderRef());
      setTestnetSubmitError(null);
    }
  };

  const handleDownloadTestnetQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement("a");
    link.href = qrDataUrl;
    link.download = `ecobanco-qr-${Math.max(1, Math.round(selectedAmountBs))}bs.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleConfirmTestnetQrTransfer = async () => {
    const roundedBs = Math.round(Number(selectedAmountBs));
    if (!Number.isFinite(roundedBs) || roundedBs < 1 || roundedBs > 500) {
      setTestnetSubmitError("Ingresa un monto válido entre 1 Bs y 500 Bs.");
      return;
    }

    const stellarAddress = client.getWallet()?.address?.trim() || "";
    const pollarUserId = extractPollarUserId(client);
    if (!stellarAddress) {
      setTestnetSubmitError(COMMUNITY_COPY.walletPreparingError);
      return;
    }

    setIsSubmittingTestnetQr(true);
    setTestnetSubmitError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "testnet_qr_topup",
          role,
          purpose,
          amountBs: roundedBs,
          orderRef,
          pollar_user_id: pollarUserId,
          stellar_address: stellarAddress,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const cleanErr = sanitizeUserError(data.error);
        setTestnetSubmitError(cleanErr);
        onErrorRef.current?.(cleanErr);
        return;
      }

      await client.refreshBalance().catch(() => undefined);

      if (isSubscriptionPurpose && data.treasuryPublic) {
        await payWithPollarWallet(client, {
          destination: String(data.treasuryPublic),
          amountUsdc: roundedBs,
          memo:
            purpose === "merchant_premium" ? "CASERITA ALIADA" : "CLUB VECINO",
          waitForBalanceMs: 2000,
        }).catch(() => undefined);
      }

      onCreditedRef.current?.({
        pollarOrderId: String(data.pollarOrderId || orderRef),
        creditedBs: Number(data.creditedBs ?? roundedBs),
        message:
          translateBackendMessage(data.message) ||
          `¡Recarga de ${roundedBs} Bs sumada a tu libreta comunitaria!`,
        buyer: data.buyer,
        merchant: data.merchant,
      });
    } catch (err) {
      const cleanErr = sanitizeUserError(err);
      setTestnetSubmitError(cleanErr);
      onErrorRef.current?.(cleanErr);
    } finally {
      setIsSubmittingTestnetQr(false);
    }
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

  if (rampRouteMode === "checking") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <div className="max-w-md w-full rounded-2xl eco-card-gold p-6 space-y-4 shadow-gold-glow text-center">
          <div className="text-4xl">📲</div>
          <h3 className="font-brand text-2xl eco-text">
            Preparando tu código QR...
          </h3>
          <p className="text-sm eco-text-muted leading-relaxed">
            Estamos preparando el código QR en Bolivianos (Bs) para que puedas pagar desde tu banco.
          </p>
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

  if (rampRouteMode === "testnet_qr") {
    const canSubmitQr =
      !isSubmittingTestnetQr &&
      Number.isFinite(selectedAmountBs) &&
      selectedAmountBs >= 1 &&
      selectedAmountBs <= 500;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Recargar con QR de tu Banco"
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
      >
        <div className="max-w-md w-full rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/45 p-5 sm:p-6 space-y-4 shadow-warm-lg dark:shadow-gold-glow my-auto">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-brand text-2xl text-ink dark:text-arena leading-tight">
                Recargar con QR de tu Banco
              </h3>
              <p className="text-xs sm:text-sm text-ink-muted dark:text-arena/80 leading-relaxed">
                {subtitle}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmittingTestnetQr}
              aria-label="Cerrar"
              className="w-10 h-10 rounded-full bg-surface-soft dark:bg-bosque text-ink dark:text-arena font-bold text-base flex items-center justify-center shrink-0 hover:bg-earth-border/60 transition disabled:opacity-50"
            >
              ✕
            </button>
          </div>

          <div className="rounded-xl bg-primary/10 dark:bg-brote/15 border border-primary/30 dark:border-brote/40 px-3.5 py-2 text-center text-xs sm:text-sm font-extrabold text-primary dark:text-[#69D86E]">
            🛡️ Comisión: 0 Bs — Cubierta por EcoBanco
          </div>

          {isSubscriptionPurpose ? (
            <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 px-4 py-3 text-center">
              <span className="block text-xs font-bold uppercase tracking-wide text-ink-muted dark:text-arena/75">
                Monto exacto para activar tu plan
              </span>
              <span className="font-brand text-3xl text-ink dark:text-brillo">
                {selectedAmountBs} Bs
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <label
                htmlFor="ecobanco-qr-amount-bs"
                className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted dark:text-arena/80"
              >
                Monto en Bolivianos (Bs)
              </label>

              <div className="grid grid-cols-4 gap-2">
                {QUICK_TOPUP_AMOUNTS_BS.map((preset) => {
                  const isActive = selectedAmountBs === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      disabled={isSubmittingTestnetQr}
                      onClick={() => handleSelectQuickAmount(preset)}
                      className={`min-h-[48px] rounded-xl text-xs sm:text-sm font-extrabold border transition active:scale-95 ${
                        isActive
                          ? "bg-primary text-white border-primary dark:bg-brote dark:text-bosque dark:border-brote shadow-sm"
                          : "bg-surface-soft dark:bg-[#14221D] text-ink dark:text-arena border-earth-border dark:border-oro/30 hover:border-sol"
                      }`}
                    >
                      {preset} Bs
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 px-3.5 py-2">
                <input
                  id="ecobanco-qr-amount-bs"
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  disabled={isSubmittingTestnetQr}
                  value={selectedAmountBs > 0 ? selectedAmountBs : ""}
                  onChange={(e) => handleCustomAmountChange(e.target.value)}
                  className="w-full bg-transparent text-lg font-extrabold text-ink dark:text-arena focus:outline-none"
                  placeholder="Ej. 50"
                />
                <span className="text-sm font-extrabold text-ink-muted dark:text-arena/80 shrink-0">
                  Bs
                </span>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-white p-4 border-2 border-earth-border dark:border-oro/40 flex flex-col items-center gap-2.5">
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Código QR de recarga EcoBanco"
                width={216}
                height={216}
                className="w-52 h-52 rounded-xl"
              />
            ) : (
              <div className="w-52 h-52 rounded-xl bg-surface-soft flex items-center justify-center text-sm font-bold text-ink-muted">
                Generando QR...
              </div>
            )}

            <p className="text-xs font-bold text-[#1A2E23] text-center">
              Referencia: {orderRef} · Escanea con la app de tu banco
            </p>

            <button
              type="button"
              onClick={handleDownloadTestnetQr}
              disabled={!qrDataUrl || isSubmittingTestnetQr}
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-[#F4EFE6] hover:bg-[#EAE1D3] text-[#132A1E] font-extrabold text-sm border border-[#D8CBB8] transition active:scale-[0.98] disabled:opacity-50"
            >
              ⬇️ Descargar QR para mi Banco
            </button>
          </div>

          {testnetSubmitError && (
            <p className="rounded-xl bg-aji/10 border border-aji/40 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-aji dark:bg-red-900/30 dark:border-red-400/50 dark:text-red-200 text-center">
              ⚠️ {testnetSubmitError}
            </p>
          )}

          <div className="space-y-2 pt-1">
            <button
              type="button"
              disabled={!canSubmitQr}
              onClick={() => void handleConfirmTestnetQrTransfer()}
              className="w-full min-h-[52px] px-5 py-3.5 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-base sm:text-lg shadow-gold-glow border border-[#fff3cc]/70 active:scale-[0.98] transition disabled:opacity-60"
            >
              {isSubmittingTestnetQr
                ? "Validando tu transferencia bancaria..."
                : "✅ Ya hice la transferencia"}
            </button>

            <p className="text-[11px] font-semibold text-ink-muted dark:text-arena/75 text-center">
              Recibirás el 100% de tu saldo en Bs al instante en tu libreta comunitaria.
            </p>

            <button
              type="button"
              disabled={isSubmittingTestnetQr}
              onClick={onClose}
              className="w-full min-h-[48px] text-sm font-bold text-ink-muted dark:text-arena/80 hover:text-ink dark:hover:text-arena transition disabled:opacity-50"
            >
              Cerrar
            </button>
          </div>
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
