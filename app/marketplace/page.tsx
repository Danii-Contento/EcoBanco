"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  formatShortStellarAddress,
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
  PollarProfileSnapshot,
  PollarWalletSection,
} from "@/app/components/PollarWalletSection";
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
  const [merchant, setMerchant] = useState<User | null>(null);
  const [buyerType, setBuyerType] = useState<"buyer" | "merchant">("buyer");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const [searchQuery, setSearchQuery] = useState<string>("");

  const [pendingProduct, setPendingProduct] = useState<Product | null>(null);
  const [editingCheckoutContact, setEditingCheckoutContact] =
    useState<boolean>(false);
  const [buyerNameInput, setBuyerNameInput] = useState<string>("");
  const [buyerEmailInput, setBuyerEmailInput] = useState<string>("");
  const [buyerPhoneInput, setBuyerPhoneInput] = useState<string>("");
  const [buyerAddressInput, setBuyerAddressInput] = useState<string>("");
  const [buyerReferralInput, setBuyerReferralInput] = useState<string>("");
  const [lazyError, setLazyError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [processingLabel, setProcessingLabel] = useState<string>(
    "Confirmando pedido..."
  );
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<EscrowTransaction | null>(
    null
  );
  const [lastDelivery, setLastDelivery] = useState<Delivery | null>(null);

  useEffect(() => {
    async function fetchMarketplaceData() {
      try {
        setIsLoading(true);
        const [prodRes, userRes] = await Promise.all([
          fetch("/api/products"),
          fetch("/api/users"),
        ]);
        const prodData = await prodRes.json();
        const userData = await userRes.json();

        setProducts(prodData.products || []);
        setBuyer(userData.buyer || null);
        setMerchant(userData.merchant || null);
        setBuyerType(userData.activeBuyerType || "buyer");
      } finally {
        setIsLoading(false);
      }
    }
    fetchMarketplaceData();
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
    async (user: User | null | undefined, role: "buyer" | "merchant") => {
      if (!user?.isLoggedIn) return;
      const result = await ensurePollarWalletAndSync(getPollarClient(), {
        userId: user.id,
        role,
      });
      if (result.synced) {
        if (role === "merchant") {
          setMerchant((prev) =>
            prev && prev.id === user.id
              ? {
                  ...prev,
                  pollar_user_id: result.pollarUserId ?? prev.pollar_user_id,
                  stellar_address: result.stellarAddress ?? prev.stellar_address,
                }
              : prev
          );
        } else {
          handleBuyerPollarSynced(result);
        }
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

      if (profile.name && !buyerNameInput.trim()) {
        setBuyerNameInput(profile.name);
      }
      if (profile.email && !buyerEmailInput.trim()) {
        setBuyerEmailInput(profile.email);
      }

      if (buyer?.isLoggedIn) {
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
          const matchedBuyer: User = data.buyer;
          setBuyer(matchedBuyer);
          setBuyerType("buyer");
          setBuyerNameInput(matchedBuyer.name || "");
          setBuyerEmailInput(matchedBuyer.email || "");
          setBuyerPhoneInput(matchedBuyer.phone || "");
          setBuyerAddressInput(
            matchedBuyer.deliveryAddress || matchedBuyer.address || ""
          );
          if (
            matchedBuyer.phone?.trim() &&
            (matchedBuyer.deliveryAddress || matchedBuyer.address || "").trim()
          ) {
            setEditingCheckoutContact(false);
          }
        }
      } catch {
        // El vecino puede completar su Lazy Login manualmente
      }
    },
    [buyer?.isLoggedIn, buyerNameInput, buyerEmailInput]
  );

  useEffect(() => {
    if (!isPollarAuthenticated) {
      pollarLookupKeyRef.current = "";
    }
  }, [isPollarAuthenticated]);

  const filteredProducts = products.filter((p) => {
    const q = searchQuery.toLowerCase();
    return (
      p.name.toLowerCase().includes(q) ||
      p.sellerName.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      (p.sellerAddress || "").toLowerCase().includes(q)
    );
  });

  const handleSwitchBuyerType = async (nextType: "buyer" | "merchant") => {
    setPurchaseError(null);
    setBuyerType(nextType);
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_buyer_type",
        buyerType: nextType,
      }),
    });
  };

  const hasSavedBuyerContact = Boolean(
    buyer?.isLoggedIn &&
      buyer.phone?.trim() &&
      (buyer.deliveryAddress || buyer.address || "").trim()
  );

  const handleBuyClick = (product: Product) => {
    setPurchaseError(null);
    setLazyError(null);

    if (buyer) {
      setBuyerNameInput(buyer.name || "");
      setBuyerEmailInput(buyer.email || "");
      setBuyerPhoneInput(buyer.phone || "");
      setBuyerAddressInput(buyer.deliveryAddress || buyer.address || "");
    }
    setEditingCheckoutContact(!hasSavedBuyerContact);
    setPendingProduct(product);
  };

  const executeProtectedPurchase = async (
    product: Product,
    role: "buyer" | "merchant"
  ) => {
    try {
      setIsProcessing(true);
      setProcessingLabel("Confirmando pedido...");
      setPurchaseError(null);
      const res = await fetch("/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: product.id,
          buyerType: role,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const msg = translateBackendMessage(
          data.error || "No se pudo completar tu pedido."
        );
        setPurchaseError(msg);
        setLazyError(msg);
        return;
      }

      setBuyer(data.buyer);
      setMerchant(data.merchant);
      setLastReceipt(data.receipt);
      setLastDelivery(data.delivery || null);
      setPendingProduct(null);

      // Sincroniza la libreta digital en segundo plano sin mostrar mensajes técnicos
      void syncActivePollarWallet(
        role === "merchant" ? data.merchant : data.buyer,
        role
      );

      const prodRes = await fetch("/api/products");
      if (prodRes.ok) {
        const prodData = await prodRes.json();
        setProducts(prodData.products || []);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingProduct) return;
    setLazyError(null);

    if (isMerchantBuying) {
      await executeProtectedPurchase(pendingProduct, "merchant");
      return;
    }

    if (!hasSavedBuyerContact || editingCheckoutContact) {
      if (
        !buyerNameInput.trim() ||
        !buyerEmailInput.trim() ||
        !buyerPhoneInput.trim() ||
        !buyerAddressInput.trim()
      ) {
        setLazyError(
          "Completa tu nombre, correo, WhatsApp de contacto y dirección de entrega."
        );
        return;
      }

      try {
        setIsProcessing(true);
        setProcessingLabel("Activando tu libreta digital...");
        setPurchaseError(null);
        const res = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "lazy_login",
            name: buyerNameInput,
            email: buyerEmailInput,
            phone: buyerPhoneInput,
            deliveryAddress: buyerAddressInput,
            referralCode: buyerReferralInput.trim() || undefined,
            pollar_user_id: pollarDraft.pollarUserId || undefined,
            stellar_address: pollarDraft.stellarAddress || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setLazyError(
            translateBackendMessage(
              data.error || "Error al guardar tus datos."
            )
          );
          setIsProcessing(false);
          return;
        }

        setBuyer(data.buyer);
        setBuyerType("buyer");
        setProcessingLabel("Listo para pedir...");
        void syncActivePollarWallet(data.buyer, "buyer");
        const targetProduct = pendingProduct;
        await executeProtectedPurchase(targetProduct, "buyer");
      } catch {
        setIsProcessing(false);
      }
      return;
    }

    await executeProtectedPurchase(pendingProduct, "buyer");
  };

  const isMerchantBuying = Boolean(
    buyerType === "merchant" && merchant?.isLoggedIn
  );
  const buyerHasActiveMotes = Boolean(
    buyer?.isProsumer || buyer?.motesEnabled || (buyer?.motes ?? 0) > 0
  );

  return (
    <div className="min-h-screen bg-bosque text-arena font-sans pb-16">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena hover:border-oro transition"
          >
            ← Inicio
          </Link>

          <div className="flex items-center gap-2">
            {isMerchantBuying ? (
              <Link
                href="/panel-caserita"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-oro/20 border-2 border-oro text-xs sm:text-sm font-extrabold text-brillo"
              >
                <span>🏪 {merchant?.storeName}</span>
                {merchant?.stellar_address && (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-bosque/80 text-oro border border-oro/40">
                    {formatShortStellarAddress(merchant.stellar_address)}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full bg-bosque text-brote">
                  {formatMotes(merchant?.motes)}
                </span>
              </Link>
            ) : buyer?.isLoggedIn ? (
              <Link
                href="/perfil-usuario"
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#182822] border-2 border-brote/70 text-xs sm:text-sm font-extrabold text-brillo"
              >
                <span>👤 {buyer.name}</span>
                {buyer.stellar_address && (
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-full bg-bosque text-oro border border-oro/40">
                    {formatShortStellarAddress(buyer.stellar_address)}
                  </span>
                )}
                <span className="px-2.5 py-0.5 rounded-full bg-brote/25 text-arena">
                  {buyerHasActiveMotes
                    ? `${formatMotes(buyer.motes)} · ${formatBs(buyer.fiatBs)}`
                    : formatBs(buyer.fiatBs)}
                </span>
              </Link>
            ) : (
              <Link
                href="/perfil-usuario"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena"
              >
                👤 Mi Perfil
              </Link>
            )}
          </div>
        </div>

        {/* Selector de Caserita Aliada cuando hay una caserita con sesión activa */}
        {merchant?.isLoggedIn && (
          <section
            aria-label="Compra como Caserita Aliada"
            className="rounded-2xl bg-gradient-to-r from-[#1E3329] via-[#26291A] to-[#1A2D24] border-2 border-oro/55 p-4 space-y-3"
          >
            <div>
              <span className="text-xs font-extrabold uppercase tracking-wider text-brillo block">
                🏪 Compra con tus Puntos de Trueque
              </span>
              <p className="text-sm text-arena/90 mt-0.5">
                Puesto activo:{" "}
                <strong className="text-brillo">{merchant.storeName}</strong> (
                <strong>{formatMotes(merchant.motes)}</strong> · 1 MOTE = 1 Bs
                en productos del barrio).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-bosque border border-arena/20">
              <button
                type="button"
                onClick={() => handleSwitchBuyerType("merchant")}
                className={`py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wide transition ${
                  buyerType === "merchant"
                    ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow"
                    : "text-arena/85 hover:text-brillo"
                }`}
              >
                🏪 Usar mis MOTES
              </button>
              <button
                type="button"
                onClick={() => handleSwitchBuyerType("buyer")}
                className={`py-2.5 px-3 rounded-lg text-xs font-extrabold uppercase tracking-wide transition ${
                  buyerType === "buyer"
                    ? "bg-brote text-bosque shadow"
                    : "text-arena/85 hover:text-brillo"
                }`}
              >
                👤 Pedir en Bs
              </button>
            </div>
          </section>
        )}

        {/* Cabecera y Buscador */}
        <header className="space-y-3">
          <div>
            <h1 className="font-brand text-3xl text-arena">
              Mercado del Barrio
            </h1>
            <p className="text-sm text-arena/90 font-medium">
              Pide comida, abarrotes y productos de tus caseritas cercanas ·{" "}
              <strong className="text-brote">
                Comisión: 0 Bs — Cubierta por EcoBanco
              </strong>
            </p>
          </div>

          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="🔍 Buscar comida, producto, caserita o zona..."
            className="w-full px-4 py-3.5 rounded-2xl bg-[#0E1815] border-2 border-arena/25 text-base text-arena placeholder:text-arena/65 focus:outline-none focus:border-brillo"
          />
        </header>

        {/* Mensaje de error en pedido */}
        {purchaseError && (
          <div className="rounded-2xl bg-red-500/20 border-2 border-red-400/60 p-4 text-sm font-bold text-red-100 flex items-center justify-between gap-3">
            <span>⚠️ {purchaseError}</span>
            <button
              type="button"
              onClick={() => setPurchaseError(null)}
              className="text-red-100 hover:text-white font-extrabold px-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Confirmación de Pedido con Barra de Compra Protegida y PIN gigante */}
        {lastReceipt && (
          <div className="rounded-2xl bg-gradient-to-r from-[#173023] via-[#1C2A1E] to-[#173023] border-2 border-brote p-4 sm:p-5 space-y-4 shadow-green-glow">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-extrabold text-brillo">
                {formatOrderCode(lastReceipt.contractId)}
              </span>
              <span className="px-3 py-1 rounded-full bg-brote text-bosque text-xs font-extrabold uppercase">
                🛡️ Compra Protegida
              </span>
            </div>

            <p className="text-base text-arena font-semibold">
              ¡Pedido confirmado!{" "}
              <strong className="text-brillo">{lastReceipt.productName}</strong>{" "}
              —{" "}
              <strong className="text-brillo text-lg">
                {formatBs(lastReceipt.amountMotes)}
              </strong>
            </p>

            {/* Barra de progreso de 3 pasos de Compra Protegida */}
            <ProtectedPurchaseBar
              deliveryStatus={lastDelivery?.delivery_status}
              orderStatus={lastReceipt.status}
              amountBs={lastReceipt.amountMotes}
            />

            <OnChainEscrowAuditLinks
              contractId={lastReceipt.contractId}
              engagementId={lastReceipt.engagementId}
              fundTxHash={lastReceipt.fundTxHash}
              releaseTxHash={lastReceipt.releaseTxHash}
            />

            {lastDelivery && (
              <div className="rounded-2xl bg-[#0B1410] border-2 border-oro p-4 text-center space-y-2">
                <span className="text-xs font-extrabold uppercase tracking-wider text-arena block">
                  Dile este código al repartidor cuando te entregue tu pedido:
                </span>
                <span className="block font-mono text-5xl font-bold tracking-[0.2em] text-brillo">
                  {lastDelivery.delivery_pin}
                </span>
                <div className="pt-1 text-xs font-bold">
                  {lastDelivery.subsidized_by_reserve ||
                  lastDelivery.used_free_delivery ? (
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

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Link
                href={isMerchantBuying ? "/panel-caserita" : "/perfil-usuario"}
                className="flex-1 text-center px-4 py-3 rounded-xl bg-brote text-bosque font-extrabold text-sm uppercase"
              >
                {isMerchantBuying
                  ? "Ver en mi Puesto →"
                  : "Ver mi Pedido y Código →"}
              </Link>
              <Link
                href="/panel-rider"
                className="px-4 py-3 rounded-xl bg-oro/20 border border-oro text-brillo font-extrabold text-sm uppercase"
              >
                🚲 Repartidores
              </Link>
            </div>
          </div>
        )}

        {/* Catálogo de Productos */}
        {isLoading ? (
          <div className="space-y-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-56 rounded-2xl bg-[#182721] animate-pulse"
              />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="rounded-2xl bg-[#14221D] border border-arena/20 p-8 text-center space-y-3">
            <div className="text-4xl">🌱</div>
            <h2 className="font-brand text-xl text-arena">
              {searchQuery
                ? "No encontramos coincidencias"
                : "Aún no hay productos publicados"}
            </h2>
            <p className="text-sm text-arena/85 max-w-xs mx-auto">
              {searchQuery
                ? "Prueba buscando con otro nombre o limpia el buscador."
                : "Cuando una caserita publique sus productos frescos con foto real, aparecerán aquí."}
            </p>
          </div>
        ) : (
          <section aria-label="Catálogo de Productos" className="space-y-4">
            {filteredProducts.map((product) => {
              const isOwnMerchantProduct =
                isMerchantBuying &&
                merchant?.id &&
                product.sellerId === merchant.id;
              const hasFreeDelivery =
                Number(product.sellerFreeDeliveries ?? 0) > 0;

              return (
                <article
                  key={product.id}
                  className="rounded-2xl bg-gradient-to-br from-[#1B2B24] to-[#111C18] border-2 border-arena/20 overflow-hidden shadow-lg flex flex-col"
                >
                  {product.imageUrl && (
                    <div className="relative">
                      <img
                        src={product.imageUrl}
                        alt={product.name}
                        className="w-full h-56 object-cover border-b border-arena/15"
                      />
                      {hasFreeDelivery && (
                        <span className="absolute top-3 left-3 px-3 py-1 rounded-full bg-bosque/95 border-2 border-brote text-xs font-extrabold text-arena shadow">
                          🚲 Envío ecológico incluido
                        </span>
                      )}
                      {isOwnMerchantProduct && (
                        <span className="absolute top-3 right-3 px-3 py-1 rounded-full bg-bosque/95 border border-oro text-xs font-extrabold text-brillo">
                          Tu puesto
                        </span>
                      )}
                    </div>
                  )}

                  <div className="p-4 sm:p-5 space-y-4">
                    {/* Datos de la Caserita */}
                    <div className="flex items-start gap-3">
                      {product.sellerAvatarUrl ? (
                        <img
                          src={product.sellerAvatarUrl}
                          alt={product.sellerName}
                          className="w-12 h-12 rounded-2xl object-cover border-2 border-oro shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-bosque border-2 border-oro/50 flex items-center justify-center text-xl shrink-0">
                          🏪
                        </div>
                      )}

                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-extrabold text-brote">
                            {product.sellerName}
                          </span>
                          {hasFreeDelivery && !product.imageUrl && (
                            <span className="px-2.5 py-0.5 rounded-full bg-brote/20 border border-brote/60 text-xs font-bold text-arena">
                              🚲 Envío incluido
                            </span>
                          )}
                        </div>

                        {(product.sellerAddress || product.sellerSchedule) && (
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-arena/85 font-medium">
                            {product.sellerAddress && (
                              <span>📍 {product.sellerAddress}</span>
                            )}
                            {product.sellerSchedule && (
                              <span>🕒 {product.sellerSchedule}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Información del Producto */}
                    <div className="space-y-1">
                      <h2 className="font-brand text-xl sm:text-2xl text-arena">
                        {product.name}
                      </h2>
                      <p className="text-sm text-arena/90 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    {/* Precio en Bs (Alto contraste >= 22px) y Botón Pedir */}
                    <div className="pt-3 border-t border-arena/15 flex items-center justify-between gap-3">
                      <div>
                        <span className="block text-xs uppercase tracking-wider text-arena/85 font-bold">
                          Precio
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-brand text-2xl sm:text-3xl text-brillo">
                            {formatBs(product.priceMotes)}
                          </span>
                        </div>
                        {isMerchantBuying && (
                          <span className="text-xs font-bold text-brote block">
                            Equivale a {formatMotes(product.priceMotes)}
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleBuyClick(product)}
                        className="px-6 py-3.5 rounded-2xl font-brand text-lg tracking-wide bg-gradient-to-r from-oro via-brillo to-oro text-bosque shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition-all disabled:opacity-60"
                      >
                        {isMerchantBuying ? "Pedir con MOTES" : "Pedir"}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </main>

      {/* Modal de Confirmación de Pedido (Checkout con Compra Protegida y Banner Club Vecino) */}
      {pendingProduct && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl bg-gradient-to-b from-[#1D2F28] to-[#121D19] border-2 border-oro p-5 sm:p-6 shadow-gold-glow space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Resumen del producto */}
            <div className="flex items-center gap-3.5 pb-3 border-b border-arena/15">
              {pendingProduct.imageUrl && (
                <img
                  src={pendingProduct.imageUrl}
                  alt={pendingProduct.name}
                  className="w-20 h-20 rounded-2xl object-cover border-2 border-oro shrink-0"
                />
              )}
              <div className="min-w-0 flex-1 space-y-1">
                <span className="text-xs font-extrabold uppercase text-brote block">
                  {pendingProduct.sellerName}
                </span>
                <h3 className="font-brand text-xl text-arena leading-tight">
                  {pendingProduct.name}
                </h3>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-brand text-2xl text-brillo">
                    {formatBs(pendingProduct.priceMotes)}
                  </span>
                  {isMerchantBuying && (
                    <span className="text-xs font-extrabold text-brote">
                      ({formatMotes(pendingProduct.priceMotes)})
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Sello Compra Protegida y Comisión 0 Bs */}
            <div className="rounded-xl bg-[#0F1A16] border border-brote/50 p-3.5 space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-extrabold uppercase text-brote">
                  🛡️ Compra Protegida
                </span>
                <span className="text-xs font-bold text-brillo">
                  Comisión: 0 Bs — Cubierta por EcoBanco
                </span>
              </div>
              <p className="text-xs text-arena/90 leading-relaxed">
                Tu dinero se guarda seguro y solo pasa a la caserita cuando
                recibes tu pedido.
              </p>
            </div>

            {lazyError && (
              <div className="p-3 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100 text-center">
                ⚠️ {lazyError}
              </div>
            )}

            <form onSubmit={handleCheckoutSubmit} className="space-y-3.5">
              {!isMerchantBuying && (
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
              )}

              {isMerchantBuying ? (
                <div className="rounded-xl bg-bosque border border-oro/40 p-3.5 text-sm text-arena space-y-1">
                  <p className="font-bold text-brillo">
                    🏪 Pagas con tus Puntos de Trueque ({merchant?.storeName})
                  </p>
                  <p className="text-xs text-arena/85">
                    Saldo disponible:{" "}
                    <strong>{formatMotes(merchant?.motes)}</strong> · 1 MOTE = 1
                    Bs en productos del barrio.
                  </p>
                </div>
              ) : !hasSavedBuyerContact || editingCheckoutContact ? (
                <>
                  <p className="text-sm font-bold text-brillo">
                    ¿Dónde te llevamos tu pedido?
                  </p>
                  <div>
                    <label className="block text-xs font-bold uppercase text-arena mb-1">
                      Tu Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={buyerNameInput}
                      onChange={(e) => setBuyerNameInput(e.target.value)}
                      placeholder="Ej. María Quispe"
                      className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-arena mb-1">
                      Tu Correo *
                    </label>
                    <input
                      type="email"
                      required
                      value={buyerEmailInput}
                      onChange={(e) => setBuyerEmailInput(e.target.value)}
                      placeholder="correo@ejemplo.com"
                      className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-arena mb-1">
                      Número de WhatsApp *
                    </label>
                    <input
                      type="tel"
                      required
                      value={buyerPhoneInput}
                      onChange={(e) => setBuyerPhoneInput(e.target.value)}
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
                      value={buyerAddressInput}
                      onChange={(e) => setBuyerAddressInput(e.target.value)}
                      placeholder="Zona, calle, número de puerta o referencia"
                      className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase text-arena/85 mb-1">
                      Código de Referido (Opcional)
                    </label>
                    <input
                      type="text"
                      value={buyerReferralInput}
                      onChange={(e) =>
                        setBuyerReferralInput(e.target.value.toUpperCase())
                      }
                      placeholder="Ej. ECO-DONAEL55"
                      className="w-full px-4 py-3 rounded-xl bg-bosque border border-arena/30 text-arena text-sm font-mono uppercase focus:outline-none focus:border-brillo"
                    />
                  </div>
                </>
              ) : (
                <div className="rounded-xl bg-bosque border border-arena/25 p-3.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase text-brillo">
                      📍 Datos de entrega guardados
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingCheckoutContact(true)}
                      className="text-xs font-extrabold text-oro underline"
                    >
                      Cambiar
                    </button>
                  </div>
                  <p className="text-sm font-bold text-arena">{buyer?.name}</p>
                  <p className="text-xs text-arena/90">
                    📱 WhatsApp: {buyer?.phone}
                  </p>
                  <p className="text-xs text-arena/90">
                    🏠 {buyer?.deliveryAddress || buyer?.address}
                  </p>
                  <p className="text-xs font-bold text-brillo pt-1">
                    💳 Saldo disponible: {formatBs(buyer?.fiatBs)}
                    {buyerHasActiveMotes
                      ? ` · ${formatMotes(buyer?.motes)}`
                      : ""}
                  </p>
                  {Number(buyer?.fiatBs ?? 0) < pendingProduct.priceMotes &&
                    (!buyerHasActiveMotes ||
                      Number(buyer?.motes ?? 0) < pendingProduct.priceMotes) && (
                      <div className="pt-1.5">
                        <Link
                          href="/perfil-usuario"
                          className="inline-block text-xs font-extrabold text-oro underline"
                        >
                          ⚠️ Saldo insuficiente · Cargar saldo con QR en Mi
                          Perfil →
                        </Link>
                      </div>
                    )}
                </div>
              )}

              {/* Banner discreto en Checkout para Club Vecino (si aún no es miembro) */}
              {!isMerchantBuying && !buyer?.isProsumer && (
                <div className="rounded-xl bg-[#22291A] border border-oro/55 p-3.5 space-y-1.5">
                  <p className="text-xs sm:text-sm font-semibold text-arena leading-snug">
                    ⭐ ¿Pides seguido en el barrio? Únete al{" "}
                    <strong className="text-brillo">
                      Club Vecino (100 Bs/mes)
                    </strong>
                    , recibe{" "}
                    <strong className="text-brote">
                      50 Bs de regalo en MOTES
                    </strong>{" "}
                    y envíos incluidos.
                  </p>
                  {buyer?.isLoggedIn && (
                    <Link
                      href="/perfil-usuario"
                      className="inline-block text-xs font-extrabold text-brillo underline"
                    >
                      Conocer el Club Vecino →
                    </Link>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={isProcessing}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition disabled:opacity-70"
              >
                {isProcessing
                  ? processingLabel
                  : `Confirmar pedido · ${formatBs(pendingProduct.priceMotes)}`}
              </button>

              <button
                type="button"
                onClick={() => setPendingProduct(null)}
                className="w-full py-2.5 text-sm font-bold text-arena/85 hover:text-brillo"
              >
                Cancelar
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
