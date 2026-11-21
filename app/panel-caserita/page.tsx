"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  extractCompletedRampOrder,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import { compressImageToWebP } from "@/app/lib/imageCompressor";
import {
  COMMUNITY_COPY,
  formatBs,
  formatOrderCode,
  getDeliveryStatusCopy,
  getPaymentProtectionCopy,
  getRechargeStatusLabel,
  getRechargeStatusMessage,
  sanitizeUserError,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import {
  disconnectProfileSession,
  isPageReloadNavigation,
  useDisconnectOnPageUnload,
} from "@/app/lib/useDisconnectOnReload";
import { ProtectedPurchaseBar } from "@/app/components/ProtectedPurchaseBar";
import {
  BankQrRechargeModal,
  RampCreditedEvent,
  RampPendingEvent,
} from "@/app/components/BankQrRechargeModal";
import { PollarWalletSection } from "@/app/components/PollarWalletSection";
import { ThemeToggleSetting } from "@/app/components/ThemeToggleSetting";
import {
  Delivery,
  Order,
  Product,
  StorageBucket,
  User,
} from "@/app/types/ecobanco";

const SUBSCRIPTION_COST = 100;

type AuthStatus = "checking" | "unauthenticated" | "authenticated";

export default function PanelCaseritaPage() {
  const router = useRouter();
  const { getClient: getPollarClient, logout: pollarLogout } = usePollar();

  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [merchant, setMerchant] = useState<User | null>(null);
  const [isRampOpen, setIsRampOpen] = useState<boolean>(false);
  const [pendingRampOrder, setPendingRampOrder] =
    useState<RampPendingEvent | null>(null);
  const [isCheckingPendingRamp, setIsCheckingPendingRamp] =
    useState<boolean>(false);
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isTogglingOpen, setIsTogglingOpen] = useState<boolean>(false);

  // Modo de acceso: "login" o "register"
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [authBusyText, setAuthBusyText] = useState<string>(
    "Abriendo tu puesto..."
  );

  // Campos de Ingreso
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginPhone, setLoginPhone] = useState<string>("");
  const [loginPin, setLoginPin] = useState<string>("");

  // Campos de Registro
  const [regOwnerName, setRegOwnerName] = useState<string>("");
  const [regStoreName, setRegStoreName] = useState<string>("");
  const [regPhone, setRegPhone] = useState<string>("");
  const [regPin, setRegPin] = useState<string>("");

  // Vista interna: "principal" | "configuracion"
  const [activeView, setActiveView] = useState<"principal" | "configuracion">(
    "principal"
  );

  // Estados de Configuración
  const [cfgStoreName, setCfgStoreName] = useState<string>("");
  const [cfgPassword, setCfgPassword] = useState<string>("");
  const [cfgStoreDescription, setCfgStoreDescription] = useState<string>("");
  const [cfgAddress, setCfgAddress] = useState<string>("");
  const [cfgSchedule, setCfgSchedule] = useState<string>("");
  const [cfgAvatarUrl, setCfgAvatarUrl] = useState<string>("");
  const [cfgBankQrUrl, setCfgBankQrUrl] = useState<string>("");
  const [cfgMessage, setCfgMessage] = useState<string | null>(null);
  const [cfgError, setCfgError] = useState<string | null>(null);
  const [isSavingConfig, setIsSavingConfig] = useState<boolean>(false);

  // Modal de Alta / Edición de Producto
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [productStep, setProductStep] = useState<"edit" | "preview">("edit");
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [name, setName] = useState<string>("");
  const [priceMotes, setPriceMotes] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [productError, setProductError] = useState<string | null>(null);
  const [isSubmittingProduct, setIsSubmittingProduct] =
    useState<boolean>(false);
  const [uploadingBucket, setUploadingBucket] = useState<StorageBucket | null>(
    null
  );
  const priceInputRef = useRef<HTMLInputElement | null>(null);

  const syncConfigFields = useCallback((mer: User) => {
    setCfgStoreName(mer.storeName || "");
    setCfgPassword("");
    setCfgStoreDescription(mer.storeDescription || "");
    setCfgAddress(mer.address || "");
    setCfgSchedule(mer.schedule || "");
    setCfgAvatarUrl(mer.avatarUrl || "");
    setCfgBankQrUrl(mer.bankQrUrl || "");
  }, []);

  const resetToLoginState = useCallback(() => {
    setMerchant(null);
    setProducts([]);
    setDeliveries([]);
    setOrders([]);
    setPendingRampOrder(null);
    setActiveView("principal");
    setAuthTab("login");
    setAuthStatus("unauthenticated");
  }, []);

  const loadProtectedMerchantData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const [prodRes, delRes] = await Promise.all([
        fetch("/api/products?includeClosed=true"),
        fetch("/api/deliveries"),
      ]);

      if (prodRes.status === 401 || delRes.status === 401) {
        resetToLoginState();
        return;
      }

      const [prodData, delData] = await Promise.all([
        prodRes.json(),
        delRes.json(),
      ]);

      if (prodRes.ok) {
        setProducts(prodData.products || []);
      }
      if (delRes.ok) {
        setDeliveries(delData.deliveries || []);
        setOrders(delData.orders || []);
      }
    } catch {
      setCfgError(COMMUNITY_COPY.defaultError);
    } finally {
      setIsLoadingData(false);
    }
  }, [resetToLoginState]);

  const refreshSessionAndData = useCallback(async () => {
    try {
      const userRes = await fetch("/api/users");
      const userData = await userRes.json();
      if (userRes.ok && userData.merchant?.isLoggedIn) {
        setMerchant(userData.merchant);
        syncConfigFields(userData.merchant);
        setAuthStatus("authenticated");
        await loadProtectedMerchantData();
      } else {
        resetToLoginState();
      }
    } catch {
      setCfgError(COMMUNITY_COPY.defaultError);
    }
  }, [loadProtectedMerchantData, resetToLoginState, syncConfigFields]);

  // Exige verificación explícita de sesión; en recarga o entrada con ?login=1 va directo al login
  useEffect(() => {
    let active = true;
    async function init() {
      const forceLogin =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("login") === "1";

      if (forceLogin || isPageReloadNavigation()) {
        if (forceLogin && typeof window !== "undefined") {
          window.history.replaceState(null, "", "/panel-caserita");
        }
        if (active) {
          resetToLoginState();
        }
        const disconnectTask = disconnectProfileSession(
          "merchant_logout",
          pollarLogout
        );
        disconnectPromiseRef.current = disconnectTask;
        await disconnectTask;
        if (disconnectPromiseRef.current === disconnectTask) {
          disconnectPromiseRef.current = null;
        }
        return;
      }

      try {
        const userRes = await fetch("/api/users");
        const userData = await userRes.json();
        if (!active) return;

        if (userRes.ok && userData.merchant?.isLoggedIn) {
          setMerchant(userData.merchant);
          syncConfigFields(userData.merchant);
          setAuthStatus("authenticated");
          await loadProtectedMerchantData();
        } else {
          resetToLoginState();
        }
      } catch {
        if (active) {
          resetToLoginState();
        }
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [
    loadProtectedMerchantData,
    pollarLogout,
    resetToLoginState,
    syncConfigFields,
  ]);

  useDisconnectOnPageUnload(
    authStatus === "authenticated" && Boolean(merchant?.isLoggedIn),
    "merchant_logout"
  );

  const handleMerchantPollarSynced = useCallback((result: PollarSyncResult) => {
    if (!result.synced) return;
    setMerchant((prev) =>
      prev
        ? {
            ...prev,
            pollar_user_id: result.pollarUserId ?? prev.pollar_user_id,
            stellar_address: result.stellarAddress ?? prev.stellar_address,
          }
        : prev
    );
  }, []);

  const syncMerchantPollarInBackground = useCallback(
    async (targetMerchant: User | null) => {
      if (!targetMerchant?.isLoggedIn) return;
      const result = await ensurePollarWalletAndSync(getPollarClient(), {
        userId: targetMerchant.id,
        role: "merchant",
      });
      if (result.synced) {
        handleMerchantPollarSynced(result);
      }
    },
    [getPollarClient, handleMerchantPollarSynced]
  );

  const confirmCompletedPendingOrder = useCallback(
    async (orderId: string) => {
      const client = getPollarClient();
      const order = await client.getRampOrder(orderId);
      if (order.state !== "completed") {
        return { completed: false, state: order.state };
      }

      const payload = extractCompletedRampOrder(order, client);
      if (!payload) {
        return { completed: false, state: order.state };
      }

      const purpose = merchant?.isProsumer ? "fiat_topup" : "merchant_premium";
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm_ramp_topup",
          role: "merchant",
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
      if (res.ok && data.merchant) {
        setMerchant(data.merchant);
        syncConfigFields(data.merchant);
        setPendingRampOrder(null);
        setCfgError(null);
        setCfgMessage(
          translateBackendMessage(data.message) ||
            "¡Recarga confirmada y sumada a tu libreta comunitaria!"
        );
        return { completed: true, state: order.state };
      }
      if (res.status === 409 && data.duplicate) {
        setPendingRampOrder(null);
        await refreshSessionAndData();
        return { completed: true, state: order.state };
      }
      setCfgError(sanitizeUserError(data.error));
      return { completed: false, state: order.state };
    },
    [
      getPollarClient,
      merchant?.isProsumer,
      refreshSessionAndData,
      syncConfigFields,
    ]
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
            void confirmCompletedPendingOrder(next.id);
          } else if (next.state === "failed" || next.state === "refunded") {
            setPendingRampOrder(null);
            setCfgError(COMMUNITY_COPY.rechargeFailed);
          }
        },
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [
    pendingRampOrder?.pollarOrderId,
    getPollarClient,
    confirmCompletedPendingOrder,
  ]);

  const uploadToBucket = async (
    bucket: StorageBucket,
    file: File,
    onUploaded: (publicUrl: string) => void | Promise<void>
  ) => {
    try {
      setUploadingBucket(bucket);
      const compressed = await compressImageToWebP(file, {
        maxDimension: 1080,
        maxBytes: 80 * 1024,
      });
      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket,
          dataUrl: compressed.dataUrl,
          ownerId: merchant?.id || "ecobanco",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const errMsg = sanitizeUserError(data.error);
        if (bucket === "product-images") {
          setProductError(errMsg);
        } else {
          setCfgError(errMsg);
        }
        return;
      }
      await onUploaded(data.publicUrl);
    } catch (err) {
      const fallbackErr = sanitizeUserError(err);
      if (bucket === "product-images") {
        setProductError(fallbackErr);
      } else {
        setCfgError(fallbackErr);
      }
    } finally {
      setUploadingBucket(null);
    }
  };

  const handleQuickAvatarUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadToBucket("avatars", file, async (publicUrl) => {
      setCfgAvatarUrl(publicUrl);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          avatarUrl: publicUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMerchant(data.merchant);
        if (data.products) setProducts(data.products);
      }
    });
  };

  const handleBankQrUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    await uploadToBucket("qr-bancarios", file, async (publicUrl) => {
      setCfgBankQrUrl(publicUrl);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          bankQrUrl: publicUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMerchant(data.merchant);
        setCfgMessage(
          "Tu QR bancario quedó guardado y listo para recibir cobros."
        );
      }
    });
  };

  const handleToggleStoreOpen = async () => {
    if (!merchant) return;
    const nextIsOpen = !(merchant.isOpen !== false);
    try {
      setIsTogglingOpen(true);
      setCfgError(null);
      setCfgMessage(null);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_toggle_open",
          isOpen: nextIsOpen,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCfgError(sanitizeUserError(data.error));
        return;
      }
      setMerchant(data.merchant);
      if (data.products) setProducts(data.products);
      setCfgMessage(
        nextIsOpen
          ? "🟢 Tu puesto ahora está ABIERTO y visible en el Mercado del Barrio."
          : "🔴 Tu puesto ahora está CERRADO. No aparecerá en el mercado hasta que lo abras."
      );
    } catch (err) {
      setCfgError(sanitizeUserError(err));
    } finally {
      setIsTogglingOpen(false);
    }
  };

  const handleMerchantLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanId = loginIdentifier.trim();
    const cleanPhone = loginPhone.replace(/\s+/g, "").trim();
    const cleanPin = loginPin.replace(/\D/g, "").slice(0, 4);

    if (!cleanId) {
      setAuthError("Escribe tu nombre o el nombre de tu puesto.");
      return;
    }

    if (!cleanPhone && cleanPin.length !== 4) {
      setAuthError(
        "Ingresa tu número de WhatsApp o tu clave secreta de 4 números."
      );
      return;
    }

    setIsSubmittingAuth(true);
    setAuthBusyText("Abriendo tu puesto...");

    try {
      if (disconnectPromiseRef.current) {
        await disconnectPromiseRef.current;
      }

      const completeLoginSuccess = async (
        loggedMerchant: User,
        message?: string
      ) => {
        setMerchant(loggedMerchant);
        syncConfigFields(loggedMerchant);
        setAuthStatus("authenticated");
        if (message) {
          setCfgMessage(message);
        }
        setLoginIdentifier("");
        setLoginPhone("");
        setLoginPin("");
        await loadProtectedMerchantData();
        void syncMerchantPollarInBackground(loggedMerchant);
      };

      if (cleanPin.length === 4) {
        const pinRes = await fetch("/api/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "merchant_login",
            identifier: cleanId,
            password: cleanPin,
          }),
        });
        const pinData = await pinRes.json();

        if (pinRes.ok && pinData.merchant) {
          await completeLoginSuccess(pinData.merchant);
          return;
        }

        if (cleanPhone) {
          const phoneRes = await fetch("/api/users", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "merchant_login",
              identifier: cleanId,
              password: cleanPhone,
            }),
          });
          const phoneData = await phoneRes.json();
          if (phoneRes.ok && phoneData.merchant) {
            let finalMerchant: User = phoneData.merchant;
            const savePinRes = await fetch("/api/users", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                action: "merchant_update_settings",
                password: cleanPin,
              }),
            });
            if (savePinRes.ok) {
              const savedData = await savePinRes.json();
              if (savedData.merchant) {
                finalMerchant = savedData.merchant;
              }
            }
            await completeLoginSuccess(
              finalMerchant,
              "¡Bienvenida! Guardamos tu clave secreta de 4 números."
            );
            return;
          }
          setAuthError(sanitizeUserError(phoneData.error));
          return;
        }

        setAuthError(sanitizeUserError(pinData.error));
        return;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_login",
          identifier: cleanId,
          password: cleanPhone,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.merchant) {
        setAuthError(sanitizeUserError(data.error));
        return;
      }

      await completeLoginSuccess(data.merchant);
    } catch (err) {
      setAuthError(sanitizeUserError(err));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleMerchantRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanPin = regPin.replace(/\D/g, "").slice(0, 4);
    if (cleanPin.length !== 4) {
      setAuthError(
        "Crea tu clave secreta de 4 números (como la del cajero) para proteger tu puesto."
      );
      return;
    }

    setIsSubmittingAuth(true);
    setAuthBusyText("Guardando tu puesto...");

    try {
      if (disconnectPromiseRef.current) {
        await disconnectPromiseRef.current;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_register",
          ownerName: regOwnerName,
          storeName: regStoreName,
          phone: regPhone,
          password: cleanPin,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.merchant) {
        setAuthError(sanitizeUserError(data.error));
        return;
      }

      const createdMerchant: User = data.merchant;
      setMerchant(createdMerchant);
      syncConfigFields(createdMerchant);
      setAuthStatus("authenticated");
      setRegOwnerName("");
      setRegStoreName("");
      setRegPhone("");
      setRegPin("");
      await loadProtectedMerchantData();
      void syncMerchantPollarInBackground(createdMerchant);
    } catch (err) {
      setAuthError(sanitizeUserError(err));
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleMerchantLogout = async (redirectHome = false) => {
    await disconnectProfileSession(
      redirectHome ? "logout_all" : "merchant_logout",
      pollarLogout
    );
    resetToLoginState();
    if (redirectHome) {
      router.push("/");
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setCfgMessage(null);
    setCfgError(null);

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          storeName: cfgStoreName,
          password: cfgPassword || undefined,
          storeDescription: cfgStoreDescription,
          address: cfgAddress,
          schedule: cfgSchedule,
          avatarUrl: cfgAvatarUrl,
          bankQrUrl: cfgBankQrUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCfgError(sanitizeUserError(data.error));
        return;
      }
      setMerchant(data.merchant);
      if (data.products) setProducts(data.products);
      setCfgPassword("");
      setCfgMessage("Cambios guardados correctamente.");
    } catch (err) {
      setCfgError(sanitizeUserError(err));
    } finally {
      setIsSavingConfig(false);
    }
  };

  const handleUnlockAliada = async (paymentMethod: "motes" | "fiat") => {
    setCfgError(null);
    setCfgMessage(null);

    if (
      paymentMethod === "fiat" &&
      Number(merchant?.fiatBs ?? 0) < SUBSCRIPTION_COST
    ) {
      setIsRampOpen(true);
      return;
    }

    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_upgrade_subscription",
          paymentMethod,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setCfgError(sanitizeUserError(data.error));
        return;
      }

      setMerchant(data.merchant);
      syncConfigFields(data.merchant);
      setCfgMessage(
        paymentMethod === "motes"
          ? "¡Ya eres Caserita Aliada con tus 100 MOTES! Tu cobro directo a QR bancario y 5 envíos ecológicos gratis ya están activos."
          : "¡Caserita Aliada activada con 100 Bs! Conservas todos tus MOTES y ya tienes activos tu cobro directo a QR bancario y 5 envíos ecológicos gratis."
      );
    } catch (err) {
      setCfgError(sanitizeUserError(err));
    }
  };

  const handleCheckPendingRamp = async () => {
    if (!pendingRampOrder?.pollarOrderId) return;
    try {
      setIsCheckingPendingRamp(true);
      const outcome = await confirmCompletedPendingOrder(
        pendingRampOrder.pollarOrderId
      );
      if (!outcome.completed) {
        setCfgMessage(getRechargeStatusMessage(outcome.state));
      }
    } catch (err) {
      setCfgError(sanitizeUserError(err));
    } finally {
      setIsCheckingPendingRamp(false);
    }
  };

  const openCreateModal = () => {
    setEditingProduct(null);
    setName("");
    setPriceMotes("");
    setDescription("");
    setImageUrl("");
    setProductError(null);
    setProductStep("edit");
    setIsModalOpen(true);
  };

  const openEditModal = (item: Product) => {
    setEditingProduct(item);
    setName(item.name);
    setPriceMotes(String(Math.round(item.priceMotes)));
    setDescription(item.description);
    setImageUrl(item.imageUrl || "");
    setProductError(null);
    setProductStep("edit");
    setIsModalOpen(true);
  };

  const handleContinueToPreview = (e: React.FormEvent) => {
    e.preventDefault();
    setProductError(null);

    if (!imageUrl) {
      setProductError("Primero sube una foto real de tu producto.");
      return;
    }
    if (!name.trim()) {
      setProductError("Escribe el nombre del producto.");
      return;
    }
    if (!priceMotes || Number(priceMotes) <= 0) {
      setProductError("Ingresa un precio válido en Bolivianos (Bs).");
      return;
    }

    setProductStep("preview");
  };

  const handleCorrectPrice = () => {
    setProductStep("edit");
    setTimeout(() => {
      priceInputRef.current?.focus();
      priceInputRef.current?.select();
    }, 80);
  };

  const handleConfirmPublishProduct = async () => {
    setProductError(null);
    const resolvedPrice = Math.round(Number(priceMotes));
    const resolvedDescription =
      description.trim() ||
      `${name.trim()} — Producto fresco de ${
        merchant?.storeName || "tu caserita del barrio"
      }.`;

    try {
      setIsSubmittingProduct(true);
      if (editingProduct) {
        const res = await fetch("/api/products", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingProduct.id,
            name: name.trim(),
            priceMotes: resolvedPrice,
            description: resolvedDescription,
            imageUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setProductError(sanitizeUserError(data.error));
          setProductStep("edit");
          return;
        }
        setProducts(data.products);
      } else {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            priceMotes: resolvedPrice,
            description: resolvedDescription,
            imageUrl,
            sellerName: merchant?.storeName || "",
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setProductError(sanitizeUserError(data.error));
          setProductStep("edit");
          return;
        }
        setProducts(data.products);
      }
      setIsModalOpen(false);
      setCfgMessage(
        editingProduct
          ? "Producto actualizado en tu puesto."
          : "¡Producto publicado en tu puesto!"
      );
    } catch (err) {
      setProductError(sanitizeUserError(err));
      setProductStep("edit");
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleDeleteProduct = async (id: string) => {
    const res = await fetch(`/api/products?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const data = await res.json();
      setProducts(data.products);
    }
  };

  const myProducts = useMemo(
    () =>
      products.filter(
        (p) =>
          p.sellerId === merchant?.id ||
          p.sellerName.toLowerCase() === merchant?.storeName?.toLowerCase()
      ),
    [products, merchant?.id, merchant?.storeName]
  );

  const myDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) =>
          d.seller_id === merchant?.id ||
          (d.seller_name || "").toLowerCase() ===
            (merchant?.storeName || "").toLowerCase()
      ),
    [deliveries, merchant?.id, merchant?.storeName]
  );

  const orderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders]
  );
  const currentMotes = Math.round(merchant?.motes ?? 0);
  const canUnlockWithMotes = currentMotes >= SUBSCRIPTION_COST;
  const motesProgressPct = Math.min(
    100,
    Math.round((currentMotes / SUBSCRIPTION_COST) * 100)
  );
  const motesRemaining = Math.max(0, SUBSCRIPTION_COST - currentMotes);
  const isStoreOpen = merchant?.isOpen !== false;
  const hasBsWalletEnabled = Boolean(
    merchant?.fiatWalletEnabled || merchant?.isProsumer
  );

  // GUARDIA 1: Verificación de sesión (nunca muestra el dashboard ni perfil vacío)
  if (authStatus === "checking") {
    return (
      <div className="min-h-screen eco-page font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto rounded-2xl eco-card p-6 sm:p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl eco-inset flex items-center justify-center text-3xl animate-pulse">
            🏪
          </div>
          <h1 className="font-brand text-2xl eco-text">
            Verificando acceso a tu puesto...
          </h1>
          <p className="text-base eco-text-muted">
            Por seguridad, comprobamos tu sesión antes de mostrar tus datos.
          </p>
        </div>
      </div>
    );
  }

  // GUARDIA 2: PANTALLA DE INGRESO / REGISTRO DE CASERITAS
  if (authStatus !== "authenticated" || !merchant?.isLoggedIn) {
    return (
      <div className="min-h-screen eco-page font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto space-y-5">
          <button
            type="button"
            onClick={() => void handleMerchantLogout(true)}
            className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl eco-btn-ghost text-base font-bold"
          >
            ← Inicio
          </button>

          <div className="rounded-2xl eco-card-gold p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-oro via-brillo to-madera p-0.5 flex items-center justify-center shadow-md">
                <div className="w-full h-full rounded-2xl bg-bosque flex items-center justify-center text-3xl">
                  🏪
                </div>
              </div>
              <h1 className="font-brand text-2xl sm:text-3xl eco-text">
                Puesto de la Caserita
              </h1>
              <p className="text-base eco-text-muted">
                Ingresa a tu puesto o abre uno gratis para vender en tu barrio.
              </p>
              <span className="inline-block px-3 py-1 rounded-full eco-alert-success text-xs font-extrabold">
                {COMMUNITY_COPY.zeroCommission}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl eco-inset">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("login");
                  setAuthError(null);
                }}
                className={`min-h-[48px] py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition ${
                  authTab === "login"
                    ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow"
                    : "eco-text-muted hover:eco-text"
                }`}
              >
                Ingresar
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab("register");
                  setAuthError(null);
                }}
                className={`min-h-[48px] py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition ${
                  authTab === "register"
                    ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow"
                    : "eco-text-muted hover:eco-text"
                }`}
              >
                Abrir Puesto
              </button>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl eco-alert-error text-base font-bold text-center">
                ⚠️ {authError}
              </div>
            )}

            {authTab === "login" ? (
              <form onSubmit={handleMerchantLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    Tu Nombre o Nombre de tu Puesto *
                  </label>
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Ej. Doña Eliana"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    Número de WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="Ej. 73540555"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text-gold mb-1">
                    Clave secreta de 4 números (PIN)
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    value={loginPin}
                    onChange={(e) =>
                      setLoginPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="• • • •"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input font-mono text-2xl font-bold tracking-[0.4em] text-center"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full min-h-[52px] py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition"
                >
                  {isSubmittingAuth ? authBusyText : "Entrar a mi Puesto"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleMerchantRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    1. Tu Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={regOwnerName}
                    onChange={(e) => setRegOwnerName(e.target.value)}
                    placeholder="Ej. Juana Mamani"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    2. Nombre de tu Puesto o Negocio *
                  </label>
                  <input
                    type="text"
                    required
                    value={regStoreName}
                    onChange={(e) => setRegStoreName(e.target.value)}
                    placeholder="Ej. Salteñas Doña Juana"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    3. Número de WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Ej. 73540555"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text-gold mb-1">
                    4. Clave secreta de 4 números (PIN) *
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={4}
                    required
                    value={regPin}
                    onChange={(e) =>
                      setRegPin(e.target.value.replace(/\D/g, "").slice(0, 4))
                    }
                    placeholder="• • • •"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input font-mono text-2xl font-bold tracking-[0.4em] text-center"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full min-h-[52px] py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-lg sm:text-xl shadow-green-glow active:scale-95 transition"
                >
                  {isSubmittingAuth ? authBusyText : "Abrir mi Puesto Gratis"}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen eco-page font-sans pb-16">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* Barra superior minimalista */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleMerchantLogout(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl eco-btn-ghost text-sm font-bold"
          >
            ← Inicio
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCfgMessage(null);
                setCfgError(null);
                setActiveView(
                  activeView === "configuracion" ? "principal" : "configuracion"
                );
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition ${
                activeView === "configuracion"
                  ? "bg-oro text-bosque shadow"
                  : "eco-btn-ghost"
              }`}
            >
              ⚙️{" "}
              {activeView === "configuracion"
                ? "Volver al Puesto"
                : "Configuración"}
            </button>

            <button
              type="button"
              onClick={() => void handleMerchantLogout(false)}
              className="px-3.5 py-2.5 rounded-xl eco-btn-danger text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Mensajes globales */}
        {cfgMessage && (
          <div className="p-3.5 rounded-2xl eco-alert-success text-sm font-bold">
            ✅ {cfgMessage}
          </div>
        )}
        {cfgError && (
          <div className="p-3.5 rounded-2xl eco-alert-error text-sm font-bold">
            ⚠️ {cfgError}
          </div>
        )}

        {activeView === "configuracion" ? (
          /* VISTA DE CONFIGURACIÓN (Tema oscuro + Ajustes del Puesto + Caserita Aliada) */
          <section className="rounded-2xl eco-card p-5 sm:p-6 space-y-6">
            <div className="border-b border-oro/20 pb-3">
              <h2 className="font-brand text-2xl eco-text">
                ⚙️ Configuración de tu Puesto
              </h2>
              <p className="text-sm eco-text-muted">
                Edita los datos de tu puesto, activa el modo oscuro o configura
                tu cobro con QR bancario.
              </p>
            </div>

            {/* Selector de Tema Oscuro (solo disponible en Configuración) */}
            <ThemeToggleSetting />

            <form onSubmit={handleSaveConfig} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase eco-text">
                  Foto de tu Puesto
                </label>
                <div className="flex items-center gap-4">
                  {cfgAvatarUrl ? (
                    <img
                      src={cfgAvatarUrl}
                      alt="Foto del puesto"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-oro"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl eco-inset flex items-center justify-center text-2xl">
                      🏪
                    </div>
                  )}
                  <label className="px-4 py-3 rounded-xl eco-btn-ghost text-xs sm:text-sm font-extrabold cursor-pointer">
                    {uploadingBucket === "avatars"
                      ? "Optimizando foto..."
                      : "📷 Cambiar Foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          uploadToBucket("avatars", file, setCfgAvatarUrl);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase eco-text mb-1">
                  Nombre de tu Puesto
                </label>
                <input
                  type="text"
                  required
                  value={cfgStoreName}
                  onChange={(e) => setCfgStoreName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl eco-input text-base"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase eco-text mb-1">
                  Información / ¿Qué vendes?
                </label>
                <textarea
                  rows={2}
                  value={cfgStoreDescription}
                  onChange={(e) => setCfgStoreDescription(e.target.value)}
                  placeholder="Ej. Sopitas caseras, pan recién horneado, verduras frescas..."
                  className="w-full px-4 py-3 rounded-xl eco-input text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    Dirección o Zona
                  </label>
                  <input
                    type="text"
                    value={cfgAddress}
                    onChange={(e) => setCfgAddress(e.target.value)}
                    placeholder="Zona, feria o calle"
                    className="w-full px-4 py-3 rounded-xl eco-input text-base"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    Horario de Atención
                  </label>
                  <input
                    type="text"
                    value={cfgSchedule}
                    onChange={(e) => setCfgSchedule(e.target.value)}
                    placeholder="Ej. Lun a Sáb 8:00 - 18:00"
                    className="w-full px-4 py-3 rounded-xl eco-input text-base"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase eco-text mb-1">
                  Cambiar clave PIN de 4 números (opcional)
                </label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={4}
                  value={cfgPassword}
                  onChange={(e) =>
                    setCfgPassword(
                      e.target.value.replace(/\D/g, "").slice(0, 4)
                    )
                  }
                  placeholder="Déjalo vacío para mantener tu clave actual"
                  className="w-full px-4 py-3 rounded-xl eco-input text-base"
                />
              </div>

              {/* Caserita Aliada y QR Bancario */}
              <div className="pt-4 border-t border-oro/20 space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold uppercase eco-text-gold block">
                      🌟 Caserita Aliada (100 MOTES o 100 Bs)
                    </span>
                    <h3 className="font-brand text-lg eco-text">
                      Cobro directo a tu QR bancario + 5 envíos ecológicos
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase shrink-0 ${
                      merchant?.isProsumer
                        ? "bg-brote text-bosque"
                        : "eco-inset eco-text-gold"
                    }`}
                  >
                    {merchant?.isProsumer ? "Activa" : "Plan Gratuito"}
                  </span>
                </div>

                {!merchant?.isProsumer ? (
                  <div className="rounded-2xl eco-inset p-4 space-y-3">
                    <p className="text-sm eco-text-muted leading-relaxed">
                      Llevas{" "}
                      <strong className="eco-text-gold">{currentMotes}</strong>{" "}
                      de <strong className="eco-text-gold">100 MOTES</strong> en
                      ventas. Al llegar a 100 se desbloquea gratis, o puedes
                      activarla hoy mismo con 100 Bs.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        disabled={!canUnlockWithMotes}
                        onClick={() => handleUnlockAliada("motes")}
                        className={`py-3 px-3 rounded-xl font-extrabold text-xs uppercase transition ${
                          canUnlockWithMotes
                            ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow-green-glow"
                            : "eco-btn-ghost opacity-60 cursor-not-allowed"
                        }`}
                      >
                        {canUnlockWithMotes
                          ? "🌱 Activar con 100 MOTES"
                          : `Faltan ${motesRemaining} MOTES`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnlockAliada("fiat")}
                        className="py-3 px-3 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-extrabold text-xs uppercase shadow-gold-glow"
                      >
                        {Number(merchant?.fiatBs ?? 0) >= SUBSCRIPTION_COST
                          ? "✅ Activar con mi saldo (100 Bs)"
                          : "📲 Activar con QR (100 Bs)"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl eco-card-green p-4 space-y-2.5">
                    <label className="block text-xs font-bold uppercase eco-text-green">
                      Tu Código QR Bancario (Para recibir pagos en Bs)
                    </label>
                    <div className="flex items-center gap-3.5">
                      {cfgBankQrUrl && (
                        <img
                          src={cfgBankQrUrl}
                          alt="QR Bancario"
                          className="w-20 h-20 rounded-xl object-cover border-2 border-oro"
                        />
                      )}
                      <label className="px-4 py-3 rounded-xl eco-btn-ghost text-xs sm:text-sm font-extrabold cursor-pointer">
                        {uploadingBucket === "qr-bancarios"
                          ? "Guardando QR..."
                          : "📲 Subir Imagen de tu QR Bancario"}
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleBankQrUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSavingConfig || uploadingBucket !== null}
                className="w-full py-4 rounded-2xl bg-brote text-bosque font-brand text-xl shadow-green-glow"
              >
                {isSavingConfig ? "Guardando..." : "Guardar Configuración"}
              </button>
            </form>
          </section>
        ) : (
          /* PERFIL LIMPIO DE LA CASERITA EN ORDEN ESTRICTO DE PRIORIDAD */
          <>
            {/* 1. PRIORIDAD 1: Nombre del puesto, propietaria, información y número de contacto */}
            <header className="rounded-2xl eco-card p-5 space-y-3.5">
              <div className="flex items-start gap-4">
                <label className="relative cursor-pointer shrink-0">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleQuickAvatarUpload}
                    className="hidden"
                  />
                  {merchant?.avatarUrl ? (
                    <img
                      src={merchant.avatarUrl}
                      alt={merchant.storeName}
                      className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-oro"
                    />
                  ) : (
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl eco-inset border-2 border-dashed border-oro/70 flex flex-col items-center justify-center text-center p-1">
                      <span className="text-xl">📷</span>
                      <span className="text-[10px] font-bold eco-text-gold leading-tight">
                        Foto
                      </span>
                    </div>
                  )}
                  <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-oro text-bosque text-xs font-extrabold flex items-center justify-center shadow">
                    ✎
                  </span>
                </label>

                <div className="min-w-0 flex-1 space-y-1">
                  <h1 className="font-brand text-2xl sm:text-3xl eco-text leading-tight">
                    {merchant?.storeName}
                  </h1>
                  <p className="text-sm font-semibold eco-text-muted">
                    Propietaria:{" "}
                    <strong className="eco-text">{merchant?.name}</strong>
                  </p>
                  {merchant?.phone && (
                    <p className="text-sm font-bold eco-text-green">
                      📱 Contacto WhatsApp: {merchant.phone}
                    </p>
                  )}
                </div>
              </div>

              {/* Información del puesto */}
              <div className="pt-3 border-t border-oro/20 space-y-1.5 text-sm">
                {merchant?.storeDescription ? (
                  <p className="eco-text">{merchant.storeDescription}</p>
                ) : (
                  <p className="text-xs eco-text-muted">
                    Agrega una descripción, dirección y horario en ⚙️
                    Configuración para que tus vecinos te encuentren fácil.
                  </p>
                )}
                {(merchant?.address || merchant?.schedule) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold eco-text-muted">
                    {merchant?.address && <span>📍 {merchant.address}</span>}
                    {merchant?.schedule && <span>🕒 {merchant.schedule}</span>}
                  </div>
                )}
              </div>
            </header>

            {/* 2. PRIORIDAD 2: Puesto abierto o cerrado */}
            <section
              aria-label="Estado del puesto"
              className={`rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3 ${
                isStoreOpen ? "eco-card-green" : "eco-card"
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-lg" aria-hidden="true">
                    {isStoreOpen ? "🟢" : "🔴"}
                  </span>
                  <h2 className="font-brand text-lg sm:text-xl eco-text">
                    {isStoreOpen ? "Puesto Abierto" : "Puesto Cerrado"}
                  </h2>
                </div>
                <p className="text-xs sm:text-sm eco-text-muted">
                  {isStoreOpen
                    ? "Tus productos están visibles ahora en el Mercado del Barrio."
                    : "Tu puesto está oculto temporalmente en el mercado."}
                </p>
              </div>

              <button
                type="button"
                disabled={isTogglingOpen}
                onClick={handleToggleStoreOpen}
                className={`px-5 py-3 rounded-xl font-extrabold text-sm transition active:scale-95 disabled:opacity-60 ${
                  isStoreOpen
                    ? "eco-btn-danger"
                    : "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow-green-glow"
                }`}
              >
                {isTogglingOpen
                  ? "Actualizando..."
                  : isStoreOpen
                  ? "Cerrar puesto"
                  : "Abrir puesto"}
              </button>
            </section>

            {/* 3. PRIORIDAD 3: Saldo en Bs (SOLO si tiene habilitada la billetera/libreta) */}
            {merchant?.isLoggedIn && hasBsWalletEnabled ? (
              <div className="space-y-2.5">
                <PollarWalletSection
                  role="merchant"
                  userId={merchant.id}
                  savedStellarAddress={merchant.stellar_address}
                  savedPollarUserId={merchant.pollar_user_id}
                  mode="profile-badge"
                  compact
                  balanceBs={merchant.fiatBs ?? 0}
                  balanceMotes={currentMotes}
                  rechargeAmountBs={SUBSCRIPTION_COST}
                  rechargePurpose="fiat_topup"
                  movementsHref="#mis-movimientos"
                  movementsCount={myDeliveries.length}
                  onOpenRecharge={() => setIsRampOpen(true)}
                  onSynced={handleMerchantPollarSynced}
                />

                {pendingRampOrder && (
                  <div className="rounded-xl eco-card-gold p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-bold eco-text-gold">
                      ⏳ {getRechargeStatusLabel(pendingRampOrder.state)}
                    </span>
                    <button
                      type="button"
                      disabled={isCheckingPendingRamp}
                      onClick={handleCheckPendingRamp}
                      className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold uppercase disabled:opacity-60"
                    >
                      {isCheckingPendingRamp
                        ? "Verificando..."
                        : "🔄 Verificar recarga"}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              /* Sincronización silenciosa en segundo plano cuando aún está en plan gratuito */
              merchant?.isLoggedIn && (
                <PollarWalletSection
                  role="merchant"
                  userId={merchant.id}
                  savedStellarAddress={merchant.stellar_address}
                  savedPollarUserId={merchant.pollar_user_id}
                  mode="auth-entry"
                  onSynced={handleMerchantPollarSynced}
                />
              )
            )}

            {/* 4. PRIORIDAD 4: Información de plan gratuito y barra de estado rumbo a Caserita Aliada */}
            {!merchant?.isProsumer ? (
              <section
                aria-label="Plan gratuito rumbo a Caserita Aliada"
                className="rounded-2xl eco-card-gold p-5 space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="px-2.5 py-1 rounded-full eco-alert-success text-xs font-extrabold uppercase">
                    🌱 Plan Gratuito
                  </span>
                  <span className="font-brand text-lg eco-text-gold">
                    {currentMotes} / {SUBSCRIPTION_COST} MOTES
                  </span>
                </div>

                <div className="w-full h-3.5 rounded-full eco-inset overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-brote via-oro to-brillo transition-all duration-500"
                    style={{ width: `${motesProgressPct}%` }}
                  />
                </div>

                <p className="text-sm eco-text leading-snug">
                  Rumbo a{" "}
                  <strong className="eco-text-gold">Caserita Aliada</strong>:
                  llevas <strong>{currentMotes}</strong> de{" "}
                  <strong>100 MOTES</strong> en ventas. Al llegar a 100
                  desbloqueas gratis tu{" "}
                  <strong className="eco-text-green">
                    cobro directo a QR bancario + 5 envíos ecológicos
                  </strong>
                  .
                </p>

                <button
                  type="button"
                  onClick={() => setActiveView("configuracion")}
                  className="text-xs font-extrabold eco-text-gold underline"
                >
                  ¿Quieres activar Caserita Aliada hoy? Ver en Configuración →
                </button>
              </section>
            ) : (
              <section
                aria-label="Plan Caserita Aliada"
                className="rounded-2xl eco-card-green p-4 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="text-xs font-extrabold uppercase eco-text-green block">
                    ⭐ Caserita Aliada Activa
                  </span>
                  <p className="text-xs eco-text-muted">
                    🚲{" "}
                    {merchant?.free_deliveries_remaining ??
                      merchant?.freeDeliveries ??
                      0}{" "}
                    envíos ecológicos disponibles ·{" "}
                    {merchant?.bankQrUrl
                      ? "✅ QR bancario listo"
                      : "Sube tu QR en ⚙️ Configuración"}
                  </p>
                </div>
              </section>
            )}

            {/* 5. PRIORIDAD 5: Subir y gestionar productos */}
            <section
              aria-label="Subir y gestionar productos"
              className="space-y-4"
            >
              <button
                type="button"
                onClick={openCreateModal}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl sm:text-2xl tracking-wide shadow-green-glow active:scale-[0.98] transition-all border-2 border-white/40"
              >
                + Subir Producto
              </button>

              <div className="space-y-3">
                <h2 className="font-brand text-xl sm:text-2xl eco-text">
                  Mis Productos ({myProducts.length})
                </h2>

                {isLoadingData && myProducts.length === 0 ? (
                  <div className="h-32 rounded-2xl eco-inset animate-pulse" />
                ) : myProducts.length === 0 ? (
                  <div className="rounded-2xl eco-card p-7 text-center space-y-2">
                    <div className="text-4xl">🧺</div>
                    <p className="text-base font-bold eco-text">
                      Todavía no subiste productos
                    </p>
                    <p className="text-sm eco-text-muted">
                      Pulsa &ldquo;+ Subir Producto&rdquo;, saca una foto y pon
                      tu precio en Bolivianos (Bs).
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {myProducts.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl eco-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div className="flex items-center gap-3.5">
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-20 h-20 rounded-2xl object-cover border-2 border-oro/60 shrink-0"
                          />
                          <div className="space-y-0.5">
                            <span className="font-brand text-2xl eco-text-gold block">
                              {formatBs(item.priceMotes)}
                            </span>
                            <h3 className="font-brand text-lg eco-text leading-tight">
                              {item.name}
                            </h3>
                            <p className="text-xs eco-text-muted line-clamp-2">
                              {item.description}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-oro/15 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditModal(item)}
                            className="px-4 py-2 rounded-xl eco-btn-ghost text-xs sm:text-sm font-extrabold"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProduct(item.id)}
                            className="px-4 py-2 rounded-xl eco-btn-danger text-xs sm:text-sm font-extrabold"
                          >
                            Quitar
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {/* Pedidos entrantes (solo aparece cuando hay pedidos para entregar) */}
            {myDeliveries.length > 0 && (
              <section
                id="mis-movimientos"
                aria-label="Pedidos para entregar"
                className="rounded-2xl eco-card p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-brand text-xl eco-text">
                    🚲 Pedidos para Entregar ({myDeliveries.length})
                  </h2>
                  <button
                    type="button"
                    disabled={isLoadingData}
                    onClick={() => void loadProtectedMerchantData()}
                    className="px-3 py-1.5 rounded-xl eco-btn-ghost text-xs font-bold disabled:opacity-60"
                  >
                    {isLoadingData ? "Actualizando..." : "🔄 Actualizar"}
                  </button>
                </div>

                <div className="space-y-4">
                  {myDeliveries.map((del) => {
                    const order = orderById.get(del.order_id);
                    const delStatus = getDeliveryStatusCopy(
                      del.delivery_status
                    );
                    const protection = getPaymentProtectionCopy(
                      order?.status,
                      del.delivery_status
                    );
                    const orderAmount = Math.round(
                      Number(del.amount_motes ?? order?.amount_motes ?? 0)
                    );

                    return (
                      <article
                        key={del.id}
                        className="rounded-2xl eco-inset p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-extrabold eco-text-gold">
                                {formatOrderCode(
                                  del.order_id ||
                                    del.contract_id ||
                                    order?.contract_id
                                )}
                              </span>
                              <span className="px-2.5 py-0.5 rounded-full eco-alert-success text-xs font-extrabold uppercase">
                                {delStatus.label}
                              </span>
                            </div>
                            <h3 className="font-brand text-lg eco-text">
                              {(del.quantity ?? 1) > 1
                                ? `${del.quantity}x `
                                : ""}
                              {del.product_name}
                            </h3>
                            <p className="text-xs eco-text-muted">
                              Vecino:{" "}
                              <strong>{del.buyer_name || "Vecino"}</strong>
                              {del.rider_name
                                ? ` · Repartidor: ${del.rider_name}`
                                : ""}
                            </p>
                            {del.special_notes && (
                              <p className="text-xs font-semibold eco-card-gold rounded-lg px-2.5 py-1.5">
                                📝 <strong>Nota del cliente:</strong>{" "}
                                {del.special_notes}
                              </p>
                            )}
                          </div>

                          <div className="text-right">
                            <span className="font-brand text-xl eco-text-gold block">
                              +{formatBs(orderAmount)}
                            </span>
                            <span
                              className={`text-xs font-extrabold ${
                                protection.isReleased
                                  ? "eco-text-green"
                                  : "eco-text-gold"
                              }`}
                            >
                              {protection.sellerLabel}
                            </span>
                          </div>
                        </div>

                        <ProtectedPurchaseBar
                          deliveryStatus={del.delivery_status}
                          orderStatus={order?.status}
                          amountBs={orderAmount}
                          compact
                        />

                        <div className="rounded-2xl eco-pin-box border-2 border-oro p-3.5 text-center space-y-1">
                          <span className="text-xs font-extrabold uppercase tracking-wider block">
                            🔑 Código de recojo para el repartidor:
                          </span>
                          <span className="block font-mono text-4xl font-bold tracking-[0.2em] eco-pin-digits">
                            {del.pickup_pin}
                          </span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* MODAL SUBIR / EDITAR PRODUCTO */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl eco-card p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-brand text-2xl eco-text">
                {productStep === "preview"
                  ? "¿Se ve bien tu producto?"
                  : editingProduct
                  ? "Editar Producto"
                  : "Subir Producto"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-sm font-extrabold eco-text-muted hover:eco-text"
              >
                ✕ Cerrar
              </button>
            </div>

            {productError && (
              <div className="p-3.5 rounded-xl eco-alert-error text-sm font-bold">
                ⚠️ {productError}
              </div>
            )}

            {productStep === "edit" ? (
              <form onSubmit={handleContinueToPreview} className="space-y-4">
                <div className="rounded-2xl eco-inset p-4 space-y-2">
                  <span className="block text-sm font-extrabold uppercase eco-text-gold">
                    1. Foto del producto
                  </span>
                  <label className="block w-full rounded-2xl border-2 border-dashed border-oro/70 p-4 text-center cursor-pointer transition">
                    {imageUrl ? (
                      <div className="space-y-2">
                        <img
                          src={imageUrl}
                          alt="Vista previa del producto"
                          className="w-full h-44 object-cover rounded-xl mx-auto"
                        />
                        <span className="inline-block text-sm font-extrabold eco-text-gold">
                          📷 Toca aquí para cambiar la foto
                        </span>
                      </div>
                    ) : (
                      <div className="py-5 space-y-1.5">
                        <div className="text-4xl">📸</div>
                        <span className="block text-base font-extrabold eco-text-gold">
                          {uploadingBucket === "product-images"
                            ? "Optimizando foto..."
                            : "Toca aquí para tomar o elegir foto"}
                        </span>
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file)
                          uploadToBucket("product-images", file, setImageUrl);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="rounded-2xl eco-inset p-4 space-y-2">
                  <label
                    htmlFor="product-name-input"
                    className="block text-sm font-extrabold uppercase eco-text-gold"
                  >
                    2. Nombre del producto
                  </label>
                  <input
                    id="product-name-input"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ej. Sopita de fideo, Pan casero..."
                    className="w-full px-4 py-3.5 rounded-xl eco-input text-lg font-bold"
                  />
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nota corta opcional (ej. con llajua, por docena)"
                    className="w-full px-3.5 py-2.5 rounded-xl eco-input text-sm"
                  />
                </div>

                <div className="rounded-2xl eco-inset p-4 space-y-2">
                  <label
                    htmlFor="product-price-input"
                    className="block text-sm font-extrabold uppercase eco-text-gold"
                  >
                    3. Precio en Bolivianos (Bs)
                  </label>
                  <div className="relative flex items-center">
                    <input
                      id="product-price-input"
                      ref={priceInputRef}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      required
                      value={priceMotes}
                      onChange={(e) =>
                        setPriceMotes(e.target.value.replace(/[^0-9]/g, ""))
                      }
                      placeholder="15"
                      className="w-full pl-4 pr-16 py-4 rounded-xl eco-input font-brand text-3xl"
                    />
                    <span className="absolute right-4 font-brand text-2xl eco-text-gold">
                      Bs
                    </span>
                  </div>
                  <p className="text-xs font-bold eco-text-green">
                    {COMMUNITY_COPY.zeroCommission} · {COMMUNITY_COPY.moteParity}
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={uploadingBucket === "product-images"}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-xl shadow-gold-glow active:scale-95 transition"
                >
                  Revisar antes de publicar →
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="rounded-2xl eco-card-gold overflow-hidden">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt={name}
                      className="w-full h-52 object-cover border-b border-oro/20"
                    />
                  )}
                  <div className="p-4 space-y-2">
                    <span className="text-xs font-extrabold eco-text-green uppercase">
                      🏪 {merchant?.storeName}
                    </span>
                    <h4 className="font-brand text-2xl eco-text">{name}</h4>
                    {description.trim() && (
                      <p className="text-sm eco-text-muted">{description}</p>
                    )}
                    <div className="pt-2 border-t border-oro/20 flex items-baseline justify-between">
                      <span className="text-xs font-bold uppercase eco-text-muted">
                        Precio para tus vecinos
                      </span>
                      <span className="font-brand text-3xl eco-text-gold">
                        {formatBs(priceMotes)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    disabled={isSubmittingProduct}
                    onClick={handleConfirmPublishProduct}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl shadow-green-glow active:scale-95 transition"
                  >
                    {isSubmittingProduct
                      ? "Guardando..."
                      : "Publicar así"}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingProduct}
                    onClick={handleCorrectPrice}
                    className="w-full py-3.5 rounded-2xl eco-btn-ghost font-extrabold text-base uppercase transition"
                  >
                    Corregir precio
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal de recarga / activación con QR bancario */}
      <BankQrRechargeModal
        open={isRampOpen}
        role="merchant"
        userId={merchant?.id}
        purpose={merchant?.isProsumer ? "fiat_topup" : "merchant_premium"}
        amountBs={SUBSCRIPTION_COST}
        subtitle={
          merchant?.isProsumer
            ? "Recarga saldo en Bolivianos (Bs) escaneando el QR desde tu banco."
            : "Recarga 100 Bs con el QR de tu banco para activar tu cuenta de Caserita Aliada."
        }
        onRampCredited={(event: RampCreditedEvent) => {
          if (event.merchant) {
            setMerchant(event.merchant);
            syncConfigFields(event.merchant);
          }
          setPendingRampOrder(null);
          setCfgError(null);
          setCfgMessage(
            translateBackendMessage(event.message) ||
              "¡Recarga confirmada y sumada a tu libreta comunitaria!"
          );
          setIsRampOpen(false);
        }}
        onRampPending={(pending) => {
          setPendingRampOrder(pending);
          setCfgError(null);
          setCfgMessage(getRechargeStatusMessage(pending.state));
        }}
        onRampError={(errMsg) => {
          setCfgError(sanitizeUserError(errMsg));
        }}
        onClose={() => {
          setIsRampOpen(false);
        }}
      />
    </div>
  );
}
