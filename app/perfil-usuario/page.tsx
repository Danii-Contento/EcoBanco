"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  extractCompletedRampOrder,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import {
  formatBs,
  formatMotes,
  formatOrderCode,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import { ProtectedPurchaseBar } from "@/app/components/ProtectedPurchaseBar";
import { OnChainEscrowAuditLinks } from "@/app/components/OnChainEscrowAuditLinks";
import {
  BankQrRechargeModal,
  RampCreditedEvent,
  RampPendingEvent,
} from "@/app/components/BankQrRechargeModal";
import {
  PollarProfileSnapshot,
  PollarWalletSection,
} from "@/app/components/PollarWalletSection";
import { User } from "@/app/types/ecobanco";

function getDeliveryStatusBadge(status?: string) {
  const normalized = (status || "").toLowerCase();
  if (normalized === "delivered") {
    return {
      label: "✅ Entregado",
      cls: "bg-brote/25 border-brote text-arena",
    };
  }
  if (normalized === "in_transit") {
    return {
      label: "🚲 En Camino",
      cls: "bg-oro/25 border-oro text-brillo",
    };
  }
  return {
    label: "🍳 Preparando Pedido",
    cls: "bg-arena/15 border-arena/35 text-arena",
  };
}

export default function PerfilUsuarioPage() {
  const {
    getClient: getPollarClient,
    isAuthenticated: isPollarAuthenticated,
  } = usePollar();
  const [buyer, setBuyer] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isUpgrading, setIsUpgrading] = useState<boolean>(false);
  const [upgradeBanner, setUpgradeBanner] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [referralBanner, setReferralBanner] = useState<string | null>(null);
  const [rampMode, setRampMode] = useState<null | "topup" | "club">(null);
  const [topupAmountInput, setTopupAmountInput] = useState<string>("50");
  const [pendingRampOrder, setPendingRampOrder] = useState<
    (RampPendingEvent & { mode: "topup" | "club" }) | null
  >(null);
  const [isCheckingPendingRamp, setIsCheckingPendingRamp] =
    useState<boolean>(false);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [pollarGuestNotice, setPollarGuestNotice] = useState<string | null>(
    null
  );
  const skipAutoPollarLoginRef = useRef<boolean>(false);
  const pollarLookupKeyRef = useRef<string>("");

  // Edición de WhatsApp y Dirección de Entrega
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [deliveryAddressInput, setDeliveryAddressInput] = useState<string>("");
  const [isSavingContact, setIsSavingContact] = useState<boolean>(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const loadBuyerData = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/users");
      const data = await res.json();
      const loadedBuyer: User | null = data.buyer || null;
      setBuyer(loadedBuyer);
      if (loadedBuyer) {
        setPhoneInput(loadedBuyer.phone || "");
        setDeliveryAddressInput(
          loadedBuyer.deliveryAddress || loadedBuyer.address || ""
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBuyerData();
  }, []);

  const handleBuyerPollarSynced = useCallback((result: PollarSyncResult) => {
    if (!result.synced) return;
    setBuyer((prev) =>
      prev
        ? {
            ...prev,
            pollar_user_id: result.pollarUserId ?? prev.pollar_user_id,
            stellar_address: result.stellarAddress ?? prev.stellar_address,
          }
        : prev
    );
  }, []);

  const syncBuyerPollarInBackground = useCallback(
    async (targetBuyer: User | null) => {
      if (!targetBuyer?.isLoggedIn) return;
      const result = await ensurePollarWalletAndSync(getPollarClient(), {
        userId: targetBuyer.id,
        role: "buyer",
      });
      if (result.synced) {
        handleBuyerPollarSynced(result);
      }
    },
    [getPollarClient, handleBuyerPollarSynced]
  );

  const handlePollarGuestProfile = useCallback(
    async (profile: PollarProfileSnapshot) => {
      if (buyer?.isLoggedIn || skipAutoPollarLoginRef.current) {
        return;
      }

      const lookupKey = `${profile.pollarUserId || ""}|${
        profile.stellarAddress || ""
      }|${profile.email || ""}`;
      if (!lookupKey.replace(/\|/g, "") || pollarLookupKeyRef.current === lookupKey) {
        return;
      }
      pollarLookupKeyRef.current = lookupKey;

      try {
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "pollar_login",
            role: "buyer",
            pollar_user_id: profile.pollarUserId,
            stellar_address: profile.stellarAddress,
            email: profile.email,
          }),
        });
        const data = await res.json();
        if (res.ok && data.matched && data.buyer?.isLoggedIn) {
          setBuyer(data.buyer);
          setPhoneInput(data.buyer.phone || "");
          setDeliveryAddressInput(
            data.buyer.deliveryAddress || data.buyer.address || ""
          );
          setPollarGuestNotice(null);
        } else {
          setPollarGuestNotice(
            "Tu billetera Pollar ya está lista. Elige un producto en el Mercado del Barrio para completar tu dirección de entrega y activar tu libreta."
          );
        }
      } catch {
        // Non-blocking
      }
    },
    [buyer?.isLoggedIn]
  );

  useEffect(() => {
    if (!isPollarAuthenticated) {
      skipAutoPollarLoginRef.current = false;
      pollarLookupKeyRef.current = "";
    }
  }, [isPollarAuthenticated]);

  const confirmCompletedPendingOrder = useCallback(
    async (orderId: string, mode: "topup" | "club") => {
      const client = getPollarClient();
      const order = await client.getRampOrder(orderId);
      if (order.state !== "completed") {
        return { completed: false, state: order.state };
      }

      const payload = extractCompletedRampOrder(order, client);
      if (!payload) {
        return { completed: false, state: order.state };
      }

      const purpose =
        mode === "club" ? "prosumer_subscription" : "fiat_topup";
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_ramp_topup",
          role: "buyer",
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
      if (res.ok && data.buyer) {
        setBuyer(data.buyer);
        setPendingRampOrder(null);
        setPaymentError(null);
        setUpgradeError(null);
        if (mode === "club") {
          setUpgradeBanner(
            data.message ||
              "¡Bienvenido al Club Vecino (100 Bs/mes)! Tu billetera de MOTES ya está activa con +50 MOTES y 5 envíos ecológicos incluidos."
          );
        } else {
          setPaymentFeedback(
            data.message ||
              `¡Recarga real de ${Math.round(payload.amountBs)} Bs acreditada!`
          );
        }
        return { completed: true, state: order.state };
      }
      if (res.status === 409 && data.duplicate) {
        setPendingRampOrder(null);
        await loadBuyerData();
        return { completed: true, state: order.state };
      }
      const msg = translateBackendMessage(
        data.error || "No se pudo confirmar tu orden de Pollar."
      );
      setPaymentError(msg);
      return { completed: false, state: order.state };
    },
    [getPollarClient]
  );

  useEffect(() => {
    if (!pendingRampOrder?.pollarOrderId) return;
    const controller = new AbortController();
    const client = getPollarClient();

    client
      .pollRampOrder(pendingRampOrder.pollarOrderId, {
        signal: controller.signal,
        onUpdate: (next) => {
          if (next.state === "completed") {
            void confirmCompletedPendingOrder(next.id, pendingRampOrder.mode);
          } else if (next.state === "failed" || next.state === "refunded") {
            setPendingRampOrder(null);
            setPaymentError(
              "La orden de recarga en Pollar no se completó o fue reembolsada."
            );
          }
        },
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [
    pendingRampOrder?.pollarOrderId,
    pendingRampOrder?.mode,
    getPollarClient,
    confirmCompletedPendingOrder,
  ]);

  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactMsg(null);
    setContactError(null);
    if (!phoneInput.trim() || !deliveryAddressInput.trim()) {
      setContactError(
        "El número de WhatsApp y la dirección de entrega son obligatorios."
      );
      return;
    }

    try {
      setIsSavingContact(true);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "buyer_update_profile",
          phone: phoneInput,
          deliveryAddress: deliveryAddressInput,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactError(
          translateBackendMessage(
            data.error || "No se pudieron guardar tus datos."
          )
        );
        return;
      }
      setBuyer(data.buyer);
      setContactMsg(
        translateBackendMessage(
          data.message || "WhatsApp y dirección de entrega actualizados."
        )
      );
    } finally {
      setIsSavingContact(false);
    }
  };

  const handleJoinClubVecino = async () => {
    try {
      setIsUpgrading(true);
      setUpgradeBanner(null);
      setUpgradeError(null);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "upgrade_prosumer",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUpgradeError(
          translateBackendMessage(
            data.error || "Necesitas 100 Bs disponibles para activar."
          )
        );
        return;
      }
      setBuyer(data.buyer);
      void syncBuyerPollarInBackground(data.buyer);
      setUpgradeBanner(
        "¡Bienvenido al Club Vecino (100 Bs/mes)! Tu billetera de MOTES ya está activa con +50 MOTES y 5 envíos ecológicos incluidos."
      );
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCheckPendingRamp = async () => {
    if (!pendingRampOrder?.pollarOrderId) return;
    try {
      setIsCheckingPendingRamp(true);
      const outcome = await confirmCompletedPendingOrder(
        pendingRampOrder.pollarOrderId,
        pendingRampOrder.mode
      );
      if (!outcome.completed) {
        setPaymentFeedback(
          `Orden Pollar ${pendingRampOrder.pollarOrderId} en estado "${outcome.state}". Se acreditará automáticamente en cuanto Pollar confirme el pago.`
        );
      }
    } finally {
      setIsCheckingPendingRamp(false);
    }
  };

  const handleBuyerLogout = async () => {
    skipAutoPollarLoginRef.current = true;
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "buyer_logout" }),
    });
    setBuyer(null);
    setPendingRampOrder(null);
  };

  const handleShareWhatsApp = async () => {
    if (!buyer?.referrals.code) return;
    const shareText = `¡Hola vecino! Te invito a EcoBanco Bolivia para pedir del barrio sin comisiones. Regístrate usando mi código de referido: ${buyer.referrals.code}`;
    try {
      await navigator.clipboard.writeText(buyer.referrals.code);
    } catch {
      // ignore clipboard errors
    }
    if (typeof window !== "undefined") {
      window.open(
        `https://wa.me/?text=${encodeURIComponent(shareText)}`,
        "_blank",
        "noopener,noreferrer"
      );
    }
    setReferralBanner(
      `¡Código ${buyer.referrals.code} copiado! Cuando un vecino nuevo se registre usando tu código, recibirás automáticamente tu bono (+1 envío incluido y +2 MOTES si eres Club Vecino).`
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bosque text-arena font-sans px-4 py-8">
        <div className="max-w-md sm:max-w-2xl mx-auto space-y-4">
          <div className="h-10 w-36 rounded-xl bg-[#182721] animate-pulse" />
          <div className="h-36 rounded-2xl bg-[#182721] animate-pulse" />
          <div className="h-44 rounded-2xl bg-[#182721] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!buyer?.isLoggedIn) {
    return (
      <div className="min-h-screen bg-bosque text-arena font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto rounded-2xl bg-[#182822] border-2 border-oro/50 p-6 sm:p-8 text-center space-y-5 shadow-gold-glow">
          <div className="text-4xl">👤</div>
          <h1 className="font-brand text-2xl text-arena">
            Tu libreta de vecino te espera
          </h1>
          <p className="text-sm text-arena/90 leading-relaxed">
            Inicia sesión con Pollar (Google o Email OTP) si ya tienes cuenta, o
            elige un producto en el Mercado del Barrio para activar tu libreta
            digital.
          </p>

          <div className="text-left">
            <PollarWalletSection
              role="buyer"
              mode="auth-entry"
              onSynced={handleBuyerPollarSynced}
              onPollarProfileLoaded={handlePollarGuestProfile}
            />
          </div>

          {pollarGuestNotice && (
            <div className="p-3 rounded-xl bg-brote/20 border border-brote/60 text-xs font-bold text-arena">
              ✨ {pollarGuestNotice}
            </div>
          )}

          <Link
            href="/marketplace"
            className="block w-full py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg shadow-gold-glow"
          >
            Ir al Mercado del Barrio →
          </Link>
        </div>
      </div>
    );
  }

  // Regla UX: Si el comprador NO es miembro activo del Club Vecino y tiene 0 MOTES,
  // oculta completamente la tarjeta de MOTES para no mostrar un saldo en cero.
  const showMotesCard = Boolean(
    buyer.isProsumer || buyer.motesEnabled || Number(buyer.motes ?? 0) > 0
  );

  return (
    <div className="min-h-screen bg-bosque text-arena font-sans pb-16">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/marketplace"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena hover:border-oro transition"
          >
            ← Mercado del Barrio
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadBuyerData}
              className="px-3.5 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-xs sm:text-sm font-bold text-arena hover:text-brillo"
            >
              🔄 Actualizar
            </button>
            {buyer.isProsumer && (
              <Link
                href="/panel-caserita"
                className="px-3.5 py-2.5 rounded-xl bg-oro/20 border-2 border-oro text-xs sm:text-sm font-extrabold text-brillo"
              >
                🏪 Mi Puesto →
              </Link>
            )}
            <button
              type="button"
              onClick={handleBuyerLogout}
              className="px-3.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/50 text-red-200 text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Cabecera del Vecino y dirección Stellar Testnet resumida */}
        <header className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-brote/20 border border-brote/60 text-arena text-xs font-extrabold uppercase">
              👤 Mi Libreta Vecinal
            </span>
            {buyer.isProsumer && (
              <span className="px-3 py-1 rounded-full bg-oro text-bosque text-xs font-extrabold uppercase">
                ⭐ Club Vecino Activo
              </span>
            )}
          </div>
          <h1 className="font-brand text-3xl text-arena">{buyer.name}</h1>
          {buyer.email && (
            <p className="text-sm text-arena/85">{buyer.email}</p>
          )}

          <PollarWalletSection
            role="buyer"
            userId={buyer.id}
            savedStellarAddress={buyer.stellar_address}
            savedPollarUserId={buyer.pollar_user_id}
            mode="profile-badge"
            onSynced={handleBuyerPollarSynced}
          />

          {pendingRampOrder && (
            <div className="rounded-xl bg-oro/15 border border-oro/60 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-brillo">
                ⏳ Orden Pollar {pendingRampOrder.pollarOrderId} en estado{" "}
                {pendingRampOrder.state}
              </span>
              <button
                type="button"
                disabled={isCheckingPendingRamp}
                onClick={handleCheckPendingRamp}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold uppercase disabled:opacity-60"
              >
                {isCheckingPendingRamp
                  ? "Verificando..."
                  : "🔄 Verificar recarga Pollar"}
              </button>
            </div>
          )}
        </header>

        {/* Saldo en Bolivianos (Bs) y Puntos de Trueque (MOTES solo si está activo o > 0) */}
        <section
          aria-label="Tu Saldo Disponible"
          className={`grid grid-cols-1 ${
            showMotesCard ? "sm:grid-cols-2" : ""
          } gap-4`}
        >
          {/* Saldo en Bolivianos (Bs) */}
          <div className="rounded-2xl bg-gradient-to-b from-[#1A2A25] to-[#101A17] border-2 border-oro/70 p-5 shadow-wallet-inner wallet-inset flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-arena">
                Saldo en Bolivianos (Bs)
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-brote/25 text-arena text-[11px] font-extrabold uppercase">
                ✅ Disponible
              </span>
            </div>
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="font-brand text-4xl text-brillo">
                  {Math.round(buyer.fiatBs ?? 0)}
                </span>
                <span className="text-lg font-extrabold text-oro">Bs</span>
              </div>
              <p className="text-xs text-brote font-bold mt-1">
                🛡️ Comisión: 0 Bs — Cubierta por EcoBanco
              </p>
            </div>
            <div className="space-y-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-arena/85">
                Monto a recargar (Bs)
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {["50", "100", "200"].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setTopupAmountInput(preset)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border transition ${
                      topupAmountInput === preset
                        ? "bg-oro text-bosque border-oro"
                        : "bg-bosque text-arena border-arena/25 hover:border-oro"
                    }`}
                  >
                    {preset} Bs
                  </button>
                ))}
                <input
                  type="number"
                  min={10}
                  max={50000}
                  value={topupAmountInput}
                  onChange={(e) =>
                    setTopupAmountInput(e.target.value.replace(/[^0-9]/g, ""))
                  }
                  aria-label="Monto en Bolivianos"
                  className="w-24 px-3 py-1.5 rounded-lg bg-bosque border border-oro/50 text-brillo font-mono text-sm font-bold text-center focus:outline-none focus:border-brillo"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setPaymentError(null);
                setPaymentFeedback(null);
                const parsed = Math.round(Number(topupAmountInput));
                if (!Number.isFinite(parsed) || parsed < 10) {
                  setPaymentError("Ingresa un monto válido (mínimo 10 Bs).");
                  return;
                }
                setRampMode("topup");
              }}
              className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-base sm:text-lg shadow-gold-glow active:scale-[0.98] transition"
            >
              📲 Cargar saldo con QR (Pollar BOB → USDC)
            </button>
            {paymentFeedback && (
              <p className="text-xs font-bold text-brote">✨ {paymentFeedback}</p>
            )}
            {paymentError && (
              <p className="text-xs font-bold text-red-200">⚠️ {paymentError}</p>
            )}
          </div>

          {/* Puntos de Trueque (MOTES) — oculto si no es Club Vecino y tiene 0 MOTES */}
          {showMotesCard && (
            <div className="rounded-2xl p-5 shadow-wallet-inner wallet-inset flex flex-col justify-between space-y-3 bg-gradient-to-br from-[#1B3326] via-[#172820] to-[#292315] border-2 border-brote/80">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-brillo">
                  Puntos de Trueque (MOTES)
                </span>
                <span className="px-2.5 py-0.5 rounded-full bg-brote text-bosque text-[11px] font-extrabold uppercase">
                  ✅ Activo
                </span>
              </div>
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-brand text-4xl text-brillo">
                    {Math.round(buyer.motes ?? 0)}
                  </span>
                  <span className="text-sm font-extrabold text-brote uppercase">
                    MOTES
                  </span>
                </div>
                <p className="text-xs font-bold text-arena mt-1">
                  1 MOTE = 1 Bs en productos del barrio
                </p>
                <p className="text-xs text-brote font-bold mt-1">
                  🚲 {buyer.freeDeliveries ?? 0} envíos ecológicos incluidos
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Datos de Contacto y Dirección de Entrega */}
        <section
          aria-label="Datos de Contacto y Entrega"
          className="rounded-2xl bg-[#14221D] border-2 border-oro/35 p-5 space-y-4"
        >
          <div>
            <h2 className="font-brand text-xl text-arena">
              📍 Datos de Contacto y Entrega
            </h2>
            <p className="text-xs sm:text-sm text-arena/85">
              Para que nuestro repartidor ecológico coordine la entrega directo
              en tu puerta.
            </p>
          </div>

          {contactMsg && (
            <div className="p-3.5 rounded-xl bg-brote/25 border border-brote text-sm font-bold text-arena">
              ✅ {contactMsg}
            </div>
          )}
          {contactError && (
            <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
              ⚠️ {contactError}
            </div>
          )}

          <form onSubmit={handleSaveContactInfo} className="space-y-3.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Número de WhatsApp *
                </label>
                <input
                  type="tel"
                  required
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="Ej. 76543210"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Dirección de Entrega *
                </label>
                <input
                  type="text"
                  required
                  value={deliveryAddressInput}
                  onChange={(e) => setDeliveryAddressInput(e.target.value)}
                  placeholder="Zona, calle, número y referencia"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSavingContact}
              className="px-5 py-3 rounded-xl bg-oro/20 hover:bg-oro hover:text-bosque border-2 border-oro text-brillo font-extrabold text-sm uppercase transition"
            >
              {isSavingContact
                ? "Guardando tus datos..."
                : "Guardar WhatsApp y Dirección"}
            </button>
          </form>
        </section>

        {/* Club Vecino (100 Bs/mes) */}
        <section
          aria-label="Club Vecino"
          className="rounded-2xl bg-gradient-to-b from-[#1B2B25] to-[#121D19] border-2 border-oro/55 p-5 shadow-xl space-y-3.5"
        >
          {!buyer.isProsumer ? (
            <div className="text-center space-y-3.5">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase tracking-wider text-brillo">
                  ⭐ Beneficio Barrial
                </span>
                <h2 className="font-brand text-2xl text-arena">
                  Club Vecino · 100 Bs/mes
                </h2>
              </div>
              <p className="text-sm text-arena/90 leading-relaxed">
                ¿Pides seguido en el barrio? Únete al Club Vecino (100 Bs/mes),
                recibe{" "}
                <strong className="text-brillo">
                  50 Bs de regalo en MOTES
                </strong>{" "}
                y <strong className="text-brote">envíos incluidos</strong>.
              </p>
              {Number(buyer.fiatBs ?? 0) >= 100 ? (
                <button
                  type="button"
                  disabled={isUpgrading}
                  onClick={() => handleJoinClubVecino()}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-[0.98] transition"
                >
                  {isUpgrading
                    ? "Activando tu libreta digital..."
                    : "Pagar Club Vecino con mi saldo (100 Bs)"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setUpgradeError(null);
                    setRampMode("club");
                  }}
                  className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-[0.98] transition"
                >
                  📲 Pagar Club Vecino con QR Pollar (100 Bs)
                </button>
              )}
              <p className="text-xs font-bold text-brote">
                Comisión: 0 Bs — Cubierta por EcoBanco
              </p>
              {upgradeError && (
                <div className="p-3 rounded-xl bg-red-500/20 border border-red-400/60 text-xs sm:text-sm font-bold text-red-100">
                  ⚠️ {upgradeError}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="space-y-1 text-center sm:text-left">
                <span className="inline-block px-3 py-1 rounded-full bg-brote text-bosque font-extrabold text-xs uppercase">
                  ✅ Club Vecino Activo · 100 Bs/mes ({buyer.freeDeliveries}{" "}
                  envíos incluidos)
                </span>
                <p className="text-sm text-arena/90">
                  Tienes tus Puntos de Trueque activos (1 MOTE = 1 Bs en
                  productos del barrio) y puedes abrir tu propio puesto cuando
                  quieras.
                </p>
              </div>
              <Link
                href="/panel-caserita"
                className="w-full sm:w-auto text-center px-5 py-3.5 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-brand text-base"
              >
                🏪 Abrir mi Puesto →
              </Link>
            </div>
          )}

          {upgradeBanner && (
            <div className="p-3.5 rounded-xl bg-brote/25 border border-brote text-sm font-bold text-arena text-center">
              ✨ {upgradeBanner}
            </div>
          )}
        </section>

        {/* Historial de Pedidos con Compra Protegida y PIN dictable gigante */}
        <section
          aria-label="Historial de Pedidos"
          className="rounded-2xl bg-[#14221D] border-2 border-arena/20 p-5 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-brand text-xl text-arena">
              Mis Pedidos ({buyer.transactions.length})
            </h2>
            <Link
              href="/marketplace"
              className="text-sm font-extrabold text-brillo hover:underline"
            >
              + Pedir ahora
            </Link>
          </div>

          {buyer.transactions.length > 0 ? (
            <div className="space-y-4">
              {buyer.transactions.map((tx) => {
                const delBadge = getDeliveryStatusBadge(tx.deliveryStatus);
                const isDelivered =
                  (tx.deliveryStatus || "").toLowerCase() === "delivered" ||
                  tx.status === "RELEASED";

                return (
                  <article
                    key={tx.contractId}
                    className="p-4 rounded-2xl bg-bosque border-2 border-arena/20 space-y-3.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-xs font-extrabold text-brillo">
                            {formatOrderCode(tx.contractId)}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full border text-xs font-extrabold ${delBadge.cls}`}
                          >
                            {delBadge.label}
                          </span>
                        </div>
                        <h3 className="font-brand text-lg sm:text-xl text-arena">
                          {tx.productName}
                        </h3>
                        <p className="text-xs text-arena/85">
                          Caserita: <strong>{tx.sellerName}</strong> ·{" "}
                          {tx.createdAt}
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-brand text-xl text-brillo block">
                          {formatBs(tx.amountMotes)}
                        </span>
                        <span
                          className={`text-xs font-extrabold ${
                            isDelivered ? "text-brote" : "text-oro"
                          }`}
                        >
                          {isDelivered
                            ? "✅ Pago liberado"
                            : "🛡️ Compra Protegida"}
                        </span>
                      </div>
                    </div>

                    {/* Barra visual de 3 pasos de Compra Protegida */}
                    <ProtectedPurchaseBar
                      deliveryStatus={tx.deliveryStatus}
                      orderStatus={tx.status}
                      amountBs={tx.amountMotes}
                      compact
                    />

                    {/* Auditoría On-Chain: contract_id real, Trustless Work Viewer y Stellar Expert */}
                    <OnChainEscrowAuditLinks
                      contractId={tx.contractId}
                      engagementId={tx.engagementId}
                      fundTxHash={tx.fundTxHash}
                      releaseTxHash={tx.releaseTxHash}
                      compact
                    />

                    {/* PIN de entrega en tipografía gigante y alto contraste */}
                    {tx.deliveryPin && (
                      <div
                        className={`rounded-2xl p-4 border-2 text-center space-y-1.5 ${
                          isDelivered
                            ? "bg-brote/15 border-brote/60"
                            : "bg-[#0B1410] border-oro"
                        }`}
                      >
                        <span className="text-xs font-extrabold uppercase tracking-wider text-arena block">
                          {isDelivered
                            ? "✅ Código de entrega validado"
                            : "Dile este código al repartidor al recibir tu pedido:"}
                        </span>
                        <span className="block font-mono text-5xl font-bold tracking-[0.2em] text-brillo">
                          {tx.deliveryPin}
                        </span>

                        <div className="flex flex-wrap items-center justify-center gap-2 pt-1 text-xs">
                          {tx.subsidizedByReserve || tx.usedFreeDelivery ? (
                            <span className="px-3 py-1 rounded-lg bg-brote/25 border border-brote text-arena font-bold">
                              🚲 Envío ecológico cubierto por EcoBanco
                            </span>
                          ) : (
                            <span className="text-arena/85 font-semibold">
                              🚲 Entrega ecológica en tu barrio
                            </span>
                          )}
                          {tx.riderName && (
                            <span className="text-arena/90">
                              · Repartidor: <strong>{tx.riderName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-arena/85">
              Aún no has realizado ningún pedido en el Mercado del Barrio.
            </p>
          )}
        </section>

        {/* Invita a un vecino */}
        <section
          aria-label="Invita a un vecino"
          className="rounded-2xl bg-gradient-to-r from-[#1E3329] via-[#26291A] to-[#1A2D24] border-2 border-brote/60 p-5 space-y-3.5"
        >
          <div className="space-y-1">
            <h2 className="font-brand text-2xl text-arena">
              Invita a un vecino
            </h2>
            <p className="text-sm text-arena/90">
              Comparte tu código barrial para que tus vecinos pidan sin
              comisiones y con envío ecológico.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <div className="px-4 py-3 rounded-xl bg-bosque border-2 border-oro/50 text-center font-mono font-extrabold text-xl text-brillo">
              {buyer.referrals.code}
            </div>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="flex-1 py-3.5 px-4 rounded-xl bg-[#25D366] text-bosque font-extrabold text-sm uppercase tracking-wider shadow active:scale-95 transition"
            >
              📲 Compartir por WhatsApp
            </button>
          </div>

          {referralBanner && (
            <div className="p-3 rounded-xl bg-brote/25 border border-brote text-sm font-bold text-arena">
              ✨ {referralBanner}
            </div>
          )}
        </section>
      </main>

      {/* Envoltura visual "Cargar saldo con QR de tu Banco" sobre Pollar RampWidget */}
      <BankQrRechargeModal
        open={Boolean(rampMode)}
        role="buyer"
        userId={buyer.id}
        purpose={rampMode === "club" ? "prosumer_subscription" : "fiat_topup"}
        amountBs={
          rampMode === "club"
            ? 100
            : Math.max(10, Math.round(Number(topupAmountInput) || 50))
        }
        subtitle={
          rampMode === "club"
            ? "Carga 100 Bs con QR de tu banco para activar tu Club Vecino."
            : "Carga saldo en Bolivianos (Bs) escaneando el QR desde la app de tu banco."
        }
        onRampCredited={(event: RampCreditedEvent) => {
          const prevMode = rampMode;
          if (event.buyer) {
            setBuyer(event.buyer);
          }
          setPendingRampOrder(null);
          setPaymentError(null);
          setUpgradeError(null);
          if (prevMode === "club") {
            setUpgradeBanner(event.message);
          } else {
            setPaymentFeedback(event.message);
          }
          setRampMode(null);
        }}
        onRampPending={(pending) => {
          const prevMode = rampMode === "club" ? "club" : "topup";
          setPendingRampOrder({ ...pending, mode: prevMode });
          setPaymentError(null);
          setPaymentFeedback(
            `Orden Pollar ${pending.pollarOrderId} en curso (${pending.state}). Se acreditará automáticamente cuando se confirme.`
          );
        }}
        onRampError={(errMsg) => {
          const msg = translateBackendMessage(errMsg);
          setPaymentError(msg);
          setUpgradeError(msg);
        }}
        onClose={() => {
          setRampMode(null);
        }}
      />
    </div>
  );
}
