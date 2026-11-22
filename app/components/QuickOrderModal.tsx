"use client";

import React, { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  MapPin,
  QrCode,
  ShieldCheck,
  Store,
  User as UserIcon,
  Wallet,
  X,
} from "lucide-react";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  sanitizeUserError,
} from "@/app/lib/friendlyCopy";
import {
  formatBolivianPhoneDisplay,
  isValidBolivianPhone,
  normalizeBolivianPhone,
  sanitizeLocalPhoneInput,
} from "@/app/lib/phone";
import { BolivianPhoneField } from "@/app/components/QuickNeighborAuthForm";
import { Product, User } from "@/app/types/ecobanco";

interface QuickOrderModalProps {
  product: Product | null;
  buyer: User | null;
  quantity: number;
  specialNotes: string;
  pollarDraft?: {
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  };
  isProcessing: boolean;
  processingLabel: string;
  externalError: string | null;
  qrPendingNotice: string | null;
  hiddenForQr: boolean;
  onQuantityChange: (nextQty: number) => void;
  onSpecialNotesChange: (notes: string) => void;
  onBuyerUpdated: (buyer: User) => void;
  onPayWithBalance: (method: "fiat" | "motes", buyerPin: string) => void;
  onPayWithBankQr: (buyerPin: string) => void;
  onClose: () => void;
}

/**
 * Flujo directo de compra ("Pedir ahora") en máximo 2 pasos:
 * Paso 1: Confirmar dirección/referencia (y acceso rápido de Nombre + WhatsApp si es invitado).
 * Paso 2: Elegir pago (Saldo Libreta o QR Bancario).
 */
