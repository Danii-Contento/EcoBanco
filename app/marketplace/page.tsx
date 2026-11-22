"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, MapPin, Search, User as UserIcon, X } from "lucide-react";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  payWithPollarWallet,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  getRechargeStatusMessage,
  sanitizeUserError,
} from "@/app/lib/friendlyCopy";
import {
  extractNeighborhoodZone,
  getAvailableZones,
  inferProductCategory,
  MARKETPLACE_CATEGORIES,
  MarketplaceCategoryKey,
  normalizeFilterText,
} from "@/app/lib/marketplaceFilters";
import {
  BankQrRechargeModal,
  RampCreditedEvent,
  RampPendingEvent,
} from "@/app/components/BankQrRechargeModal";
import {
  PollarProfileSnapshot,
  PollarWalletSection,
} from "@/app/components/PollarWalletSection";
import { QuickNeighborAuthModal } from "@/app/components/QuickNeighborAuthForm";
import { MarketplaceProductCard } from "@/app/components/MarketplaceProductCard";
import { QuickOrderModal } from "@/app/components/QuickOrderModal";
import { OrderConfirmationCard } from "@/app/components/OrderConfirmationCard";
import {
  Delivery,
  EscrowTransaction,
  Product,
  User,
} from "@/app/types/ecobanco";

