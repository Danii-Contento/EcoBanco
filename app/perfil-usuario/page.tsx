"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  RefreshCw,
  Settings,
  ShoppingBasket,
} from "lucide-react";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  extractCompletedRampOrder,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  formatOrderCode,
  getDeliveryStatusCopy,
  getPaymentProtectionCopy,
  getRechargeStatusLabel,
  getRechargeStatusMessage,
  sanitizeUserError,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import {
  buildWhatsAppOrderUrl,
  formatBolivianPhoneDisplay,
  normalizeBolivianPhone,
  sanitizeLocalPhoneInput,
} from "@/app/lib/phone";
import { disconnectProfileSession } from "@/app/lib/useDisconnectOnReload";
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
import {
  BolivianPhoneField,
  QuickNeighborAuthForm,
} from "@/app/components/QuickNeighborAuthForm";
import { ThemeToggleSetting } from "@/app/components/ThemeToggleSetting";
import { User } from "@/app/types/ecobanco";

export default function PerfilUsuarioPage() {
  const router = useRouter();
  const {
    getClient: getPollarClient,
    isAuthenticated: isPollarAuthenticated,
    logout: pollarLogout,
  } = usePollar();

  const [buyer, setBuyer] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeView, setActiveView] = useState<"principal" | "configuracion">(
    "principal"
  );
  const [pollarDraft, setPollarDraft] = useState<{
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  }>({});

  const [isUpgrading, setIsUpgrading] = useState<boolean>(false);
  const [upgradeBanner, setUpgradeBanner] = useState<string | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [referralBanner, setReferralBanner] = useState<string | null>(null);
  const [rampMode, setRampMode] = useState<null | "topup" | "club">(null);
  const [pendingRampOrder, setPendingRampOrder] = useState<
    (RampPendingEvent & { mode: "topup" | "club" }) | null
  >(null);
  const [isCheckingPendingRamp, setIsCheckingPendingRamp] =
    useState<boolean>(false);
  const [paymentFeedback, setPaymentFeedback] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const skipAutoPollarLoginRef = useRef<boolean>(false);
  const pollarLookupKeyRef = useRef<string>("");

  // Edición de Nombre, WhatsApp y Dirección de Entrega en Configuración
  const [nameInput, setNameInput] = useState<string>("");
  const [phoneDigitsInput, setPhoneDigitsInput] = useState<string>("");
  const [deliveryAddressInput, setDeliveryAddressInput] = useState<string>("");
  const [isSavingContact, setIsSavingContact] = useState<boolean>(false);
  const [contactMsg, setContactMsg] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const syncFormFieldsFromBuyer = useCallback((loadedBuyer: User | null) => {
    if (!loadedBuyer) return;
    setNameInput(loadedBuyer.name || "");
    setPhoneDigitsInput(sanitizeLocalPhoneInput(loadedBuyer.phone || ""));
    setDeliveryAddressInput(
      loadedBuyer.deliveryAddress || loadedBuyer.address || ""
    );
  }, []);

  const loadBuyerData = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/users");
      const data = res.ok ? await res.json() : {};
      const loadedBuyer: User | null = data.buyer || null;
      setBuyer(loadedBuyer);
      syncFormFieldsFromBuyer(loadedBuyer);
    } catch {
      setBuyer(null);
    } finally {
      setIsLoading(false);
    }
  }, [syncFormFieldsFromBuyer]);

  useEffect(() => {
    void loadBuyerData();
  }, [loadBuyerData]);

  const handleBuyerPollarSynced = useCallback((result: PollarSyncResult) => {
    if (!result.synced) return;
    setPollarDraft({
      pollarUserId: result.pollarUserId ?? null,
      stellarAddress: result.stellarAddress ?? null,
    });
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
      setPollarDraft({
        pollarUserId: profile.pollarUserId ?? null,
        stellarAddress: profile.stellarAddress ?? null,
      });

      if (buyer?.isLoggedIn || skipAutoPollarLoginRef.current) {
        return;
      }

      const lookupKey = `${profile.pollarUserId || ""}|${
        profile.stellarAddress || ""
      }|${profile.email || ""}`;
      if (
        !lookupKey.replace(/\|/g, "") ||
        pollarLookupKeyRef.current === lookupKey
      ) {
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
          const matchedBuyer = data.buyer as User;
          setBuyer(matchedBuyer);
          syncFormFieldsFromBuyer(matchedBuyer);
        }
      } catch {
        // Non-blocking
      }
    },
    [buyer?.isLoggedIn, syncFormFieldsFromBuyer]
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
            translateBackendMessage(data.message) ||
              "¡Bienvenido al Club Vecino (100 Bs/mes)! Tu saldo en MOTES ya está activo con +50 MOTES y 5 envíos ecológicos incluidos."
          );
        } else {
          setPaymentFeedback(
            translateBackendMessage(data.message) ||
              `¡Recarga de ${Math.round(
                payload.amountBs
              )} Bs sumada a tu libreta comunitaria!`
          );
        }
        return { completed: true, state: order.state };
      }
      if (res.status === 409 && data.duplicate) {
        setPendingRampOrder(null);
        await loadBuyerData();
        return { completed: true, state: order.state };
      }
      setPaymentError(sanitizeUserError(data.error));
      return { completed: false, state: order.state };
    },
    [getPollarClient, loadBuyerData]
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
            setPaymentError(COMMUNITY_COPY.rechargeFailed);
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

  const handleQuickAuthenticated = (authenticatedBuyer: User) => {
    skipAutoPollarLoginRef.current = false;
    setBuyer(authenticatedBuyer);
    syncFormFieldsFromBuyer(authenticatedBuyer);
    void syncBuyerPollarInBackground(authenticatedBuyer);
  };

  const handleSaveContactInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactMsg(null);
    setContactError(null);

    const normalizedPhone = normalizeBolivianPhone(phoneDigitsInput);
    if (!normalizedPhone) {
      setContactError(
        "Ingresa los 8 dígitos de tu WhatsApp de Bolivia (ej. 76543210)."
      );
      return;
    }

    if (!deliveryAddressInput.trim()) {
      setContactError(
        "La dirección o referencia de entrega es obligatoria (ej. frente a la plaza, puerta café)."
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
          name: nameInput.trim() || undefined,
          phone: normalizedPhone,
          deliveryAddress: deliveryAddressInput.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setContactError(sanitizeUserError(data.error));
        return;
      }
      setBuyer(data.buyer);
      syncFormFieldsFromBuyer(data.buyer);
      setContactMsg(
        translateBackendMessage(
          data.message || "Datos de contacto y entrega actualizados."
        )
      );
    } catch (err) {
      setContactError(sanitizeUserError(err));
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
        setUpgradeError(sanitizeUserError(data.error));
        return;
      }
      setBuyer(data.buyer);
      void syncBuyerPollarInBackground(data.buyer);
      setUpgradeBanner(
        "¡Bienvenido al Club Vecino (100 Bs/mes)! Tu saldo en MOTES ya está activo con +50 MOTES y 5 envíos ecológicos incluidos."
      );
    } catch (err) {
      setUpgradeError(sanitizeUserError(err));
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
        setPaymentFeedback(getRechargeStatusMessage(outcome.state));
      }
    } catch (err) {
      setPaymentError(sanitizeUserError(err));
    } finally {
      setIsCheckingPendingRamp(false);
    }
  };

  const handleBuyerLogout = async (redirectHome = false) => {
    skipAutoPollarLoginRef.current = true;
    await disconnectProfileSession(
      redirectHome ? "logout_all" : "buyer_logout",
      pollarLogout
    );
    setBuyer(null);
    setPendingRampOrder(null);
    setActiveView("principal");
    if (redirectHome) {
      router.push("/");
    }
  };

  const handleShareWhatsApp = async () => {
    if (!buyer?.referrals.code) return;
    const shareText = `¡Hola vecino! Te invito a EcoBanco Bolivia para pedir del barrio sin comisiones. Usa mi código: ${buyer.referrals.code}`;
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
      `¡Código ${buyer.referrals.code} copiado! Compártelo con tus vecinos para ganar envíos ecológicos.`
    );
  };

  if (isLoading) {
    return (
      <div className="min-h-screen eco-page font-sans px-4 py-8">
        <div className="max-w-md sm:max-w-2xl mx-auto space-y-4">
          <div className="h-12 w-36 rounded-2xl bg-surface-soft dark:bg-[#182822] animate-pulse" />
          <div className="h-44 rounded-3xl bg-surface-soft dark:bg-[#182822] animate-pulse" />
          <div className="h-52 rounded-3xl bg-surface-soft dark:bg-[#182822] animate-pulse" />
        </div>
      </div>
    );
  }

  // Acceso ultrarrápido cuando el vecino necesita ver su libreta, pedidos o recargar QR
  if (!buyer?.isLoggedIn) {
    return (
      <div className="min-h-screen eco-page font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto space-y-5">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-ink dark:text-arena text-sm font-extrabold shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Inicio</span>
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-primary dark:text-[#69D86E] text-sm font-extrabold shadow-sm"
            >
              <ShoppingBasket className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Ver Mercado</span>
            </Link>
          </div>

          <div className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/40 shadow-warm-card dark:shadow-gold-glow p-5 sm:p-7 space-y-5">
            <QuickNeighborAuthForm
              title="Tu Libreta y Pedidos"
              subtitle="Ingresa solo con tu nombre o apodo y tu WhatsApp de 8 dígitos para ver tus pedidos, códigos de entrega o recargar QR."
              submitLabel="Ver mi Libreta y Pedidos →"
              pollarDraft={pollarDraft}
              onAuthenticated={handleQuickAuthenticated}
            />

            <div className="pt-4 border-t border-earth-border dark:border-oro/25 text-center space-y-2.5">
              <p className="text-xs font-semibold text-ink-muted dark:text-arena/75">
                ¿Solo quieres mirar los puestos abiertos del barrio?
              </p>
              <Link
                href="/marketplace"
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-aji hover:bg-aji-hover text-white dark:bg-bosque dark:border dark:border-oro/50 dark:text-brillo font-extrabold text-sm inline-flex items-center justify-center gap-2 transition"
              >
                <ShoppingBasket
                  className="w-4 h-4 shrink-0"
                  aria-hidden="true"
                />
                <span>Explorar el Mercado sin iniciar sesión →</span>
              </Link>
            </div>

            <PollarWalletSection
              role="buyer"
              mode="auth-entry"
              onSynced={handleBuyerPollarSynced}
              onPollarProfileLoaded={handlePollarGuestProfile}
            />
          </div>
        </div>
      </div>
    );
  }

  const savedBuyerAddress = buyer.deliveryAddress || buyer.address || "";

  return (
    <div className="min-h-screen eco-page font-sans pb-20">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-ink dark:text-arena text-sm font-extrabold shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Inicio</span>
            </Link>
            <Link
              href="/marketplace"
              className="inline-flex items-center gap-1.5 px-3.5 min-h-[48px] rounded-2xl bg-primary text-white dark:bg-brote dark:text-bosque text-sm font-extrabold shadow-sm"
            >
              <ShoppingBasket className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Mercado</span>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setContactMsg(null);
                setContactError(null);
                setActiveView(
                  activeView === "configuracion" ? "principal" : "configuracion"
                );
              }}
              className={`inline-flex items-center gap-1.5 px-3.5 min-h-[48px] rounded-2xl text-xs sm:text-sm font-extrabold transition ${
                activeView === "configuracion"
                  ? "bg-sol dark:bg-oro text-ink dark:text-bosque shadow"
                  : "bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-ink dark:text-arena"
              }`}
            >
              <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>
                {activeView === "configuracion" ? "Mi Perfil" : "Configuración"}
              </span>
            </button>
            <button
              type="button"
              onClick={() => void handleBuyerLogout(false)}
              className="px-3.5 min-h-[48px] rounded-2xl eco-btn-danger text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Cabecera amigable del Vecino */}
        <header className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/35 shadow-warm-card dark:shadow-none p-5 space-y-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full bg-primary/12 dark:bg-brote/25 text-primary dark:text-[#69D86E] text-xs font-extrabold uppercase">
              👤 Perfil de Vecino
            </span>
            {buyer.isProsumer && (
              <span className="px-3 py-1 rounded-full bg-sol dark:bg-oro text-ink dark:text-bosque text-xs font-extrabold uppercase">
                ⭐ Club Vecino Activo
              </span>
            )}
            {(buyer.freeDeliveries ?? 0) > 0 && (
              <span className="px-3 py-1 rounded-full bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 text-xs font-bold text-primary dark:text-[#69D86E]">
                🚲 {buyer.freeDeliveries} envíos incluidos
              </span>
            )}
          </div>
          <h1 className="font-brand text-3xl text-ink dark:text-arena">
            {buyer.name}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs sm:text-sm text-ink-muted dark:text-arena/80 font-semibold">
            {buyer.phone && (
              <span>📱 {formatBolivianPhoneDisplay(buyer.phone)}</span>
            )}
            {savedBuyerAddress && <span>🏠 {savedBuyerAddress}</span>}
          </div>
        </header>

        {activeView === "configuracion" ? (
          /* CONFIGURACIÓN DEL VECINO (Tema Día/Noche + Datos rápidos de entrega) */
          <section className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/35 shadow-warm-card dark:shadow-none p-5 space-y-5">
            <div>
              <h2 className="font-brand text-2xl text-ink dark:text-arena">
                ⚙️ Configuración
              </h2>
              <p className="text-xs sm:text-sm text-ink-muted dark:text-arena/80">
                Cambia entre Modo Día (Ajayu) y Modo Noche, o actualiza tu
                dirección de entrega.
              </p>
            </div>

            <ThemeToggleSetting />

            {contactMsg && (
              <div className="p-3.5 rounded-2xl eco-alert-success text-sm font-bold">
                ✅ {contactMsg}
              </div>
            )}
            {contactError && (
              <div className="p-3.5 rounded-2xl eco-alert-error text-sm font-bold">
                ⚠️ {contactError}
              </div>
            )}

            <form onSubmit={handleSaveContactInfo} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="profile-name-input"
                  className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
                >
                  Nombre o apodo *
                </label>
                <input
                  id="profile-name-input"
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ej. Doña Rosa"
                  className="w-full min-h-[52px] px-4 rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] text-base font-semibold text-ink dark:text-arena focus:outline-none focus:border-primary dark:focus:border-brillo"
                />
              </div>

              <BolivianPhoneField
                id="profile-phone-input"
                value={phoneDigitsInput}
                onChange={setPhoneDigitsInput}
              />

              <div className="space-y-1.5">
                <label
                  htmlFor="profile-address-input"
                  className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
                >
                  Dirección o referencia de entrega *
                </label>
                <input
                  id="profile-address-input"
                  type="text"
                  required
                  value={deliveryAddressInput}
                  onChange={(e) => setDeliveryAddressInput(e.target.value)}
                  placeholder="Ej. Frente a la plaza, puerta café"
                  className="w-full min-h-[52px] px-4 rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] text-base font-semibold text-ink dark:text-arena focus:outline-none focus:border-primary dark:focus:border-brillo"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingContact}
                className="w-full sm:w-auto min-h-[52px] px-6 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-gradient-to-r dark:from-oro dark:to-brillo dark:text-bosque font-extrabold text-sm uppercase shadow"
              >
                {isSavingContact
                  ? "Guardando..."
                  : "Guardar WhatsApp y Dirección"}
              </button>
            </form>
          </section>
        ) : (
          <>
            {/* 1. Mis Pedidos y Códigos de Entrega */}
            <section
              id="mis-movimientos"
              aria-label="Mis movimientos"
              className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/35 shadow-warm-card dark:shadow-none p-5 space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-brand text-xl text-ink dark:text-arena">
                  🛍️ {COMMUNITY_COPY.movementsCta} ({buyer.transactions.length})
                </h2>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void loadBuyerData()}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] rounded-xl bg-surface-soft dark:bg-bosque border border-earth-border dark:border-oro/30 text-xs font-extrabold text-ink dark:text-arena"
                  >
                    <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Actualizar</span>
                  </button>
                  <Link
                    href="/marketplace"
                    className="px-3 min-h-[40px] rounded-xl bg-aji/10 dark:bg-oro/20 text-aji dark:text-brillo text-xs sm:text-sm font-extrabold inline-flex items-center"
                  >
                    + Pedir
                  </Link>
                </div>
              </div>

              {buyer.transactions.length > 0 ? (
                <div className="space-y-4">
                  {buyer.transactions.map((tx) => {
                    const delBadge = getDeliveryStatusCopy(tx.deliveryStatus);
                    const protection = getPaymentProtectionCopy(
                      tx.status,
                      tx.deliveryStatus
                    );
                    const isDelivered = protection.isReleased;
                    const orderCode = formatOrderCode(
                      tx.orderId || tx.contractId
                    );
                    const whatsappOrderUrl = buildWhatsAppOrderUrl({
                      orderCode,
                      productName: tx.productName,
                      quantity: tx.quantity,
                      totalBs: tx.amountMotes,
                      sellerName: tx.sellerName,
                      buyerName: buyer.name,
                      buyerPhone: buyer.phone,
                      deliveryAddress: savedBuyerAddress,
                      specialNotes: tx.specialNotes,
                    });

                    return (
                      <article
                        key={tx.contractId}
                        className="p-4 rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 space-y-3.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-xl bg-sol/25 dark:bg-oro/20 font-mono text-xs font-extrabold text-[#7A4700] dark:text-brillo">
                                {orderCode}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full eco-alert-success text-xs font-extrabold">
                                {delBadge.label}
                              </span>
                            </div>
                            <h3 className="font-brand text-lg sm:text-xl text-ink dark:text-arena">
                              {(tx.quantity ?? 1) > 1
                                ? `${tx.quantity}x `
                                : ""}
                              {tx.productName}
                            </h3>
                            <p className="text-xs text-ink-muted dark:text-arena/75">
                              Caserita: <strong>{tx.sellerName}</strong> ·{" "}
                              {tx.createdAt}
                            </p>
                            {tx.specialNotes && (
                              <p className="text-xs font-semibold rounded-xl bg-surface dark:bg-bosque border border-earth-border dark:border-oro/25 px-2.5 py-1.5 text-ink dark:text-arena">
                                📝 <strong>Nota:</strong> {tx.specialNotes}
                              </p>
                            )}
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-brand text-xl text-ink dark:text-brillo block">
                              {formatBs(tx.amountMotes)}
                            </span>
                            <span className="block text-[11px] font-bold text-[#8A5100] dark:text-oro">
                              = {formatMotes(tx.amountMotes)}
                            </span>
                            <span
                              className={`text-xs font-extrabold ${
                                isDelivered
                                  ? "text-primary dark:text-[#69D86E]"
                                  : "text-[#8A5100] dark:text-brillo"
                              }`}
                            >
                              {protection.badgeLabel}
                            </span>
                          </div>
                        </div>

                        <ProtectedPurchaseBar
                          deliveryStatus={tx.deliveryStatus}
                          orderStatus={tx.status}
                          amountBs={tx.amountMotes}
                          compact
                        />

                        <OnChainEscrowAuditLinks
                          contractId={tx.contractId}
                          engagementId={tx.engagementId}
                          fundTxHash={tx.fundTxHash}
                          releaseTxHash={tx.releaseTxHash}
                          compact
                        />

                        {tx.deliveryPin && (
                          <div className="rounded-2xl p-4 eco-pin-box border-2 border-oro text-center space-y-1.5">
                            <span className="text-xs font-extrabold uppercase tracking-wider block">
                              {isDelivered
                                ? "✅ Código de entrega validado"
                                : "Dile este código al repartidor al recibir tu pedido:"}
                            </span>
                            <span className="block font-mono text-5xl font-bold tracking-[0.2em] eco-pin-digits">
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

                        <a
                          href={whatsappOrderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-[#25D366] hover:brightness-95 text-bosque font-extrabold text-sm inline-flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition"
                        >
                          <MessageCircle
                            className="w-4 h-4 shrink-0"
                            aria-hidden="true"
                          />
                          <span>Avisar por WhatsApp</span>
                        </a>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 p-5 text-center space-y-3">
                  <p className="text-sm text-ink-muted dark:text-arena/80">
                    Todavía no tienes pedidos aquí. Recuerda que puedes pedir
                    directo en el Mercado del Barrio pagando con tu saldo o QR
                    exacto.
                  </p>
                  <Link
                    href="/marketplace"
                    className="inline-flex items-center justify-center min-h-[48px] px-5 py-2.5 rounded-2xl bg-aji hover:bg-aji-hover text-white dark:bg-gradient-to-r dark:from-oro dark:to-brillo dark:text-bosque font-extrabold text-xs uppercase"
                  >
                    Ir al Mercado del Barrio →
                  </Link>
                </div>
              )}
            </section>

            {/* 2. Mi Libreta Comunitaria */}
            <div className="space-y-3">
              <PollarWalletSection
                role="buyer"
                userId={buyer.id}
                savedStellarAddress={buyer.stellar_address}
                savedPollarUserId={buyer.pollar_user_id}
                mode="profile-badge"
                balanceBs={buyer.fiatBs ?? 0}
                balanceMotes={buyer.motes ?? 0}
                rechargeAmountBs={50}
                movementsHref="#mis-movimientos"
                movementsCount={buyer.transactions.length}
                onOpenRecharge={() => {
                  setPaymentError(null);
                  setPaymentFeedback(null);
                  setRampMode("topup");
                }}
                onSynced={handleBuyerPollarSynced}
              />

              {pendingRampOrder && (
                <div className="rounded-2xl eco-card-gold p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold eco-text-gold">
                    ⏳ {getRechargeStatusLabel(pendingRampOrder.state)}
                  </span>
                  <button
                    type="button"
                    disabled={isCheckingPendingRamp}
                    onClick={handleCheckPendingRamp}
                    className="px-3.5 min-h-[40px] rounded-xl bg-sol dark:bg-gradient-to-r dark:from-oro dark:to-brillo text-ink dark:text-bosque font-extrabold uppercase disabled:opacity-60"
                  >
                    {isCheckingPendingRamp
                      ? "Verificando..."
                      : "🔄 Verificar mi recarga"}
                  </button>
                </div>
              )}

              {paymentFeedback && (
                <div className="p-3.5 rounded-2xl eco-alert-success text-xs sm:text-sm font-bold">
                  ✨ {paymentFeedback}
                </div>
              )}
              {paymentError && (
                <div className="p-3.5 rounded-2xl eco-alert-error text-xs sm:text-sm font-bold">
                  ⚠️ {paymentError}
                </div>
              )}
            </div>

            {/* 3. Club Vecino (Opcional) */}
            <section
              aria-label="Club Vecino"
              className="rounded-3xl eco-card-gold p-5 space-y-3.5"
            >
              {!buyer.isProsumer ? (
                <div className="text-center space-y-3">
                  <div className="space-y-1">
                    <span className="text-xs font-extrabold uppercase tracking-wider eco-text-gold">
                      ⭐ Opcional para vecinos frecuentes
                    </span>
                    <h2 className="font-brand text-2xl eco-text">
                      Club Vecino · 100 Bs/mes
                    </h2>
                  </div>
                  <p className="text-sm eco-text-muted leading-relaxed">
                    No es obligatorio para comprar. Si pides seguido en el
                    barrio, puedes sumarte para recibir{" "}
                    <strong className="eco-text-gold">
                      50 Bs de regalo en MOTES
                    </strong>{" "}
                    y{" "}
                    <strong className="eco-text-green">
                      5 envíos ecológicos incluidos
                    </strong>
                    .
                  </p>
                  {Number(buyer.fiatBs ?? 0) >= 100 ? (
                    <button
                      type="button"
                      disabled={isUpgrading}
                      onClick={() => handleJoinClubVecino()}
                      className="w-full min-h-[54px] py-3.5 px-6 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-lg shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition"
                    >
                      {isUpgrading
                        ? "Activando Club Vecino..."
                        : "Activar Club Vecino con mi saldo (100 Bs)"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setUpgradeError(null);
                        setRampMode("club");
                      }}
                      className="w-full min-h-[54px] py-3.5 px-6 rounded-2xl bg-sol hover:brightness-95 text-ink dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-lg shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition"
                    >
                      📲 Activar Club Vecino con QR (100 Bs)
                    </button>
                  )}
                  {upgradeError && (
                    <div className="p-3 rounded-2xl eco-alert-error text-xs sm:text-sm font-bold">
                      ⚠️ {upgradeError}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1 text-center sm:text-left">
                  <span className="inline-block px-3 py-1 rounded-full bg-primary text-white dark:bg-brote dark:text-bosque font-extrabold text-xs uppercase">
                    ✅ Club Vecino Activo ({buyer.freeDeliveries} envíos
                    incluidos)
                  </span>
                  <p className="text-sm eco-text-muted">
                    Tienes tus Puntos de Trueque activos (
                    {COMMUNITY_COPY.moteParityDetail}) para usarlos en tus
                    próximos pedidos del barrio.
                  </p>
                </div>
              )}

              {upgradeBanner && (
                <div className="p-3.5 rounded-2xl eco-alert-success text-sm font-bold text-center">
                  ✨ {upgradeBanner}
                </div>
              )}
            </section>

            {/* 4. Invita a un vecino */}
            {buyer.referrals.code && (
              <section
                aria-label="Invita a un vecino"
                className="rounded-3xl eco-card-green p-5 space-y-3.5"
              >
                <div className="space-y-1">
                  <h2 className="font-brand text-2xl eco-text">
                    Invita a un vecino
                  </h2>
                  <p className="text-sm eco-text-muted">
                    Comparte tu código barrial para que tus vecinos pidan sin
                    comisiones y con envío ecológico.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="px-4 py-3 rounded-2xl eco-inset text-center font-mono font-extrabold text-xl eco-text-gold">
                    {buyer.referrals.code}
                  </div>
                  <button
                    type="button"
                    onClick={handleShareWhatsApp}
                    className="flex-1 min-h-[50px] py-3.5 px-4 rounded-2xl bg-[#25D366] text-bosque font-extrabold text-sm uppercase tracking-wider shadow active:scale-95 transition"
                  >
                    📲 Compartir por WhatsApp
                  </button>
                </div>

                {referralBanner && (
                  <div className="p-3 rounded-2xl eco-alert-success text-sm font-bold">
                    ✨ {referralBanner}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </main>

      {/* Modal comunitario para recargas con QR bancario */}
      <BankQrRechargeModal
        open={Boolean(rampMode)}
        role="buyer"
        userId={buyer.id}
        purpose={rampMode === "club" ? "prosumer_subscription" : "fiat_topup"}
        amountBs={rampMode === "club" ? 100 : 50}
        subtitle={
          rampMode === "club"
            ? "Recarga 100 Bs con QR de tu banco para activar tu Club Vecino."
            : "Recarga saldo en Bolivianos (Bs) escaneando el QR desde la app de tu banco."
        }
        onRampCredited={(event: RampCreditedEvent) => {
          const prevMode = rampMode;
          if (event.buyer) {
            setBuyer(event.buyer);
          }
          setPendingRampOrder(null);
          setPaymentError(null);
          setUpgradeError(null);
          const cleanMessage =
            translateBackendMessage(event.message) ||
            "¡Recarga confirmada y sumada a tu libreta comunitaria!";
          if (prevMode === "club") {
            setUpgradeBanner(cleanMessage);
          } else {
            setPaymentFeedback(cleanMessage);
          }
          setRampMode(null);
        }}
        onRampPending={(pending) => {
          const prevMode = rampMode === "club" ? "club" : "topup";
          setPendingRampOrder({ ...pending, mode: prevMode });
          setPaymentError(null);
          setPaymentFeedback(getRechargeStatusMessage(pending.state));
        }}
        onRampError={(errMsg) => {
          const msg = sanitizeUserError(errMsg);
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