export function QuickOrderModal({
  product,
  buyer,
  quantity,
  specialNotes,
  pollarDraft,
  isProcessing,
  processingLabel,
  externalError,
  qrPendingNotice,
  hiddenForQr,
  onQuantityChange,
  onSpecialNotesChange,
  onBuyerUpdated,
  onPayWithBalance,
  onPayWithBankQr,
  onClose,
}: QuickOrderModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [editingIdentity, setEditingIdentity] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>("");
  const [phoneDigits, setPhoneDigits] = useState<string>("");
  const [pinInput, setPinInput] = useState<string>("");
  const [spendPinInput, setSpendPinInput] = useState<string>("");
  const [addressInput, setAddressInput] = useState<string>("");
  const [stepError, setStepError] = useState<string | null>(null);
  const [isSavingStep, setIsSavingStep] = useState<boolean>(false);
  const [paymentChoice, setPaymentChoice] = useState<"wallet" | "qr">("qr");
  const [walletCurrency, setWalletCurrency] = useState<"fiat" | "motes">(
    "fiat"
  );

  const hasValidIdentity = Boolean(
    buyer?.isLoggedIn &&
      buyer.name?.trim() &&
      isValidBolivianPhone(buyer.phone)
  );

  useEffect(() => {
    if (!product) return;
    setStep(1);
    setStepError(null);
    setNameInput(buyer?.name || "");
    setPhoneDigits(sanitizeLocalPhoneInput(buyer?.phone || ""));
    setPinInput("");
    setSpendPinInput("");
    setAddressInput(buyer?.deliveryAddress || buyer?.address || "");
    setEditingIdentity(!hasValidIdentity);
  }, [product?.id]);

  useEffect(() => {
    if (!product) return;
    if (buyer?.isLoggedIn) {
      if (!nameInput.trim() && buyer.name) setNameInput(buyer.name);
      if (!phoneDigits && buyer.phone) {
        setPhoneDigits(sanitizeLocalPhoneInput(buyer.phone));
      }
      if (!addressInput.trim() && (buyer.deliveryAddress || buyer.address)) {
        setAddressInput(buyer.deliveryAddress || buyer.address || "");
      }
    }
  }, [buyer, product, nameInput, phoneDigits, addressInput]);

  const totalBs = product
    ? Math.max(1, Math.round(Number(product.priceMotes) * quantity))
    : 0;

  const buyerFiatBs = Number(buyer?.fiatBs ?? 0);
  const buyerMotes = Number(buyer?.motes ?? 0);
  const buyerHasActiveMotes = Boolean(
    buyer?.isProsumer || buyer?.motesEnabled || buyerMotes > 0
  );
  const canPayWithFiat = Boolean(buyer?.isLoggedIn && buyerFiatBs >= totalBs);
  const canPayWithMotes = Boolean(
    buyer?.isLoggedIn && buyerHasActiveMotes && buyerMotes >= totalBs
  );
  const canPayWithWallet = canPayWithFiat || canPayWithMotes;

  useEffect(() => {
    if (!product) return;
    if (canPayWithWallet) {
      setPaymentChoice("wallet");
      setWalletCurrency(canPayWithFiat ? "fiat" : "motes");
    } else {
      setPaymentChoice("qr");
    }
  }, [product?.id, step, canPayWithWallet, canPayWithFiat]);

  if (!product || hiddenForQr) {
    return null;
  }

  const handleStepOneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStepError(null);

    const cleanAddress = addressInput.trim();
    if (!cleanAddress) {
      setStepError(
        "Escribe tu dirección o referencia para que llegue el pedido (ej. frente a la plaza, puerta café)."
      );
      return;
    }

    const needsIdentitySave = !hasValidIdentity || editingIdentity;

    try {
      setIsSavingStep(true);

      if (needsIdentitySave) {
        const cleanName = nameInput.trim();
        const normalizedPhone = normalizeBolivianPhone(phoneDigits);
        const cleanPin = pinInput.replace(/\D/g, "").slice(0, 4);
        if (!cleanName) {
          setStepError("Escribe tu nombre o apodo para continuar.");
          return;
        }
        if (!normalizedPhone) {
          setStepError(
            "Ingresa los 8 dígitos de tu WhatsApp de Bolivia (ej. 76543210)."
          );
          return;
        }
        if (cleanPin.length !== 4) {
          setStepError(
            "Ingresa tu PIN personal de 4 números para proteger tu cuenta y tu saldo."
          );
          return;
        }

        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "quick_neighbor_login",
            name: cleanName,
            phone: normalizedPhone,
            pin: cleanPin,
            deliveryAddress: cleanAddress,
            pollar_user_id: pollarDraft?.pollarUserId || undefined,
            stellar_address: pollarDraft?.stellarAddress || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.buyer) {
          setStepError(sanitizeUserError(data.error));
          return;
        }

        onBuyerUpdated(data.buyer as User);
        setSpendPinInput(cleanPin);
        setEditingIdentity(false);
        setStep(2);
        return;
      }

      const savedAddress = (
        buyer?.deliveryAddress ||
        buyer?.address ||
        ""
      ).trim();

      if (buyer && cleanAddress !== savedAddress) {
        const normalizedBuyerPhone = normalizeBolivianPhone(buyer.phone);
        if (!normalizedBuyerPhone) {
          setEditingIdentity(true);
          setStepError(
            "Confirma los 8 dígitos de tu WhatsApp para guardar tu entrega."
          );
          return;
        }

        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "buyer_update_profile",
            name: buyer.name,
            phone: normalizedBuyerPhone,
            deliveryAddress: cleanAddress,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.buyer) {
          setStepError(sanitizeUserError(data.error));
          return;
        }
        onBuyerUpdated(data.buyer as User);
      }

      setStep(2);
    } catch (err) {
      setStepError(sanitizeUserError(err));
    } finally {
      setIsSavingStep(false);
    }
  };

  const handleConfirmPayment = () => {
    setStepError(null);
    const cleanSpendPin = spendPinInput.replace(/\D/g, "").slice(0, 4);
    if (cleanSpendPin.length !== 4) {
      setStepError(
        "Ingresa tu PIN personal de 4 números para autorizar el pago protegido."
      );
      return;
    }
    if (paymentChoice === "wallet" && canPayWithWallet) {
      onPayWithBalance(walletCurrency, cleanSpendPin);
      return;
    }
    onPayWithBankQr(cleanSpendPin);
  };

  const displayError = stepError || externalError;
  const missingBs = Math.max(0, Math.ceil(totalBs - buyerFiatBs));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Pedir ${product.name}`}
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/45 shadow-warm-lg dark:shadow-gold-glow max-h-[92vh] overflow-y-auto p-5 sm:p-6 space-y-4">
        {/* Cabecera del producto + indicador de 2 pasos */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {product.imageUrl ? (
              <img
                src={product.imageUrl}
                alt={product.name}
                className="w-16 h-16 rounded-2xl object-cover border-2 border-sol dark:border-oro shrink-0"
              />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 flex items-center justify-center text-primary dark:text-brillo shrink-0">
                <Store className="w-7 h-7" aria-hidden="true" />
              </div>
            )}

            <div className="min-w-0 space-y-0.5">
              <span className="block text-xs font-extrabold uppercase tracking-wide text-primary dark:text-[#69D86E] truncate">
                🏪 {product.sellerName}
              </span>
              <h3 className="font-brand text-xl text-ink dark:text-arena leading-tight truncate">
                {product.name}
              </h3>
              <p className="text-xs font-bold text-ink-muted dark:text-arena/80">
                {formatBs(product.priceMotes)} · = {formatMotes(product.priceMotes)} c/u
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar pedido"
            className="w-10 h-10 rounded-full bg-surface-soft dark:bg-bosque text-ink dark:text-arena flex items-center justify-center hover:bg-earth-border/60 shrink-0 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Barra de progreso de 2 pasos */}
        <div className="grid grid-cols-2 gap-2">
          <div
            className={`px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-2 ${
              step === 1
                ? "bg-primary/10 dark:bg-oro/20 border-primary dark:border-oro text-primary dark:text-brillo"
                : "bg-surface-soft dark:bg-[#14221D] border-primary/40 dark:border-brote/50 text-primary dark:text-[#69D86E]"
            }`}
          >
            <span className="w-5 h-5 rounded-full bg-primary dark:bg-brote text-white dark:text-bosque inline-flex items-center justify-center text-[11px] font-extrabold shrink-0">
              {step === 2 ? "✓" : "1"}
            </span>
            <span>Paso 1 · Entrega</span>
          </div>

          <div
            className={`px-3 py-2 rounded-2xl border text-xs font-extrabold flex items-center gap-2 ${
              step === 2
                ? "bg-primary/10 dark:bg-oro/20 border-primary dark:border-oro text-primary dark:text-brillo"
                : "bg-surface-soft dark:bg-[#14221D] border-earth-border dark:border-oro/25 text-ink-muted dark:text-arena/65"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[11px] font-extrabold shrink-0 ${
                step === 2
                  ? "bg-primary dark:bg-oro text-white dark:text-bosque"
                  : "bg-earth-border dark:bg-bosque text-ink-muted dark:text-arena/70"
              }`}
            >
              2
            </span>
            <span>Paso 2 · Pago</span>
          </div>
        </div>

        {displayError && (
          <div
            role="alert"
            className="p-3.5 rounded-2xl eco-alert-error text-sm font-bold"
          >
            ⚠️ {displayError}
          </div>
        )}

        {qrPendingNotice && (
          <div className="p-3.5 rounded-2xl eco-alert-success text-xs sm:text-sm font-bold">
            ⏳ {qrPendingNotice}
          </div>
        )}

        {step === 1 ? (
          <form onSubmit={handleStepOneSubmit} className="space-y-4">
            {/* Cantidad + Total */}
            <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 p-3.5 flex items-center justify-between gap-3">
              <div>
                <span className="block text-xs font-extrabold uppercase text-ink-muted dark:text-arena/75">
                  Cantidad
                </span>
                <div className="flex items-baseline gap-2">
                  <strong className="font-brand text-2xl text-ink dark:text-brillo">
                    {formatBs(totalBs)}
                  </strong>
                  <span className="text-xs font-extrabold text-[#8A5100] dark:text-oro">
                    = {formatMotes(totalBs)}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Restar cantidad"
                  onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                  className="w-12 h-12 rounded-2xl bg-surface dark:bg-bosque border-2 border-earth-border dark:border-oro/40 text-ink dark:text-arena font-extrabold text-2xl flex items-center justify-center active:scale-95"
                >
                  −
                </button>
                <span className="w-8 text-center font-brand text-2xl text-ink dark:text-arena">
                  {quantity}
                </span>
                <button
                  type="button"
                  aria-label="Sumar cantidad"
                  onClick={() => onQuantityChange(Math.min(20, quantity + 1))}
                  className="w-12 h-12 rounded-2xl bg-sol dark:bg-gradient-to-r dark:from-oro dark:to-brillo text-ink dark:text-bosque font-extrabold text-2xl flex items-center justify-center active:scale-95"
                >
                  +
                </button>
              </div>
            </div>

            {/* Identidad rápida protegida (Nombre + WhatsApp 8 dígitos + PIN 4 dígitos) */}
            {!hasValidIdentity || editingIdentity ? (
              <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 p-4 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-primary dark:text-[#69D86E]">
                    👤 Tus datos protegidos (WhatsApp + PIN)
                  </span>
                  {hasValidIdentity && (
                    <button
                      type="button"
                      onClick={() => setEditingIdentity(false)}
                      className="text-xs font-extrabold text-ink-muted underline"
                    >
                      Listo
                    </button>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label
                    htmlFor="order-buyer-name"
                    className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
                  >
                    Tu Nombre o apodo *
                  </label>
                  <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5">
                    <UserIcon
                      className="w-5 h-5 text-ink-muted dark:text-brillo shrink-0 mr-2"
                      aria-hidden="true"
                    />
                    <input
                      id="order-buyer-name"
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Ej. María Quispe"
                      className="flex-1 min-w-0 min-h-[50px] bg-transparent text-base font-semibold text-ink dark:text-arena placeholder:text-ink-muted/60 focus:outline-none"
                    />
                  </div>
                </div>

                <BolivianPhoneField
                  id="order-buyer-phone"
                  value={phoneDigits}
                  onChange={setPhoneDigits}
                />

                <div className="space-y-1.5">
                  <label
                    htmlFor="order-buyer-pin"
                    className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
                  >
                    🔒 Tu PIN secreto de 4 números *
                  </label>
                  <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5">
                    <Lock
                      className="w-5 h-5 text-ink-muted dark:text-brillo shrink-0 mr-2"
                      aria-hidden="true"
                    />
                    <input
                      id="order-buyer-pin"
                      type="password"
                      inputMode="numeric"
                      maxLength={4}
                      required
                      value={pinInput}
                      onChange={(e) =>
                        setPinInput(
                          e.target.value.replace(/\D/g, "").slice(0, 4)
                        )
                      }
                      placeholder="Ej. 1234"
                      className="flex-1 min-w-0 min-h-[50px] bg-transparent text-base font-extrabold tracking-[0.3em] text-ink dark:text-arena placeholder:tracking-normal placeholder:font-semibold placeholder:text-ink-muted/60 focus:outline-none"
                    />
                  </div>
                  <p className="text-xs font-semibold text-ink-muted dark:text-arena/75">
                    Si eres nuevo, elige 4 números para proteger tu saldo. Si ya
                    tienes cuenta, escribe tu PIN.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/30 px-4 py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <span className="block text-xs font-extrabold uppercase text-primary dark:text-[#69D86E]">
                    👤 Pedido a nombre de
                  </span>
                  <p className="text-sm font-extrabold text-ink dark:text-arena truncate">
                    {buyer?.name} · {formatBolivianPhoneDisplay(buyer?.phone)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditingIdentity(true)}
                  className="px-3 min-h-[40px] rounded-xl bg-surface dark:bg-bosque border border-earth-border dark:border-oro/35 text-xs font-extrabold text-ink dark:text-brillo shrink-0"
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Dirección o referencia de entrega */}
            <div className="space-y-1.5">
              <label
                htmlFor="order-delivery-address"
                className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
              >
                📍 Dirección o referencia de entrega *
              </label>
              <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5">
                <MapPin
                  className="w-5 h-5 text-aji dark:text-brillo shrink-0 mr-2"
                  aria-hidden="true"
                />
                <input
                  id="order-delivery-address"
                  type="text"
                  required
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Ej. Frente a la plaza, puerta café"
                  className="flex-1 min-w-0 min-h-[52px] bg-transparent text-base font-semibold text-ink dark:text-arena placeholder:text-ink-muted/60 focus:outline-none"
                />
              </div>
            </div>

            {/* Nota opcional para la caserita */}
            <div className="space-y-1.5">
              <label
                htmlFor="order-special-notes"
                className="block text-xs font-extrabold uppercase tracking-wide text-ink-muted dark:text-arena/80"
              >
                📝 Nota para la caserita (opcional)
              </label>
              <input
                id="order-special-notes"
                type="text"
                maxLength={240}
                value={specialNotes}
                onChange={(e) => onSpecialNotesChange(e.target.value)}
                placeholder="Ej. Sin cebolla, llajua aparte, bien calientito"
                className="w-full min-h-[48px] px-3.5 rounded-2xl border border-earth-border dark:border-oro/35 bg-surface dark:bg-[#0D1714] text-sm sm:text-base text-ink dark:text-arena placeholder:text-ink-muted/60 focus:outline-none focus:border-primary dark:focus:border-brillo"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingStep || isProcessing}
              className="w-full min-h-[54px] px-5 py-3.5 rounded-2xl bg-aji hover:bg-aji-hover text-white dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-lg shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"
            >
              <span>
                {isSavingStep ? "Guardando entrega..." : "Elegir cómo pagar"}
              </span>
              <ArrowRight className="w-5 h-5 shrink-0" aria-hidden="true" />
            </button>
          </form>
        ) : (
          <div className="space-y-4">
            {/* Resumen compacto de entrega */}
            <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border border-earth-border dark:border-oro/25 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0 space-y-0.5">
                <span className="block text-xs font-extrabold text-ink dark:text-arena truncate">
                  {quantity}x {product.name} ·{" "}
                  <strong className="text-primary dark:text-brillo">
                    {formatBs(totalBs)}
                  </strong>{" "}
                  <span className="text-ink-muted dark:text-arena/70">
                    ({formatMotes(totalBs)})
                  </span>
                </span>
                <span className="block text-xs font-semibold text-ink-muted dark:text-arena/75 truncate">
                  📍 {addressInput}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="inline-flex items-center gap-1 px-3 min-h-[40px] rounded-xl bg-surface dark:bg-bosque border border-earth-border dark:border-oro/35 text-xs font-extrabold text-ink dark:text-arena shrink-0"
              >
                <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Editar</span>
              </button>
            </div>

            {/* Opciones de pago (máximo 2 opciones claras) */}
            <div className="space-y-3" role="radiogroup" aria-label="Método de pago">
              {/* Opción 1: Saldo Libreta */}
              <button
                type="button"
                disabled={!canPayWithWallet || isProcessing}
                onClick={() => setPaymentChoice("wallet")}
                className={`w-full text-left rounded-2xl p-4 border-2 transition-all flex items-start gap-3.5 ${
                  !canPayWithWallet
                    ? "bg-surface-soft/70 dark:bg-[#14221D]/70 border-earth-border dark:border-oro/20 opacity-75 cursor-not-allowed"
                    : paymentChoice === "wallet"
                    ? "bg-primary/10 dark:bg-brote/15 border-primary dark:border-brote shadow-sm"
                    : "bg-surface dark:bg-[#14221D] border-earth-border dark:border-oro/30 hover:border-primary"
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-primary/15 dark:bg-brote/25 text-primary dark:text-[#69D86E] flex items-center justify-center shrink-0">
                  <Wallet className="w-6 h-6" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-brand text-lg text-ink dark:text-arena">
                      Saldo en Mi Libreta
                    </span>
                    {canPayWithWallet ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-primary/15 dark:bg-brote/25 text-primary dark:text-[#69D86E] text-xs font-extrabold">
                        ✓ Te alcanza
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-surface dark:bg-bosque border border-earth-border dark:border-oro/30 text-ink-muted dark:text-arena/75 text-xs font-bold">
                        Faltan {formatBs(missingBs)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs sm:text-sm font-semibold text-ink-muted dark:text-arena/80">
                    Disponible: <strong>{formatBs(buyerFiatBs)}</strong>
                    {buyerHasActiveMotes
                      ? ` · ${formatMotes(buyerMotes)}`
                      : ""}
                  </p>

                  {canPayWithFiat && canPayWithMotes && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentChoice("wallet");
                          setWalletCurrency("fiat");
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold border cursor-pointer ${
                          walletCurrency === "fiat"
                            ? "bg-primary text-white dark:bg-brote dark:text-bosque border-transparent"
                            : "bg-surface dark:bg-bosque text-ink dark:text-arena border-earth-border dark:border-oro/30"
                        }`}
                      >
                        Usar {formatBs(buyerFiatBs)}
                      </span>
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setPaymentChoice("wallet");
                          setWalletCurrency("motes");
                        }}
                        className={`px-3 py-1 rounded-xl text-xs font-extrabold border cursor-pointer ${
                          walletCurrency === "motes"
                            ? "bg-sol text-ink dark:bg-oro dark:text-bosque border-transparent"
                            : "bg-surface dark:bg-bosque text-ink dark:text-arena border-earth-border dark:border-oro/30"
                        }`}
                      >
                        Usar {formatMotes(buyerMotes)}
                      </span>
                    </div>
                  )}
                </div>

                {paymentChoice === "wallet" && canPayWithWallet && (
                  <CheckCircle2
                    className="w-6 h-6 text-primary dark:text-[#69D86E] shrink-0 mt-1"
                    aria-hidden="true"
                  />
                )}
              </button>

              {/* Opción 2: QR Bancario exacto */}
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setPaymentChoice("qr")}
                className={`w-full text-left rounded-2xl p-4 border-2 transition-all flex items-start gap-3.5 ${
                  paymentChoice === "qr"
                    ? "bg-sol/15 dark:bg-oro/20 border-sol dark:border-brillo shadow-sm"
                    : "bg-surface dark:bg-[#14221D] border-earth-border dark:border-oro/30 hover:border-sol"
                }`}
              >
                <div className="w-11 h-11 rounded-2xl bg-sol/25 dark:bg-oro/25 text-[#8A5100] dark:text-brillo flex items-center justify-center shrink-0">
                  <QrCode className="w-6 h-6" aria-hidden="true" />
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-brand text-lg text-ink dark:text-arena">
                      QR Bancario ({formatBs(totalBs)})
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-sol/25 dark:bg-oro/25 text-[#8A5100] dark:text-brillo text-xs font-extrabold">
                      Monto exacto
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm font-semibold text-ink-muted dark:text-arena/80">
                    Escanea o descarga el QR desde la app de tu banco · 0 Bs de
                    comisión.
                  </p>
                </div>

                {paymentChoice === "qr" && (
                  <CheckCircle2
                    className="w-6 h-6 text-[#8A5100] dark:text-brillo shrink-0 mt-1"
                    aria-hidden="true"
                  />
                )}
              </button>
            </div>

            {/* Autorización con PIN personal antes de gastar saldo */}
            <div className="rounded-2xl bg-surface-soft dark:bg-[#14221D] border-2 border-earth-border dark:border-oro/35 p-4 space-y-2">
              <label
                htmlFor="order-spend-pin"
                className="block text-xs font-extrabold uppercase tracking-wide text-ink dark:text-arena"
              >
                🔒 Confirma tu PIN de 4 números para autorizar el pago *
              </label>
              <div className="flex items-center rounded-2xl border-2 border-earth-border dark:border-oro/45 bg-surface dark:bg-[#0D1714] focus-within:border-primary dark:focus-within:border-brillo px-3.5">
                <Lock
                  className="w-5 h-5 text-primary dark:text-brillo shrink-0 mr-2"
                  aria-hidden="true"
                />
                <input
                  id="order-spend-pin"
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={spendPinInput}
                  onChange={(e) =>
                    setSpendPinInput(
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                  placeholder="Ingresa tu PIN de 4 números"
                  className="flex-1 min-w-0 min-h-[50px] bg-transparent text-base font-extrabold tracking-[0.3em] text-ink dark:text-arena placeholder:tracking-normal placeholder:font-semibold placeholder:text-ink-muted/60 focus:outline-none"
                />
              </div>
              <p className="text-xs font-semibold text-ink-muted dark:text-arena/75">
                Protección comunitaria: nadie puede gastar el saldo de tu
                Libreta sin tu PIN personal.
              </p>
            </div>

            {/* Sello Pago Protegido */}
            <div className="rounded-2xl bg-primary/8 dark:bg-[#173023] border border-primary/30 dark:border-brote/50 p-3.5 flex items-start gap-2.5">
              <ShieldCheck
                className="w-5 h-5 text-primary dark:text-[#69D86E] shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <p className="text-xs font-semibold text-ink dark:text-arena leading-relaxed">
                {COMMUNITY_COPY.protectedSeal}
              </p>
            </div>

            <button
              type="button"
              disabled={isProcessing}
              onClick={handleConfirmPayment}
              className="w-full min-h-[56px] px-5 py-4 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-gradient-to-r dark:from-oro dark:via-brillo dark:to-oro dark:text-bosque font-brand text-lg sm:text-xl shadow-warm-card dark:shadow-gold-glow active:scale-[0.98] transition-all disabled:opacity-65"
            >
              {isProcessing
                ? processingLabel
                : paymentChoice === "wallet" && canPayWithWallet
                ? `Confirmar pedido · ${formatBs(totalBs)}`
                : `📲 Pagar ${formatBs(totalBs)} con QR Bancario`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