export default function MarketplacePage() {
  const {
    getClient: getPollarClient,
    isAuthenticated: isPollarAuthenticated,
  } = usePollar();
  const [pollarDraft, setPollarDraft] = useState<{
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  }>({});
  const pollarLookupKeyRef = useRef<string>("");

  const [products, setProducts] = useState<Product[]>([]);
  const [buyer, setBuyer] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Buscador y filtros rápidos de un toque
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] =
    useState<MarketplaceCategoryKey>("all");
  const [selectedZone, setSelectedZone] = useState<string>("all");

  // Modal de acceso rápido opcional desde barra superior
  const [quickAuthOpen, setQuickAuthOpen] = useState<boolean>(false);

  // Flujo directo de compra en máximo 2 pasos
  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [orderQuantity, setOrderQuantity] = useState<number>(1);
  const [specialNotesInput, setSpecialNotesInput] = useState<string>("");
  const [orderError, setOrderError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingLabel, setProcessingLabel] = useState<string>(
    "Confirmando tu Pago Protegido..."
  );
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  // Último pedido confirmado
  const [lastReceipt, setLastReceipt] = useState<EscrowTransaction | null>(
    null
  );
  const [lastDelivery, setLastDelivery] = useState<Delivery | null>(null);
  const [lastSellerPhone, setLastSellerPhone] = useState<string | null>(null);

  // Pago directo por QR bancario exacto y PIN autorizado del pedido
  const [qrCheckoutOpen, setQrCheckoutOpen] = useState<boolean>(false);
  const [qrPendingNotice, setQrPendingNotice] = useState<string | null>(null);
  const [pendingBuyerPin, setPendingBuyerPin] = useState<string>("");

  useEffect(() => {
    async function fetchMarketplaceData() {
      try {
        setIsLoading(true);
        const [prodRes, userRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/users"),
        ]);
        const prodData = prodRes.ok ? await prodRes.json() : {};
        const userData = userRes.ok ? await userRes.json() : {};

        setProducts(prodData.products || []);
        setBuyer(userData.buyer || null);
      } catch {
        setPurchaseError(COMMUNITY_COPY.defaultError);
      } finally {
        setIsLoading(false);
      }
    }
    void fetchMarketplaceData();
  }, []);

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

  const syncActivePollarWallet = useCallback(
    async (user: User | null | undefined) => {
      if (!user?.isLoggedIn) return;
      const result = await ensurePollarWalletAndSync(getPollarClient(), {
        userId: user.id,
        role: "buyer",
      });
      if (result.synced) {
        handleBuyerPollarSynced(result);
      }
    },
    [getPollarClient, handleBuyerPollarSynced]
  );

  const handleCheckoutPollarProfile = useCallback(
    async (profile: PollarProfileSnapshot) => {
      setPollarDraft({
        pollarUserId: profile.pollarUserId ?? null,
        stellarAddress: profile.stellarAddress ?? null,
      });

      if (buyer?.isLoggedIn) return;

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
          setBuyer(data.buyer as User);
        }
      } catch {
        // Silencioso: el visitante explora libremente sin bloqueo
      }
    },
    [buyer?.isLoggedIn]
  );

  useEffect(() => {
    if (!isPollarAuthenticated) {
      pollarLookupKeyRef.current = "";
    }
  }, [isPollarAuthenticated]);

  const openProducts = useMemo(
    () => products.filter((p) => p.active && p.sellerIsOpen !== false),
    [products]
  );

  const categoryCounts = useMemo(() => {
    const counts: Record<MarketplaceCategoryKey, number> = {
      all: openProducts.length,
      Gastronomía: 0,
      Panadería: 0,
      Agroecología: 0,
      Servicios: 0,
    };
    for (const p of openProducts) {
      const cat = inferProductCategory(p);
      counts[cat] += 1;
    }
    return counts;
  }, [openProducts]);

  const availableZones = useMemo(
    () => getAvailableZones(openProducts),
    [openProducts]
  );

  const filteredProducts = useMemo(() => {
    const q = normalizeFilterText(searchQuery);
    const zoneKey = selectedZone === "all" ? "" : normalizeFilterText(selectedZone);

    return openProducts.filter((p) => {
      if (
        selectedCategory !== "all" &&
        inferProductCategory(p) !== selectedCategory
      ) {
        return false;
      }

      if (zoneKey) {
        const productZone = normalizeFilterText(
          extractNeighborhoodZone(p.sellerAddress)
        );
        const fullAddress = normalizeFilterText(p.sellerAddress);
        if (productZone !== zoneKey && !fullAddress.includes(zoneKey)) {
          return false;
        }
      }

      if (!q) return true;
      return (
        normalizeFilterText(p.name).includes(q) ||
        normalizeFilterText(p.sellerName).includes(q) ||
        normalizeFilterText(p.description).includes(q) ||
        normalizeFilterText(p.sellerAddress).includes(q)
      );
    });
  }, [openProducts, searchQuery, selectedCategory, selectedZone]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedCategory !== "all" ||
    selectedZone !== "all";

  const buyerHasActiveMotes = Boolean(
    buyer?.isProsumer || buyer?.motesEnabled || Number(buyer?.motes ?? 0) > 0
  );

  const orderTotalBs = pendingProduct
    ? Math.max(1, Math.round(Number(pendingProduct.priceMotes) * orderQuantity))
    : 0;

  const handleOpenOrderModal = (product: Product) => {
    setPurchaseError(null);
    setOrderError(null);
    setQrPendingNotice(null);
    setOrderQuantity(1);
    setSpecialNotesInput("");
    setPendingProduct(product);
  };

  const handleBuyerUpdated = (updatedBuyer: User) => {
    setBuyer(updatedBuyer);
    void syncActivePollarWallet(updatedBuyer);
  };

  const executeProtectedPurchase = async (
    product: Product,
    quantity: number,
    specialNotes: string,
    paymentMethod?: "fiat" | "motes",
    buyerPin?: string
  ) => {
    try {
      setIsProcessing(true);
      setProcessingLabel("Confirmando tu Pago Protegido...");
      setPurchaseError(null);
      setOrderError(null);

      let pollarPaymentTxHash: string | undefined;
      if (isPollarAuthenticated) {
        try {
          const cfgRes = await fetch("/api/escrow", { cache: "no-store" });
          if (cfgRes.ok) {
            const cfgData = (await cfgRes.json()) as {
              operationalAccount?: string | null;
            };
            if (cfgData.operationalAccount) {
              const totalOrderBs =
                Math.round(Number(product.priceMotes) * quantity * 100) / 100;
              const pollarPay = await payWithPollarWallet(getPollarClient(), {
                destination: cfgData.operationalAccount,
                amountUsdc: totalOrderBs,
                memo: "ECOBANCO PEDIDO",
                waitForBalanceMs: paymentMethod === "fiat" ? 4500 : 0,
              });
              if (pollarPay.paid && pollarPay.txHash) {
                pollarPaymentTxHash = pollarPay.txHash;
              }
            }
          }
        } catch {
          // Pago silencioso con Pollar: jamás bloquea el pedido comunitario
        }
      }

      const resolvedPin = (buyerPin || pendingBuyerPin || "").trim();

      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          buyerType: "buyer",
          paymentMethod,
          quantity,
          specialNotes: specialNotes.trim() || undefined,
          buyerPin: resolvedPin || undefined,
          ...(pollarPaymentTxHash ? { pollarPaymentTxHash } : {}),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = sanitizeUserError(data.error);
        setPurchaseError(msg);
        setOrderError(msg);
        return;
      }

      setBuyer(data.buyer);
      setLastReceipt(data.receipt);
      setLastDelivery(data.delivery || null);
      setLastSellerPhone(product.sellerPhone || null);
      setPendingProduct(null);
      setPendingBuyerPin("");
      setQrCheckoutOpen(false);
      setQrPendingNotice(null);

      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      void syncActivePollarWallet(data.buyer);

      const prodRes = await fetch("/api/products");
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);
      }
    } catch (err) {
      const msg = sanitizeUserError(err);
      setPurchaseError(msg);
      setOrderError(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleOrderQrPaid = async (event: RampCreditedEvent) => {
    if (event.buyer) {
      setBuyer(event.buyer);
    }
    setQrCheckoutOpen(false);
    if (pendingProduct) {
      await executeProtectedPurchase(
        pendingProduct,
        orderQuantity,
        specialNotesInput,
        "fiat",
        pendingBuyerPin
      );
    }
  };

  const clearAllFilters = () => {
    setSearchQuery("");
    setSelectedCategory("all");
    setSelectedZone("all");
  };

  return (
    <div className="min-h-screen eco-page font-sans pb-20">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-5 space-y-5">
        {/* Barra superior táctil: libre acceso + acceso rápido opcional */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-ink dark:text-arena text-sm font-extrabold shadow-sm active:scale-95 transition"
          >
            <ArrowLeft className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Inicio</span>
          </Link>

          <div className="flex items-center gap-2">
            {buyer?.isLoggedIn ? (
              <Link
                href="/perfil-usuario"
                className="inline-flex items-center gap-2 px-3.5 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border-2 border-primary/40 dark:border-oro/40 text-ink dark:text-arena text-xs sm:text-sm font-extrabold shadow-sm active:scale-95 transition"
              >
                <UserIcon
                  className="w-4 h-4 text-primary dark:text-brillo shrink-0"
                  aria-hidden="true"
                />
                <span className="truncate max-w-[110px]">{buyer.name}</span>
                <span className="px-2.5 py-1 rounded-full bg-primary/12 dark:bg-brote/25 text-primary dark:text-[#69D86E] text-xs font-extrabold">
                  {buyerHasActiveMotes
                    ? `${formatBs(buyer.fiatBs)} · ${formatMotes(buyer.motes)}`
                    : formatBs(buyer.fiatBs)}
                </span>
              </Link>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setQuickAuthOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-oro dark:text-bosque text-xs sm:text-sm font-extrabold shadow-sm active:scale-95 transition"
                >
                  <UserIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>Entrar rápido</span>
                </button>
                <Link
                  href="/perfil-usuario"
                  className="inline-flex items-center px-3.5 min-h-[48px] rounded-2xl bg-surface dark:bg-[#182822] border border-earth-border dark:border-oro/30 text-ink dark:text-arena text-xs sm:text-sm font-bold shadow-sm transition"
                >
                  Mi Libreta
                </Link>
              </>
            )}
          </div>
        </div>

        {/* Cabecera Ajayu + Buscador + Filtros de un toque */}
        <header className="space-y-3.5">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-brand text-3xl sm:text-4xl text-ink dark:text-arena tracking-tight">
                Mercado del Barrio
              </h1>
              <span className="px-3 py-1 rounded-full bg-primary/12 dark:bg-brote/20 border border-primary/30 dark:border-brote/50 text-primary dark:text-[#69D86E] text-xs font-extrabold">
                🟢 Puestos abiertos ({openProducts.length})
              </span>
            </div>
            <p className="text-sm sm:text-base text-ink-muted dark:text-arena/85 font-medium leading-relaxed">
              Explora libremente y pide en 2 toques ·{" "}
              <strong className="text-primary dark:text-[#69D86E]">
                {COMMUNITY_COPY.zeroCommission}
              </strong>
            </p>
          </div>

          {/* Buscador grande para el pulgar */}
          <div className="flex items-center rounded-2xl bg-surface dark:bg-[#0D1714] border-2 border-earth-border dark:border-oro/45 focus-within:border-primary dark:focus-within:border-brillo px-3.5 shadow-warm-card dark:shadow-none transition-colors">
            <Search
              className="w-5 h-5 text-ink-muted dark:text-brillo shrink-0 mr-2.5"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar comida, pan, caserita o zona..."
              className="flex-1 min-w-0 min-h-[52px] bg-transparent text-base font-medium text-ink dark:text-arena placeholder:text-ink-muted/65 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                aria-label="Limpiar búsqueda"
                onClick={() => setSearchQuery("")}
                className="w-9 h-9 rounded-full bg-surface-soft dark:bg-bosque text-ink dark:text-arena flex items-center justify-center shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filtros rápidos de un toque por categoría */}
          <div
            role="group"
            aria-label="Filtrar por categoría"
            className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
          >
            {MARKETPLACE_CATEGORIES.map((cat) => {
              const isSelected = selectedCategory === cat.key;
              const count = categoryCounts[cat.key];
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setSelectedCategory(cat.key)}
                  className={`inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl text-sm font-extrabold whitespace-nowrap border-2 transition-all active:scale-95 shrink-0 ${
                    isSelected
                      ? "bg-primary text-white border-primary dark:bg-gradient-to-r dark:from-oro dark:to-brillo dark:text-bosque dark:border-brillo shadow-sm"
                      : "bg-surface dark:bg-[#182822] border-earth-border dark:border-oro/30 text-ink dark:text-arena hover:border-sol"
                  }`}
                >
                  <span aria-hidden="true">{cat.emoji}</span>
                  <span>{cat.label}</span>
                  {count > 0 && (
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-extrabold ${
                        isSelected
                          ? "bg-white/20 text-white dark:bg-bosque/20 dark:text-bosque"
                          : "bg-surface-soft dark:bg-bosque text-ink-muted dark:text-arena/80"
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Filtros rápidos de un toque por zona / barrio */}
          {availableZones.length > 0 && (
            <div
              role="group"
              aria-label="Filtrar por zona o barrio"
              className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1"
            >
              <button
                type="button"
                onClick={() => setSelectedZone("all")}
                className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-xs sm:text-sm font-extrabold whitespace-nowrap border transition-all active:scale-95 shrink-0 ${
                  selectedZone === "all"
                    ? "bg-aji text-white border-aji dark:bg-brote dark:text-bosque dark:border-brote shadow-sm"
                    : "bg-surface-soft dark:bg-[#14221D] border-earth-border dark:border-oro/25 text-ink dark:text-arena"
                }`}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>Todas las zonas</span>
              </button>

              {availableZones.map((zone) => {
                const isZoneSelected =
                  normalizeFilterText(selectedZone) ===
                  normalizeFilterText(zone);
                return (
                  <button
                    key={zone}
                    type="button"
                    onClick={() =>
                      setSelectedZone(isZoneSelected ? "all" : zone)
                    }
                    className={`inline-flex items-center gap-1.5 px-3.5 min-h-[44px] rounded-full text-xs sm:text-sm font-extrabold whitespace-nowrap border transition-all active:scale-95 shrink-0 ${
                      isZoneSelected
                        ? "bg-aji text-white border-aji dark:bg-brote dark:text-bosque dark:border-brote shadow-sm"
                        : "bg-surface dark:bg-[#182822] border-earth-border dark:border-oro/30 text-ink dark:text-arena hover:border-aji"
                    }`}
                  >
                    <span>📍 {zone}</span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {/* Mensaje de error general */}
        {purchaseError && (
          <div className="rounded-2xl eco-alert-error p-4 text-sm font-bold flex items-center justify-between gap-3">
            <span>⚠️ {purchaseError}</span>
            <button
              type="button"
              onClick={() => setPurchaseError(null)}
              aria-label="Cerrar error"
              className="font-extrabold px-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Tarjeta de pedido confirmado con #ECO-XXXX + PIN + Avisar por WhatsApp */}
        {lastReceipt && (
          <OrderConfirmationCard
            receipt={lastReceipt}
            delivery={lastDelivery}
            sellerPhone={lastSellerPhone}
            deliveryAddress={buyer?.deliveryAddress || buyer?.address}
            buyerName={buyer?.name}
            buyerPhone={buyer?.phone}
            onDismiss={() => {
              setLastReceipt(null);
              setLastDelivery(null);
            }}
          />
        )}

        {/* Catálogo de productos */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-72 rounded-3xl bg-surface-soft dark:bg-[#182822] border border-earth-border dark:border-oro/20 animate-pulse"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-3xl bg-surface dark:bg-[#182822] border-2 border-earth-border dark:border-oro/30 shadow-warm-card dark:shadow-none p-8 text-center space-y-3.5">
            <div className="text-4xl" aria-hidden="true">
              🌱
            </div>
            <h2 className="font-brand text-2xl text-ink dark:text-arena">
              {hasActiveFilters
                ? "No encontramos puestos con ese filtro"
                : "No hay puestos abiertos ahora mismo"}
            </h2>
            <p className="text-sm sm:text-base text-ink-muted dark:text-arena/80 max-w-sm mx-auto">
              {hasActiveFilters
                ? "Prueba tocando otra categoría o limpiando los filtros para ver todo el barrio."
                : "Apenas una caserita abra su puesto con productos frescos, aparecerá aquí."}
            </p>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="min-h-[48px] px-6 rounded-2xl bg-primary hover:bg-primary-hover text-white dark:bg-oro dark:text-bosque font-extrabold text-sm active:scale-95 transition"
              >
                Ver todo el mercado
              </button>
            )}
          </div>
        ) : (
          <section aria-label="Catálogo de Productos" className="space-y-4">
            {filteredProducts.map((product) => (
              <MarketplaceProductCard
                key={product.id}
                product={product}
                disabled={isProcessing}
                onOrderClick={handleOpenOrderModal}
              />
            ))}
          </section>
        )}
      </main>

      {/* Sincronización silenciosa en segundo plano */}
      <PollarWalletSection
        role="buyer"
        userId={buyer?.isLoggedIn ? buyer.id : undefined}
        savedStellarAddress={buyer?.stellar_address}
        savedPollarUserId={buyer?.pollar_user_id}
        mode="auth-entry"
        compact
        onSynced={handleBuyerPollarSynced}
        onPollarProfileLoaded={handleCheckoutPollarProfile}
      />

      {/* Acceso ultrarrápido opcional desde barra superior */}
      <QuickNeighborAuthModal
        open={quickAuthOpen}
        initialName={buyer?.name || ""}
        initialPhone={buyer?.phone || ""}
        pollarDraft={pollarDraft}
        onClose={() => setQuickAuthOpen(false)}
        onAuthenticated={handleBuyerUpdated}
      />

      {/* Flujo directo de compra en máximo 2 pasos */}
      <QuickOrderModal
        product={pendingProduct}
        buyer={buyer}
        quantity={orderQuantity}
        specialNotes={specialNotesInput}
        pollarDraft={pollarDraft}
        isProcessing={isProcessing}
        processingLabel={processingLabel}
        externalError={orderError}
        qrPendingNotice={qrPendingNotice}
        hiddenForQr={qrCheckoutOpen}
        onQuantityChange={setOrderQuantity}
        onSpecialNotesChange={setSpecialNotesInput}
        onBuyerUpdated={handleBuyerUpdated}
        onPayWithBalance={(method, buyerPin) => {
          setPendingBuyerPin(buyerPin);
          if (pendingProduct) {
            void executeProtectedPurchase(
              pendingProduct,
              orderQuantity,
              specialNotesInput,
              method,
              buyerPin
            );
          }
        }}
        onPayWithBankQr={(buyerPin) => {
          setPendingBuyerPin(buyerPin);
          setOrderError(null);
          setQrCheckoutOpen(true);
        }}
        onClose={() => {
          setPendingProduct(null);
          setQrCheckoutOpen(false);
        }}
      />

      {/* QR bancario directo por el monto exacto del pedido */}
      <BankQrRechargeModal
        open={Boolean(qrCheckoutOpen && pendingProduct)}
        role="buyer"
        userId={buyer?.id}
        purpose="fiat_topup"
        amountBs={Math.max(1, orderTotalBs)}
        subtitle={
          pendingProduct
            ? `Paga el monto exacto (${formatBs(orderTotalBs)}) por ${
                orderQuantity > 1 ? `${orderQuantity}x ` : ""
              }${pendingProduct.name}. Sin suscripción ni comisiones.`
            : "Paga el monto exacto de tu pedido con el QR de tu banco."
        }
        onRampCredited={(event) => void handleOrderQrPaid(event)}
        onRampPending={(pending: RampPendingEvent) => {
          setQrPendingNotice(getRechargeStatusMessage(pending.state));
        }}
        onRampError={(errMsg) => {
          setOrderError(sanitizeUserError(errMsg));
        }}
        onClose={() => setQrCheckoutOpen(false)}
      />
    </div>
  );
}
