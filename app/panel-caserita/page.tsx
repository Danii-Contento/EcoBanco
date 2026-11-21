"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  extractCompletedRampOrder,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import { compressImageToWebP } from "@/app/lib/imageCompressor";
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
import {
  Delivery,
  Order,
  Product,
  StorageBucket,
  User,
} from "@/app/types/ecobanco";

const SUBSCRIPTION_COST = 100;

export default function PanelCaseritaPage() {
  const router = useRouter();
  const {
    getClient: getPollarClient,
    isAuthenticated: isPollarAuthenticated,
  } = usePollar();
  const [merchant, setMerchant] = useState<User | null>(null);
  const [isRampOpen, setIsRampOpen] = useState<boolean>(false);
  const [pendingRampOrder, setPendingRampOrder] =
    useState<RampPendingEvent | null>(null);
  const [isCheckingPendingRamp, setIsCheckingPendingRamp] =
    useState<boolean>(false);
  const [pollarDraft, setPollarDraft] = useState<{
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  }>({});
  const skipAutoPollarLoginRef = useRef<boolean>(false);
  const pollarLookupKeyRef = useRef<string>("");
  const [products, setProducts] = useState<Product[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Modo de acceso: "login" o "register"
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingAuth, setIsSubmittingAuth] = useState<boolean>(false);
  const [authBusyText, setAuthBusyText] = useState<string>(
    "Guardando tu puesto..."
  );

  // Campos de Ingreso (compatible con Nombre + WhatsApp como Doña Eliana / 73540555 y con PIN de 4 números)
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginPhone, setLoginPhone] = useState<string>("");
  const [loginPin, setLoginPin] = useState<string>("");

  // Campos de Registro (Nombre + Negocio + WhatsApp + PIN de 4 números)
  const [regOwnerName, setRegOwnerName] = useState<string>("");
  const [regStoreName, setRegStoreName] = useState<string>("");
  const [regPhone, setRegPhone] = useState<string>("");
  const [regPin, setRegPin] = useState<string>("");

  // Banner no bloqueante para crear PIN de 4 dígitos si la cuenta existente aún usa su teléfono como clave
  const [quickPinInput, setQuickPinInput] = useState<string>("");
  const [dismissPinSetup, setDismissPinSetup] = useState<boolean>(false);
  const [isSavingQuickPin, setIsSavingQuickPin] = useState<boolean>(false);

  // Vista interna: "catalogo" | "billeteras" | "configuracion"
  const [activeView, setActiveView] = useState<
    "catalogo" | "billeteras" | "configuracion"
  >("catalogo");

  // Estados de Perfil y Configuración
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

  // Permite ocultar temporalmente el asistente de completar perfil si desea explorar primero
  const [dismissProfilePrompt, setDismissProfilePrompt] =
    useState<boolean>(false);

  // Modal de Alta Rápida de Producto (3 bloques grandes + Vista previa de confirmación)
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

  const loadDashboard = async () => {
    try {
      setIsLoading(true);
      const [prodRes, userRes, delRes] = await Promise.all([
        fetch("/api/products"),
        fetch("/api/users"),
        fetch("/api/deliveries"),
      ]);
      const prodData = await prodRes.json();
      const userData = await userRes.json();
      const delData = await delRes.json();

      setProducts(prodData.products || []);
      setMerchant(userData.merchant || null);
      setDeliveries(delData.deliveries || []);
      setOrders(delData.orders || []);
      if (userData.merchant) {
        syncConfigFields(userData.merchant);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const handleMerchantPollarSynced = useCallback(
    (result: PollarSyncResult) => {
      if (!result.synced) return;
      setPollarDraft({
        pollarUserId: result.pollarUserId ?? null,
        stellarAddress: result.stellarAddress ?? null,
      });
      setMerchant((prev) =>
        prev
          ? {
              ...prev,
              pollar_user_id: result.pollarUserId ?? prev.pollar_user_id,
              stellar_address: result.stellarAddress ?? prev.stellar_address,
            }
          : prev
      );
    },
    []
  );

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

  const handlePollarLoginProfile = useCallback(
    async (profile: PollarProfileSnapshot) => {
      setPollarDraft({
        pollarUserId: profile.pollarUserId ?? null,
        stellarAddress: profile.stellarAddress ?? null,
      });

      if (profile.name && !regOwnerName.trim()) {
        setRegOwnerName(profile.name);
      }

      if (merchant?.isLoggedIn || skipAutoPollarLoginRef.current) {
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
            role: "merchant",
            pollar_user_id: profile.pollarUserId,
            stellar_address: profile.stellarAddress,
            email: profile.email,
          }),
        });
        const data = await res.json();
        if (res.ok && data.matched && data.merchant) {
          setMerchant(data.merchant);
          syncConfigFields(data.merchant);
          setDismissProfilePrompt(false);
          setDismissPinSetup(false);
        }
      } catch {
        // Si no existe cuenta previa, la caserita puede abrir su puesto normalmente
      }
    },
    [merchant?.isLoggedIn, regOwnerName]
  );

  useEffect(() => {
    if (!isPollarAuthenticated) {
      skipAutoPollarLoginRef.current = false;
      pollarLookupKeyRef.current = "";
    }
  }, [isPollarAuthenticated]);

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
          data.message ||
            "¡Pago confirmado en Pollar y acreditado en tu libreta!"
        );
        return { completed: true, state: order.state };
      }
      if (res.status === 409 && data.duplicate) {
        setPendingRampOrder(null);
        await loadDashboard();
        return { completed: true, state: order.state };
      }
      setCfgError(
        translateBackendMessage(
          data.error || "No se pudo validar la orden de Pollar."
        )
      );
      return { completed: false, state: order.state };
    },
    [getPollarClient, merchant?.isProsumer]
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
            setCfgError(
              "La orden de recarga en Pollar no se completó o fue reembolsada."
            );
          }
        },
      })
      .catch(() => undefined);

    return () => controller.abort();
  }, [pendingRampOrder?.pollarOrderId, getPollarClient, confirmCompletedPendingOrder]);

  const syncConfigFields = (mer: User) => {
    setCfgStoreName(mer.storeName || "");
    setCfgPassword("");
    setCfgStoreDescription(mer.storeDescription || "");
    setCfgAddress(mer.address || "");
    setCfgSchedule(mer.schedule || "");
    setCfgAvatarUrl(mer.avatarUrl || "");
    setCfgBankQrUrl(mer.bankQrUrl || "");
  };

  // "Modo Megas": comprime a WebP (< 80 KB, máx. 1080px) en el navegador antes de subir a Supabase Storage
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
        const errMsg = translateBackendMessage(
          data.error || "No se pudo subir la foto. Intenta de nuevo."
        );
        if (bucket === "product-images") {
          setProductError(errMsg);
        } else {
          setCfgError(errMsg);
        }
        return;
      }
      await onUploaded(data.publicUrl);
    } catch {
      const fallbackErr = "No se pudo guardar la foto. Revisa tu conexión.";
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
        setCfgMessage("Tu QR bancario quedó guardado y listo para recibir cobros.");
      }
    });
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
    setAuthBusyText("Activando tu libreta digital...");

    try {
      // 1. Si ingresó PIN de 4 números, intenta primero con el PIN
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

        if (pinRes.ok) {
          setMerchant(pinData.merchant);
          syncConfigFields(pinData.merchant);
          setDismissProfilePrompt(false);
          setDismissPinSetup(false);
          setLoginIdentifier("");
          setLoginPhone("");
          setLoginPin("");
          void syncMerchantPollarInBackground(pinData.merchant);
          return;
        }

        // Si el PIN no coincidió pero ingresó WhatsApp (ej. cuenta existente Doña Eliana / 73540555 sin PIN aún),
        // ingresa con WhatsApp y guarda automáticamente su nuevo PIN de 4 números sin bloquear el acceso.
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
          if (phoneRes.ok) {
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
            setMerchant(finalMerchant);
            syncConfigFields(finalMerchant);
            setDismissProfilePrompt(false);
            setDismissPinSetup(true);
            setCfgMessage(
              "¡Bienvenida! Guardamos tu clave secreta de 4 números para tus próximos ingresos."
            );
            setLoginIdentifier("");
            setLoginPhone("");
            setLoginPin("");
            void syncMerchantPollarInBackground(finalMerchant);
            return;
          }
          setAuthError(
            translateBackendMessage(
              phoneData.error ||
                "Revisa tu nombre de puesto, WhatsApp o clave de 4 números."
            )
          );
          return;
        }

        setAuthError(
          translateBackendMessage(
            pinData.error ||
              "Clave incorrecta. Si aún no creaste tu PIN de 4 números, ingresa también tu WhatsApp."
          )
        );
        return;
      }

      // 2. Ingreso directo con Nombre + WhatsApp (compatible con cuentas existentes como Doña Eliana / 73540555)
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

      if (!res.ok) {
        setAuthError(
          translateBackendMessage(
            data.error ||
              "No pudimos abrir tu puesto. Revisa tu nombre y WhatsApp."
          )
        );
        return;
      }

      setMerchant(data.merchant);
      syncConfigFields(data.merchant);
      setDismissProfilePrompt(false);
      setDismissPinSetup(false);
      setLoginIdentifier("");
      setLoginPhone("");
      setLoginPin("");
      void syncMerchantPollarInBackground(data.merchant);
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
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_register",
          ownerName: regOwnerName,
          storeName: regStoreName,
          phone: regPhone,
          pollar_user_id: pollarDraft.pollarUserId || undefined,
          stellar_address: pollarDraft.stellarAddress || undefined,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAuthError(
          translateBackendMessage(
            data.error || "No se pudo abrir tu puesto digital."
          )
        );
        return;
      }

      let createdMerchant: User = data.merchant;
      // Guarda inmediatamente el PIN de 4 dígitos elegido por la caserita
      const pinRes = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          password: cleanPin,
        }),
      });
      if (pinRes.ok) {
        const pinData = await pinRes.json();
        if (pinData.merchant) {
          createdMerchant = pinData.merchant;
        }
      }

      setMerchant(createdMerchant);
      syncConfigFields(createdMerchant);
      setDismissProfilePrompt(false);
      setDismissPinSetup(true);
      setRegOwnerName("");
      setRegStoreName("");
      setRegPhone("");
      setRegPin("");
      void syncMerchantPollarInBackground(createdMerchant);
    } finally {
      setIsSubmittingAuth(false);
    }
  };

  const handleSaveQuickPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPin = quickPinInput.replace(/\D/g, "").slice(0, 4);
    if (cleanPin.length !== 4) {
      setCfgError("Escribe exactamente 4 números para tu clave secreta.");
      return;
    }
    try {
      setIsSavingQuickPin(true);
      setCfgError(null);
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          password: cleanPin,
        }),
      });
      const data = await res.json();
      if (res.ok && data.merchant) {
        setMerchant(data.merchant);
        syncConfigFields(data.merchant);
        setQuickPinInput("");
        setDismissPinSetup(true);
        setCfgMessage(
          "¡Clave secreta de 4 números guardada! Ya puedes ingresar con tu PIN."
        );
      }
    } finally {
      setIsSavingQuickPin(false);
    }
  };

  const handleMerchantLogout = async () => {
    skipAutoPollarLoginRef.current = true;
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "merchant_logout" }),
    });
    const data = await res.json();
    setMerchant(data.merchant);
    setPendingRampOrder(null);
    setActiveView("catalogo");
  };

  const handleCompleteOnboardingProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setCfgError(null);
    setCfgMessage(null);

    if (
      !cfgStoreDescription.trim() ||
      !cfgAddress.trim() ||
      !cfgSchedule.trim() ||
      !cfgAvatarUrl
    ) {
      setCfgError(
        "Por favor completa la descripción de tu puesto, dirección, horario y sube tu foto."
      );
      return;
    }

    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "merchant_update_settings",
          storeDescription: cfgStoreDescription,
          address: cfgAddress,
          schedule: cfgSchedule,
          avatarUrl: cfgAvatarUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMerchant(data.merchant);
        if (data.products) setProducts(data.products);
        setDismissProfilePrompt(true);
        setCfgMessage("¡Tu puesto digital está listo para recibir pedidos!");
      }
    } finally {
      setIsSavingConfig(false);
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
          password: cfgPassword,
          storeDescription: cfgStoreDescription,
          address: cfgAddress,
          schedule: cfgSchedule,
          avatarUrl: cfgAvatarUrl,
          bankQrUrl: cfgBankQrUrl,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMerchant(data.merchant);
        if (data.products) setProducts(data.products);
        setCfgMessage("Cambios guardados correctamente.");
      }
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
      const msg = translateBackendMessage(
        data.error || "No se pudo activar Caserita Aliada."
      );
      setCfgError(msg);
      return;
    }

    setMerchant(data.merchant);
    syncConfigFields(data.merchant);
    setCfgMessage(
      paymentMethod === "motes"
        ? "¡Ya eres Caserita Aliada con tus 100 MOTES! Tu cobro directo a QR bancario y 5 envíos ecológicos gratis ya están activos."
        : "¡Caserita Aliada activada con 100 Bs! Conservas todos tus MOTES y ya tienes activos tu cobro directo a QR bancario y 5 envíos ecológicos gratis."
    );
  };

  const handleCheckPendingRamp = async () => {
    if (!pendingRampOrder?.pollarOrderId) return;
    try {
      setIsCheckingPendingRamp(true);
      const outcome = await confirmCompletedPendingOrder(
        pendingRampOrder.pollarOrderId
      );
      if (!outcome.completed) {
        setCfgMessage(
          `Orden Pollar ${pendingRampOrder.pollarOrderId} en estado "${outcome.state}". Apenas se confirme tu transferencia QR se acreditará automáticamente.`
        );
      }
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
          setProductError(
            translateBackendMessage(
              data.error || "No se pudo actualizar el producto."
            )
          );
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
          setProductError(
            translateBackendMessage(
              data.error || "No se pudo publicar el producto."
            )
          );
          setProductStep("edit");
          return;
        }
        setProducts(data.products);
      }
      setIsModalOpen(false);
      setCfgMessage(
        editingProduct
          ? "Producto actualizado en tu puesto digital."
          : "¡Producto publicado! Ya está visible para tus vecinos."
      );
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

  const handleBuyInNeighborhood = async () => {
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "set_buyer_type",
        buyerType: "merchant",
      }),
    });
    router.push("/marketplace");
  };

  const myProducts = products.filter(
    (p) =>
      p.sellerId === merchant?.id ||
      p.sellerName.toLowerCase() === merchant?.storeName?.toLowerCase()
  );

  const myDeliveries = deliveries.filter(
    (d) =>
      d.seller_id === merchant?.id ||
      (d.seller_name || "").toLowerCase() ===
        (merchant?.storeName || "").toLowerCase()
  );

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const protectedPendingBs = orders
    .filter(
      (o) =>
        (o.seller_id === merchant?.id ||
          o.seller_name.toLowerCase() ===
            (merchant?.storeName || "").toLowerCase()) &&
        o.status !== "RELEASED"
    )
    .reduce((acc, o) => acc + Number(o.amount_motes || 0), 0);

  const isProfileIncomplete =
    !merchant?.profileCompleted &&
    (!merchant?.storeDescription?.trim() ||
      !merchant?.address?.trim() ||
      !merchant?.schedule?.trim() ||
      !merchant?.avatarUrl);

  const needsFourDigitPin = Boolean(
    merchant?.isLoggedIn &&
      !dismissPinSetup &&
      !merchant.hasFourDigitPin
  );

  const currentMotes = Math.round(merchant?.motes ?? 0);
  const canUnlockWithMotes = currentMotes >= SUBSCRIPTION_COST;
  const motesProgressPct = Math.min(
    100,
    Math.round((currentMotes / SUBSCRIPTION_COST) * 100)
  );
  const motesRemaining = Math.max(0, SUBSCRIPTION_COST - currentMotes);

  // PANTALLA DE INGRESO / REGISTRO DE CASERITAS CON PIN DE 4 NÚMEROS
  if (!isLoading && !merchant?.isLoggedIn) {
    return (
      <div className="min-h-screen bg-bosque text-arena font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto space-y-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena"
          >
            ← Inicio
          </Link>

          <div className="rounded-2xl bg-gradient-to-b from-[#1B2C26] to-[#121D19] border-2 border-oro/60 p-6 sm:p-8 shadow-gold-glow space-y-6">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-oro via-brillo to-madera p-0.5 flex items-center justify-center shadow-md">
                <div className="w-full h-full rounded-2xl bg-bosque flex items-center justify-center text-3xl">
                  🏪
                </div>
              </div>
              <h1 className="font-brand text-2xl sm:text-3xl text-arena">
                Puesto de la Caserita
              </h1>
              <p className="text-sm text-arena/90">
                Abre tu puesto digital gratis y recibe pedidos por WhatsApp.
              </p>
              <span className="inline-block px-3 py-1 rounded-full bg-brote/20 border border-brote/60 text-xs font-extrabold text-arena">
                Comisión: 0 Bs — Cubierta por EcoBanco
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-bosque border border-arena/20">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("login");
                  setAuthError(null);
                }}
                className={`py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition ${
                  authTab === "login"
                    ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow"
                    : "text-arena/85 hover:text-brillo"
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
                className={`py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition ${
                  authTab === "register"
                    ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow"
                    : "text-arena/85 hover:text-brillo"
                }`}
              >
                Abrir Puesto
              </button>
            </div>

            {authError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100 text-center">
                ⚠️ {authError}
              </div>
            )}

            {authTab === "login" ? (
              <form onSubmit={handleMerchantLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    Tu Nombre o Nombre de tu Puesto *
                  </label>
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Ej. Doña Eliana"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    Número de WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={loginPhone}
                    onChange={(e) => setLoginPhone(e.target.value)}
                    placeholder="Ej. 73540555"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-brillo mb-1">
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
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-oro/50 font-mono text-2xl font-bold tracking-[0.4em] text-center text-brillo focus:outline-none focus:border-brillo"
                  />
                  <p className="text-xs text-arena/85 mt-1.5 leading-snug">
                    🔐 Crea tu clave secreta de 4 números (como la del cajero).
                    Si entras por primera vez con tu WhatsApp, déjalo vacío o
                    escribe tu nuevo PIN ahora.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition"
                >
                  {isSubmittingAuth ? authBusyText : "Entrar a mi Puesto"}
                </button>
              </form>
            ) : (
              <form onSubmit={handleMerchantRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    1. Tu Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={regOwnerName}
                    onChange={(e) => setRegOwnerName(e.target.value)}
                    placeholder="Ej. Juana Mamani"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brote"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    2. Nombre de tu Puesto o Negocio *
                  </label>
                  <input
                    type="text"
                    required
                    value={regStoreName}
                    onChange={(e) => setRegStoreName(e.target.value)}
                    placeholder="Ej. Salteñas Doña Juana"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brote"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    3. Número de WhatsApp *
                  </label>
                  <input
                    type="tel"
                    required
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder="Ej. 73540555"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brote"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-brillo mb-1">
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
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/60 font-mono text-2xl font-bold tracking-[0.4em] text-center text-brillo focus:outline-none focus:border-brillo"
                  />
                  <p className="text-xs text-brillo font-semibold mt-1.5">
                    🔐 Crea tu clave secreta de 4 números (como la del cajero)
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingAuth}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-lg sm:text-xl shadow-green-glow active:scale-95 transition"
                >
                  {isSubmittingAuth
                    ? authBusyText
                    : "Abrir mi Puesto Gratis"}
                </button>
              </form>
            )}

            <PollarWalletSection
              role="merchant"
              mode="auth-entry"
              onSynced={handleMerchantPollarSynced}
              onPollarProfileLoaded={handlePollarLoginProfile}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bosque text-arena font-sans pb-16">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-6">
        {/* Barra superior de acciones */}
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena"
          >
            ← Inicio
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setCfgMessage(null);
                setCfgError(null);
                setActiveView(
                  activeView === "configuracion" ? "catalogo" : "configuracion"
                );
              }}
              className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-extrabold border-2 transition ${
                activeView === "configuracion"
                  ? "bg-oro text-bosque border-oro"
                  : "bg-[#1A2923] text-brillo border-oro/50"
              }`}
            >
              ⚙️{" "}
              {activeView === "configuracion"
                ? "Volver al Puesto"
                : "Ajustes"}
            </button>

            <button
              type="button"
              onClick={handleMerchantLogout}
              className="px-3.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/50 text-red-200 text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Cabecera del Puesto (100% libre de etiquetas de Stellar o Pollar) */}
        <header className="rounded-2xl bg-gradient-to-b from-[#1B2C26] to-[#121D19] border-2 border-oro/40 p-4 sm:p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <label className="relative cursor-pointer group shrink-0">
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
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border-2 border-oro shadow-gold-glow"
                  />
                ) : (
                  <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-bosque border-2 border-dashed border-oro/70 flex flex-col items-center justify-center text-center p-1">
                    <span className="text-xl">📷</span>
                    <span className="text-[10px] font-bold text-brillo leading-tight">
                      Subir foto
                    </span>
                  </div>
                )}
                <span className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-oro text-bosque text-xs font-extrabold flex items-center justify-center shadow">
                  ✎
                </span>
              </label>

              <div className="space-y-1 flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-oro/25 border border-oro/60 text-brillo text-xs font-extrabold uppercase">
                    {merchant?.isProsumer
                      ? "⭐ Caserita Aliada"
                      : "🌱 Puesto Gratuito"}
                  </span>
                  {merchant?.phone && (
                    <span className="px-2.5 py-0.5 rounded-full bg-brote/25 border border-brote/60 text-arena text-xs font-bold">
                      📱 {merchant.phone}
                    </span>
                  )}
                </div>
                <h1 className="font-brand text-2xl sm:text-3xl text-arena truncate">
                  {merchant?.storeName}
                </h1>
                <p className="text-xs sm:text-sm text-arena/85 truncate">
                  Propietaria: {merchant?.name}
                </p>
              </div>
            </div>

            {/* Accesos rápidos: Mi Libreta y Comprar en el Barrio */}
            <div className="flex flex-row sm:flex-col gap-2 shrink-0 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => {
                  setCfgMessage(null);
                  setCfgError(null);
                  setActiveView(
                    activeView === "billeteras" ? "catalogo" : "billeteras"
                  );
                }}
                className={`flex-1 sm:flex-initial px-4 py-3 rounded-xl text-sm font-extrabold border-2 transition flex items-center justify-between gap-2 ${
                  activeView === "billeteras"
                    ? "bg-brote text-bosque border-brote shadow-green-glow"
                    : "bg-[#15241E] text-brillo border-brote/70 hover:border-brillo"
                }`}
              >
                <span>📒 Mi Libreta</span>
                <span
                  className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                    activeView === "billeteras"
                      ? "bg-bosque text-brillo"
                      : "bg-bosque text-brote"
                  }`}
                >
                  {formatMotes(currentMotes)}
                </span>
              </button>

              <button
                type="button"
                onClick={handleBuyInNeighborhood}
                className="flex-1 sm:flex-initial px-4 py-3 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque text-sm font-extrabold uppercase tracking-wide shadow hover:brightness-105 transition flex items-center justify-center gap-1.5"
              >
                <span>🛒 Comprar en el Barrio</span>
              </button>
            </div>
          </div>

          {(merchant?.storeDescription ||
            merchant?.address ||
            merchant?.schedule) && (
            <div className="pt-3 border-t border-arena/15 space-y-1.5 text-xs sm:text-sm">
              {merchant?.storeDescription && (
                <p className="text-arena/95 italic">
                  &ldquo;{merchant.storeDescription}&rdquo;
                </p>
              )}
              <div className="flex flex-wrap gap-3 text-xs text-arena/85 pt-0.5">
                {merchant?.address && (
                  <span>📍 Dirección: {merchant.address}</span>
                )}
                {merchant?.schedule && (
                  <span>🕒 Horario: {merchant.schedule}</span>
                )}
              </div>
            </div>
          )}

          {merchant?.isLoggedIn && (
            <PollarWalletSection
              role="merchant"
              userId={merchant.id}
              savedStellarAddress={merchant.stellar_address}
              savedPollarUserId={merchant.pollar_user_id}
              mode="profile-badge"
              onSynced={handleMerchantPollarSynced}
            />
          )}

          {pendingRampOrder && (
            <div className="rounded-xl bg-oro/15 border border-oro/60 p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-bold text-brillo">
                ⏳ Orden Pollar {pendingRampOrder.pollarOrderId} en curso (
                {pendingRampOrder.state})
              </span>
              <button
                type="button"
                disabled={isCheckingPendingRamp}
                onClick={handleCheckPendingRamp}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold uppercase disabled:opacity-60"
              >
                {isCheckingPendingRamp
                  ? "Verificando..."
                  : "🔄 Verificar pago Pollar"}
              </button>
            </div>
          )}
        </header>

        {/* Banner opcional (NO bloqueante) para crear PIN de 4 números si la cuenta existente aún no lo tiene */}
        {needsFourDigitPin && (
          <section className="rounded-2xl bg-[#1D2E25] border-2 border-brillo p-4 sm:p-5 space-y-3 shadow-gold-glow">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="text-xs font-extrabold uppercase text-brillo block">
                  🔐 Acceso rápido con PIN
                </span>
                <h2 className="font-brand text-lg sm:text-xl text-arena">
                  Crea tu clave secreta de 4 números (como la del cajero)
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setDismissPinSetup(true)}
                className="text-xs font-bold text-arena/80 hover:text-brillo shrink-0"
              >
                Más tarde
              </button>
            </div>
            <form
              onSubmit={handleSaveQuickPin}
              className="flex flex-col sm:flex-row gap-2.5"
            >
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={quickPinInput}
                onChange={(e) =>
                  setQuickPinInput(e.target.value.replace(/\D/g, "").slice(0, 4))
                }
                placeholder="4 números"
                className="sm:w-44 px-4 py-3 rounded-xl bg-bosque border-2 border-oro font-mono text-2xl font-bold tracking-[0.35em] text-center text-brillo focus:outline-none focus:border-brillo"
              />
              <button
                type="submit"
                disabled={isSavingQuickPin}
                className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-brand text-base shadow"
              >
                {isSavingQuickPin ? "Guardando clave..." : "Guardar mi PIN"}
              </button>
            </form>
          </section>
        )}

        {/* Meta de Desbloqueo hacia 100 MOTES (siempre clara y motivadora si aún no es Caserita Aliada) */}
        {!merchant?.isProsumer && (
          <section
            aria-label="Meta hacia Caserita Aliada"
            className="rounded-2xl bg-gradient-to-r from-[#1A3124] via-[#1E2B1E] to-[#1A2923] border-2 border-brote/70 p-4 sm:p-5 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-brillo">
                🌟 Tu camino a Caserita Aliada
              </span>
              <span className="font-brand text-lg text-brillo">
                {currentMotes} / {SUBSCRIPTION_COST} MOTES
              </span>
            </div>

            <div className="w-full h-3.5 rounded-full bg-bosque overflow-hidden border border-arena/25">
              <div
                className="h-full bg-gradient-to-r from-brote via-oro to-brillo transition-all duration-500"
                style={{ width: `${motesProgressPct}%` }}
              />
            </div>

            <p className="text-sm font-semibold text-arena leading-snug">
              Llevas <strong className="text-brillo">{currentMotes}</strong> de{" "}
              <strong className="text-brillo">100 MOTES</strong> en ventas. Al
              llegar a 100, desbloqueas gratis:{" "}
              <strong className="text-brote">
                Cobro directo a tu QR bancario + 5 envíos ecológicos
              </strong>
              .
            </p>
          </section>
        )}

        {/* ASISTENTE PARA COMPLETAR PERFIL TRAS CREAR CUENTA */}
        {isProfileIncomplete && !dismissProfilePrompt && (
          <section className="rounded-2xl bg-gradient-to-b from-[#1E3329] to-[#121F1A] border-2 border-brillo p-5 sm:p-6 space-y-4 shadow-gold-glow">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="px-2.5 py-0.5 rounded-full bg-brillo/20 border border-brillo/60 text-brillo text-xs font-extrabold uppercase">
                  ✨ Paso siguiente recomendado
                </span>
                <h2 className="font-brand text-xl sm:text-2xl text-arena">
                  Completa los datos de tu puesto
                </h2>
                <p className="text-sm text-arena/90">
                  Así tus vecinos te reconocen fácil y saben dónde recoger o
                  pedirte:
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDismissProfilePrompt(true)}
                className="text-xs font-bold text-arena/80 hover:text-brillo shrink-0"
              >
                Más tarde
              </button>
            </div>

            {cfgError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
                {cfgError}
              </div>
            )}

            <form
              onSubmit={handleCompleteOnboardingProfile}
              className="space-y-4"
            >
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase text-brillo">
                  1. Foto de tu Puesto o tuya
                </label>
                <div className="flex items-center gap-3.5">
                  {cfgAvatarUrl ? (
                    <img
                      src={cfgAvatarUrl}
                      alt="Foto de perfil"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-oro"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-bosque border-2 border-dashed border-oro/60 flex items-center justify-center text-2xl">
                      📷
                    </div>
                  )}
                  <label className="px-4 py-3 rounded-xl bg-oro/25 hover:bg-oro hover:text-bosque text-brillo border-2 border-oro text-xs sm:text-sm font-extrabold cursor-pointer transition">
                    {uploadingBucket === "avatars"
                      ? "Guardando foto..."
                      : cfgAvatarUrl
                      ? "Cambiar Foto"
                      : "Subir Foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadToBucket("avatars", file, setCfgAvatarUrl);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-brillo mb-1">
                  2. ¿Qué vendes en tu puesto?
                </label>
                <textarea
                  rows={2}
                  required
                  value={cfgStoreDescription}
                  onChange={(e) => setCfgStoreDescription(e.target.value)}
                  placeholder="Ej. Sopitas caseras, pan recién horneado, verduras frescas..."
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-brillo mb-1">
                  3. Dirección o Zona de tu Puesto
                </label>
                <input
                  type="text"
                  required
                  value={cfgAddress}
                  onChange={(e) => setCfgAddress(e.target.value)}
                  placeholder="Ej. Feria 16 de Julio, Calle 3 / Achocalla plaza"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-brillo mb-1">
                  4. Horario de Atención
                </label>
                <input
                  type="text"
                  required
                  value={cfgSchedule}
                  onChange={(e) => setCfgSchedule(e.target.value)}
                  placeholder="Ej. Lunes a sábado de 8:00 a 18:00"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <button
                type="submit"
                disabled={isSavingConfig || uploadingBucket === "avatars"}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-lg shadow-green-glow"
              >
                {isSavingConfig
                  ? "Guardando tu puesto..."
                  : "✅ Guardar datos de mi puesto"}
              </button>
            </form>
          </section>
        )}

        {/* APARTADO DE CONFIGURACIÓN */}
        {activeView === "configuracion" ? (
          <section className="rounded-2xl bg-gradient-to-b from-[#192822] to-[#111C18] border-2 border-oro/50 p-5 sm:p-6 space-y-6 shadow-xl">
            <div className="border-b border-arena/15 pb-3">
              <h2 className="font-brand text-2xl text-arena">
                ⚙️ Ajustes de tu Puesto
              </h2>
              <p className="text-sm text-arena/85">
                Actualiza los datos de tu negocio, tu PIN de 4 números y tu
                estado de Caserita Aliada.
              </p>
            </div>

            {cfgMessage && (
              <div className="p-3.5 rounded-xl bg-brote/25 border border-brote text-sm font-bold text-arena">
                ✅ {cfgMessage}
              </div>
            )}

            {cfgError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
                {cfgError}
              </div>
            )}

            <form onSubmit={handleSaveConfig} className="space-y-5">
              {/* 1. Foto de Perfil */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-arena">
                  Foto de tu Puesto
                </label>
                <div className="flex items-center gap-4">
                  {cfgAvatarUrl ? (
                    <img
                      src={cfgAvatarUrl}
                      alt="Vista previa perfil"
                      className="w-16 h-16 rounded-2xl object-cover border-2 border-oro"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-bosque border border-arena/25 flex items-center justify-center text-2xl">
                      🏪
                    </div>
                  )}
                  <label className="px-4 py-3 rounded-xl bg-oro/25 hover:bg-oro hover:text-bosque text-brillo border-2 border-oro text-xs sm:text-sm font-extrabold cursor-pointer transition">
                    {uploadingBucket === "avatars"
                      ? "Optimizando foto..."
                      : "📷 Cambiar Foto"}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadToBucket("avatars", file, setCfgAvatarUrl);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {/* 2. Nombre de Negocio */}
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Nombre de tu Puesto
                </label>
                <input
                  type="text"
                  required
                  value={cfgStoreName}
                  onChange={(e) => setCfgStoreName(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base"
                />
              </div>

              {/* 3. Clave secreta PIN de 4 números */}
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Clave secreta de 4 números (PIN)
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={cfgPassword}
                  onChange={(e) =>
                    setCfgPassword(e.target.value.replace(/\D/g, ""))
                  }
                  placeholder="Ej. 1234"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-brillo font-mono font-bold text-lg tracking-widest"
                />
                <p className="text-xs text-arena/80 mt-1">
                  Crea tu clave secreta de 4 números (como la del cajero).
                </p>
              </div>

              {/* 4. Descripción de Negocio */}
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Descripción de tu Puesto
                </label>
                <textarea
                  rows={2}
                  value={cfgStoreDescription}
                  onChange={(e) => setCfgStoreDescription(e.target.value)}
                  placeholder="Describe los productos o servicios de tu puesto"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base"
                />
              </div>

              {/* 5. Dirección de Comercio */}
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Dirección o Zona de tu Puesto
                </label>
                <input
                  type="text"
                  value={cfgAddress}
                  onChange={(e) => setCfgAddress(e.target.value)}
                  placeholder="Zona, feria o calle de tu puesto"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base"
                />
              </div>

              {/* 6. Horario de Funcionamiento */}
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  Horario de Atención
                </label>
                <input
                  type="text"
                  value={cfgSchedule}
                  onChange={(e) => setCfgSchedule(e.target.value)}
                  placeholder="Días y horarios de atención"
                  className="w-full px-4 py-3 rounded-xl bg-bosque border-2 border-oro/40 text-arena text-base"
                />
              </div>

              {/* 7. Caserita Aliada y QR Bancario */}
              <div className="pt-4 border-t border-arena/20 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-extrabold uppercase tracking-wider text-brillo block">
                      🌟 Caserita Aliada (100 MOTES o 100 Bs)
                    </span>
                    <h3 className="font-brand text-xl text-arena">
                      Cobro directo a tu QR bancario + 5 envíos ecológicos
                    </h3>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-extrabold uppercase shrink-0 ${
                      merchant?.isProsumer
                        ? "bg-brote text-bosque"
                        : "bg-madera text-brillo border border-oro/50"
                    }`}
                  >
                    {merchant?.isProsumer ? "Activa" : "🔒 Puesto Gratuito"}
                  </span>
                </div>

                {!merchant?.isProsumer ? (
                  <div className="rounded-2xl bg-bosque border border-oro/50 p-4 space-y-4">
                    <p className="text-sm text-arena/90 leading-relaxed">
                      Llevas{" "}
                      <strong className="text-brillo">{currentMotes}</strong> de{" "}
                      <strong className="text-brillo">100 MOTES</strong> en
                      ventas. Al llegar a 100, desbloqueas gratis:{" "}
                      <strong>
                        Cobro directo a tu QR bancario + 5 envíos ecológicos
                      </strong>
                      , o puedes activarlo hoy mismo cargando 100 Bs y conservar
                      todos tus MOTES.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <button
                        type="button"
                        disabled={!canUnlockWithMotes}
                        onClick={() => handleUnlockAliada("motes")}
                        className={`py-3.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide transition ${
                          canUnlockWithMotes
                            ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow-green-glow"
                            : "bg-arena/10 text-arena/65 border border-arena/20 cursor-not-allowed"
                        }`}
                      >
                        {canUnlockWithMotes
                          ? "🌱 Activar con 100 MOTES"
                          : `🌱 Con MOTES (Faltan ${motesRemaining})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnlockAliada("fiat")}
                        className="py-3.5 px-3 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-extrabold text-xs sm:text-sm uppercase tracking-wide shadow-gold-glow"
                      >
                        {Number(merchant?.fiatBs ?? 0) >= SUBSCRIPTION_COST
                          ? "✅ Activar con mi saldo (100 Bs)"
                          : "📲 Pagar 100 Bs con QR Pollar"}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsRampOpen(true)}
                      className="w-full py-3.5 px-4 rounded-xl bg-[#182B24] hover:bg-oro/25 border-2 border-oro/60 text-brillo font-extrabold text-sm uppercase tracking-wide transition"
                    >
                      📲 Cargar 100 Bs con QR de tu Banco (BOB → USDC)
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4 rounded-2xl bg-bosque/75 border-2 border-brote/60 p-4">
                    <div className="space-y-2.5">
                      <label className="block text-xs font-bold uppercase text-brote">
                        Tu Código QR Bancario (Para recibir pagos en Bolivianos Bs)
                      </label>
                      <div className="flex items-center gap-3.5">
                        {cfgBankQrUrl && (
                          <img
                            src={cfgBankQrUrl}
                            alt="QR Bancario"
                            className="w-20 h-20 rounded-xl object-cover border-2 border-oro"
                          />
                        )}
                        <label className="px-4 py-3 rounded-xl bg-brote/25 text-arena border-2 border-brote text-xs sm:text-sm font-extrabold cursor-pointer">
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
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={isSavingConfig || uploadingBucket !== null}
                className="w-full py-4 rounded-2xl bg-brote text-bosque font-brand text-xl shadow-green-glow"
              >
                {isSavingConfig ? "Guardando tu puesto..." : "Guardar Ajustes"}
              </button>
            </form>
          </section>
        ) : activeView === "billeteras" ? (
          /* VISTA DE LIBRETA DIGITAL, SALDOS Y PEDIDOS ENTRANTES */
          <>
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-brand text-xl sm:text-2xl text-arena">
                📒 Mi Libreta y Pedidos
              </h2>
              <button
                type="button"
                onClick={() => {
                  setCfgMessage(null);
                  setCfgError(null);
                  setActiveView("catalogo");
                }}
                className="px-3.5 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-xs sm:text-sm font-extrabold text-brillo hover:border-brillo transition shrink-0"
              >
                ← Mis Productos
              </button>
            </div>

            {cfgMessage && (
              <div className="p-3.5 rounded-2xl bg-brote/25 border border-brote text-sm font-bold text-arena">
                ✅ {cfgMessage}
              </div>
            )}

            {cfgError && (
              <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
                {cfgError}
              </div>
            )}

            {/* Tarjetas de Puntos de Trueque (MOTES) y Saldo en Bolivianos (Bs) */}
            <section aria-label="Saldos de la Caserita" className="space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Puntos de Trueque (MOTES) */}
                <div className="rounded-2xl bg-gradient-to-br from-[#1B3326] via-[#172820] to-[#2B2313] border-2 border-brote p-5 shadow-wallet-inner wallet-inset flex flex-col justify-between space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-brillo">
                      Puntos de Trueque (MOTES)
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full bg-brote text-bosque text-[10px] font-extrabold uppercase">
                      ✅ Activo
                    </span>
                  </div>
                  <div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-brand text-4xl text-brillo">
                        {currentMotes}
                      </span>
                      <span className="text-sm font-extrabold text-brote uppercase">
                        MOTES
                      </span>
                    </div>
                    <p className="text-xs font-bold text-arena mt-1">
                      1 MOTE = 1 Bs en productos del barrio
                    </p>
                    <p className="text-xs text-arena/85 mt-1">
                      {merchant?.salesCount ?? 0} ventas completadas · Comisión:
                      0 Bs — Cubierta por EcoBanco
                    </p>
                    {protectedPendingBs > 0 && (
                      <p className="text-xs font-bold text-brillo mt-1.5">
                        🛡️ {formatBs(protectedPendingBs)} en Compra Protegida
                        (pasan a tu libreta al entregar el pedido)
                      </p>
                    )}
                  </div>
                </div>

                {/* Saldo en Bolivianos (Bs) / Activación Caserita Aliada */}
                {!merchant?.isProsumer ? (
                  <div className="rounded-2xl bg-[#131F1B] border-2 border-oro/50 p-5 shadow-wallet-inner flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-arena">
                        Saldo en Bolivianos (Bs)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-madera text-brillo text-[10px] font-extrabold uppercase">
                        🔒 Caserita Aliada
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-arena/90 leading-relaxed">
                      Al llegar a <strong>100 MOTES</strong> desbloqueas gratis
                      tu <strong>cobro directo a tu QR bancario</strong> y{" "}
                      <strong>5 envíos ecológicos</strong>, o puedes cargarlo
                      hoy con 100 Bs y conservar tus MOTES.
                    </p>
                    <div className="space-y-2">
                      <button
                        type="button"
                        disabled={!canUnlockWithMotes}
                        onClick={() => handleUnlockAliada("motes")}
                        className={`w-full py-3 px-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition ${
                          canUnlockWithMotes
                            ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow-green-glow"
                            : "bg-arena/10 text-arena/65 border border-arena/20 cursor-not-allowed"
                        }`}
                      >
                        {canUnlockWithMotes
                          ? "🌱 Activar con 100 MOTES"
                          : `🌱 Usar 100 MOTES (Te faltan ${motesRemaining})`}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleUnlockAliada("fiat")}
                        className="w-full py-3 px-3 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold text-xs uppercase tracking-wider shadow"
                      >
                        {Number(merchant?.fiatBs ?? 0) >= SUBSCRIPTION_COST
                          ? "✅ Activar con mi saldo (100 Bs)"
                          : "📲 Desbloquear Premium (100 Bs QR)"}
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsRampOpen(true)}
                        className="w-full py-3 px-3 rounded-xl bg-[#182B24] hover:bg-oro/25 border-2 border-oro/60 text-brillo font-extrabold text-xs uppercase tracking-wider transition"
                      >
                        📲 Cargar saldo con QR de tu Banco
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl bg-gradient-to-b from-[#1A2A25] to-[#101A17] border-2 border-oro/70 p-5 shadow-wallet-inner wallet-inset flex flex-col justify-between space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider text-arena">
                        Dinero Disponible (Bs)
                      </span>
                      <span className="px-2.5 py-0.5 rounded-full bg-oro text-bosque text-[10px] font-extrabold uppercase">
                        ✅ Caserita Aliada
                      </span>
                    </div>
                    <div>
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-brand text-4xl text-brillo">
                          {Math.round(merchant?.fiatBs ?? 0)}
                        </span>
                        <span className="text-lg font-extrabold text-oro">
                          Bs
                        </span>
                      </div>
                      <p className="text-xs text-brote font-bold mt-1">
                        🚲{" "}
                        {merchant?.free_deliveries_remaining ??
                          merchant?.freeDeliveries ??
                          0}{" "}
                        envíos ecológicos gratis disponibles
                      </p>
                      <p className="text-xs text-arena/85 mt-1">
                        {merchant?.bankQrUrl
                          ? "✅ Tu QR bancario está listo para recibir cobros"
                          : "📲 Sube tu QR bancario en ⚙️ Ajustes"}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsRampOpen(true)}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold text-xs uppercase tracking-wider shadow"
                    >
                      📲 Cargar saldo con QR de tu Banco
                    </button>
                  </div>
                )}
              </div>
            </section>

            {/* Sección: Pedidos Entrantes con Compra Protegida y PIN gigante */}
            <section
              aria-label="Pedidos Entrantes"
              className="rounded-2xl bg-[#14221D] border-2 border-oro/40 p-5 space-y-4"
            >
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="font-brand text-xl text-arena">
                    🚲 Pedidos para Entregar ({myDeliveries.length})
                  </h2>
                  <p className="text-xs sm:text-sm text-arena/85">
                    Confirma el código de 4 números con el repartidor cuando
                    recoja el pedido en tu puesto.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={loadDashboard}
                  className="px-3.5 py-2 rounded-xl bg-[#182822] border border-arena/25 text-xs font-bold text-arena hover:text-brillo shrink-0"
                >
                  🔄 Actualizar
                </button>
              </div>

              {myDeliveries.length === 0 ? (
                <p className="text-sm text-arena/80">
                  Aún no tienes pedidos pendientes para despacho.
                </p>
              ) : (
                <div className="space-y-4">
                  {myDeliveries.map((del) => {
                    const order = orderById.get(del.order_id);
                    const statusLower = (del.delivery_status || "").toLowerCase();
                    const isReleased = order?.status === "RELEASED";
                    const orderAmount = Math.round(
                      Number(del.amount_motes ?? order?.amount_motes ?? 0)
                    );

                    return (
                      <article
                        key={del.id}
                        className="rounded-2xl bg-bosque border-2 border-arena/20 p-4 space-y-3.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-extrabold text-brillo">
                                {formatOrderCode(
                                  del.contract_id || order?.contract_id
                                )}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase border ${
                                  statusLower === "delivered"
                                    ? "bg-brote/25 border-brote text-arena"
                                    : statusLower === "in_transit"
                                    ? "bg-oro/25 border-oro text-brillo"
                                    : "bg-arena/15 border-arena/35 text-arena"
                                }`}
                              >
                                {statusLower === "delivered"
                                  ? "✅ Entregado"
                                  : statusLower === "in_transit"
                                  ? "🚲 En Camino"
                                  : "🍳 Preparando Pedido"}
                              </span>
                            </div>
                            <h3 className="font-brand text-lg text-arena">
                              {del.product_name}
                            </h3>
                            <p className="text-xs text-arena/85">
                              Vecino:{" "}
                              <strong>{del.buyer_name || "Vecino"}</strong>
                              {del.rider_name
                                ? ` · Repartidor: ${del.rider_name}`
                                : ""}
                            </p>
                          </div>

                          <div className="text-right">
                            <span className="font-brand text-xl text-brillo block">
                              +{formatBs(orderAmount)}
                            </span>
                            <span
                              className={`text-xs font-extrabold ${
                                isReleased ? "text-brote" : "text-oro"
                              }`}
                            >
                              {isReleased
                                ? "✅ Pago acreditado"
                                : "🛡️ Compra Protegida"}
                            </span>
                          </div>
                        </div>

                        <ProtectedPurchaseBar
                          deliveryStatus={del.delivery_status}
                          orderStatus={order?.status}
                          amountBs={orderAmount}
                          compact
                        />

                        <OnChainEscrowAuditLinks
                          contractId={del.contract_id || order?.contract_id}
                          engagementId={
                            del.engagement_id || order?.engagement_id
                          }
                          fundTxHash={del.fund_tx_hash || order?.fund_tx_hash}
                          releaseTxHash={
                            del.release_tx_hash || order?.release_tx_hash
                          }
                          compact
                        />

                        {/* Código de recojo gigante y dictable */}
                        <div className="rounded-2xl bg-[#0B1410] border-2 border-oro p-4 text-center space-y-1.5">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-arena block">
                            🔑 Código de recojo para dictar al repartidor:
                          </span>
                          <span className="block font-mono text-5xl font-bold tracking-[0.2em] text-brillo">
                            {del.pickup_pin}
                          </span>
                          <div className="pt-1 text-xs">
                            {del.subsidized_by_reserve ||
                            del.used_free_delivery ? (
                              <span className="inline-block px-3 py-1 rounded-lg bg-brote/25 border border-brote text-arena font-bold">
                                🚲 1 envío ecológico gratis usado
                              </span>
                            ) : (
                              <span className="inline-block px-3 py-1 rounded-lg bg-arena/10 border border-arena/25 text-arena font-semibold">
                                🚲 Entrega ecológica de barrio
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Compras realizadas a otras caseritas del barrio */}
            {merchant &&
              merchant.transactions &&
              merchant.transactions.length > 0 && (
                <section
                  aria-label="Mis Compras en el Barrio"
                  className="rounded-2xl bg-[#14221D] border-2 border-brote/45 p-5 space-y-3"
                >
                  <h2 className="font-brand text-xl text-arena">
                    🛍️ Mis Pedidos a otras Caseritas (
                    {merchant.transactions.length})
                  </h2>
                  <div className="space-y-3">
                    {merchant.transactions.map((tx) => (
                      <div
                        key={tx.contractId}
                        className="p-4 rounded-2xl bg-bosque border border-arena/20 space-y-3"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-bold text-brillo block">
                              {formatOrderCode(tx.contractId)} ·{" "}
                              {tx.status === "RELEASED"
                                ? "✅ Pago liberado"
                                : "🛡️ Compra Protegida"}
                            </span>
                            <p className="font-brand text-lg text-arena">
                              {tx.productName} ({formatBs(tx.amountMotes)})
                            </p>
                            <p className="text-xs text-arena/85">
                              Caserita: {tx.sellerName}
                            </p>
                          </div>
                        </div>
                        <OnChainEscrowAuditLinks
                          contractId={tx.contractId}
                          engagementId={tx.engagementId}
                          fundTxHash={tx.fundTxHash}
                          releaseTxHash={tx.releaseTxHash}
                          compact
                        />
                        {tx.deliveryPin && (
                          <div className="px-4 py-3 rounded-xl bg-[#0B1410] border-2 border-oro text-center">
                            <span className="text-xs uppercase font-bold text-arena block">
                              Dile este código al repartidor al recibir:
                            </span>
                            <span className="font-mono text-5xl font-bold text-brillo tracking-[0.2em]">
                              {tx.deliveryPin}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
          </>
        ) : (
          /* PANTALLA PRINCIPAL DE LA CASERITA: PRODUCTOS DEL PUESTO Y BOTÓN PUBLICAR */
          <>
            {cfgMessage && (
              <div className="p-3.5 rounded-2xl bg-brote/25 border border-brote text-sm font-bold text-arena">
                ✅ {cfgMessage}
              </div>
            )}

            {cfgError && (
              <div className="p-3.5 rounded-2xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
                {cfgError}
              </div>
            )}

            {/* Botón Principal: + Publicar Producto (Alto contraste bajo el sol) */}
            <section>
              <button
                type="button"
                onClick={openCreateModal}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl sm:text-2xl tracking-wide shadow-green-glow active:scale-[0.98] transition-all border-2 border-white/40"
              >
                + Publicar Producto
              </button>
            </section>

            {/* Lista de Productos del Puesto */}
            <section
              aria-label="Productos de tu Puesto"
              className="space-y-3.5"
            >
              <h2 className="font-brand text-xl sm:text-2xl text-arena">
                Productos en tu Puesto ({myProducts.length})
              </h2>

              {myProducts.length === 0 ? (
                <div className="rounded-2xl bg-[#14221D] border-2 border-arena/20 p-8 text-center space-y-2.5">
                  <div className="text-4xl">🧺</div>
                  <p className="text-base font-bold text-arena">
                    Tu puesto todavía no tiene productos publicados
                  </p>
                  <p className="text-sm text-arena/85">
                    Pulsa &ldquo;+ Publicar Producto&rdquo;, saca una foto y pon
                    tu precio en Bolivianos (Bs). Comisión: 0 Bs — Cubierta por
                    EcoBanco.
                  </p>
                </div>
              ) : (
                <div className="space-y-3.5">
                  {myProducts.map((item) => (
                    <article
                      key={item.id}
                      className="rounded-2xl bg-gradient-to-br from-[#1A2923] to-[#111C18] border-2 border-arena/20 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md"
                    >
                      <div className="flex items-center gap-3.5">
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-20 h-20 rounded-2xl object-cover border-2 border-oro/60 shrink-0"
                        />
                        <div className="space-y-0.5">
                          <span className="font-brand text-2xl text-brillo block">
                            {formatBs(item.priceMotes)}
                          </span>
                          <h3 className="font-brand text-lg text-arena leading-tight">
                            {item.name}
                          </h3>
                          <p className="text-xs text-arena/85 line-clamp-2">
                            {item.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-arena/15 shrink-0">
                        <button
                          type="button"
                          onClick={() => openEditModal(item)}
                          className="px-4 py-2 rounded-xl bg-oro/25 text-brillo border border-oro text-xs sm:text-sm font-extrabold"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteProduct(item.id)}
                          className="px-4 py-2 rounded-xl bg-red-500/20 text-red-200 border border-red-400/50 text-xs sm:text-sm font-extrabold"
                        >
                          Quitar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {/* Resumen directo de Pedidos del Puesto con Auditoría On-Chain en la vista principal */}
            {myDeliveries.length > 0 && (
              <section
                aria-label="Pedidos Recientes de tu Puesto"
                className="rounded-2xl bg-[#14221D] border-2 border-oro/40 p-5 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-brand text-xl text-arena">
                    🚲 Pedidos de tu Puesto ({myDeliveries.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveView("billeteras")}
                    className="text-xs font-extrabold text-brillo underline"
                  >
                    Ver en Mi Libreta →
                  </button>
                </div>

                <div className="space-y-3.5">
                  {myDeliveries.map((del) => {
                    const order = orderById.get(del.order_id);
                    const statusLower = (del.delivery_status || "").toLowerCase();
                    const orderAmount = Math.round(
                      Number(del.amount_motes ?? order?.amount_motes ?? 0)
                    );
                    return (
                      <article
                        key={`cat-${del.id}`}
                        className="rounded-2xl bg-bosque border border-arena/20 p-4 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <span className="font-mono text-xs font-extrabold text-brillo">
                              {formatOrderCode(
                                del.contract_id || order?.contract_id
                              )}
                            </span>
                            <h3 className="font-brand text-lg text-arena">
                              {del.product_name} · +{formatBs(orderAmount)}
                            </h3>
                            <p className="text-xs text-arena/85">
                              Vecino: <strong>{del.buyer_name || "Vecino"}</strong>{" "}
                              · PIN de recojo:{" "}
                              <strong className="font-mono text-brillo">
                                {del.pickup_pin}
                              </strong>
                            </p>
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full bg-oro/20 border border-oro text-xs font-extrabold text-brillo uppercase">
                            {statusLower === "delivered"
                              ? "✅ Entregado"
                              : statusLower === "in_transit"
                              ? "🚲 En Camino"
                              : "🍳 Preparando"}
                          </span>
                        </div>

                        <OnChainEscrowAuditLinks
                          contractId={del.contract_id || order?.contract_id}
                          engagementId={
                            del.engagement_id || order?.engagement_id
                          }
                          fundTxHash={del.fund_tx_hash || order?.fund_tx_hash}
                          releaseTxHash={
                            del.release_tx_hash || order?.release_tx_hash
                          }
                          compact
                        />
                      </article>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </main>

      {/* MODAL ALTA RÁPIDA DE PRODUCTO: 3 BLOQUES GRANDES + VISTA PREVIA DE CONFIRMACIÓN */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
        >
          <div className="max-w-md w-full rounded-2xl bg-[#172620] border-2 border-brote p-5 sm:p-6 space-y-5 shadow-green-glow max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-brand text-2xl text-arena">
                {productStep === "preview"
                  ? "¿Se ve bien tu producto?"
                  : editingProduct
                  ? "Editar Producto"
                  : "Publicar Producto"}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-sm font-extrabold text-arena/85 hover:text-brillo"
              >
                ✕ Cerrar
              </button>
            </div>

            {productError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100">
                ⚠️ {productError}
              </div>
            )}

            {productStep === "edit" ? (
              <form onSubmit={handleContinueToPreview} className="space-y-4">
                {/* BLOQUE 1: Foto del producto (con compresión WebP Modo Megas) */}
                <div className="rounded-2xl bg-bosque/80 border-2 border-oro/50 p-4 space-y-2">
                  <span className="block text-sm font-extrabold uppercase text-brillo">
                    1. Foto del producto
                  </span>
                  <label className="block w-full rounded-2xl border-2 border-dashed border-oro/70 bg-[#0D1714] p-4 text-center cursor-pointer hover:border-brillo transition">
                    {imageUrl ? (
                      <div className="space-y-2">
                        <img
                          src={imageUrl}
                          alt="Vista previa del producto"
                          className="w-full h-44 object-cover rounded-xl mx-auto"
                        />
                        <span className="inline-block text-sm font-extrabold text-brillo">
                          📷 Toca aquí para cambiar la foto
                        </span>
                      </div>
                    ) : (
                      <div className="py-5 space-y-1.5">
                        <div className="text-4xl">📸</div>
                        <span className="block text-base font-extrabold text-brillo">
                          {uploadingBucket === "product-images"
                            ? "Optimizando foto..."
                            : "Toca aquí para tomar o elegir foto"}
                        </span>
                        <span className="block text-xs text-arena/85">
                          Modo Megas activo: se guarda liviana para cuidar tus
                          datos
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

                {/* BLOQUE 2: Nombre del producto */}
                <div className="rounded-2xl bg-bosque/80 border-2 border-arena/25 p-4 space-y-2">
                  <label
                    htmlFor="product-name-input"
                    className="block text-sm font-extrabold uppercase text-brillo"
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
                    className="w-full px-4 py-3.5 rounded-xl bg-[#0D1714] border-2 border-arena/30 text-arena text-lg font-bold focus:outline-none focus:border-brillo"
                  />
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Nota corta opcional (ej. con llajua, por docena)"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-[#0D1714] border border-arena/20 text-arena/90 text-sm focus:outline-none focus:border-oro"
                  />
                </div>

                {/* BLOQUE 3: Precio en Bs */}
                <div className="rounded-2xl bg-bosque/80 border-2 border-oro/60 p-4 space-y-2">
                  <label
                    htmlFor="product-price-input"
                    className="block text-sm font-extrabold uppercase text-brillo"
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
                      className="w-full pl-4 pr-16 py-4 rounded-xl bg-[#0D1714] border-2 border-oro text-brillo font-brand text-3xl focus:outline-none focus:border-brillo"
                    />
                    <span className="absolute right-4 font-brand text-2xl text-oro">
                      Bs
                    </span>
                  </div>
                  <p className="text-xs font-bold text-brote">
                    Comisión: 0 Bs — Cubierta por EcoBanco · 1 MOTE = 1 Bs
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={uploadingBucket === "product-images"}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition"
                >
                  Revisar antes de publicar →
                </button>
              </form>
            ) : (
              /* VISTA PREVIA DE CONFIRMACIÓN CON DOS BOTONES CLAROS */
              <div className="space-y-5">
                <div className="rounded-2xl bg-bosque border-2 border-oro overflow-hidden shadow-lg">
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt={name}
                      className="w-full h-52 object-cover border-b border-arena/15"
                    />
                  )}
                  <div className="p-4 space-y-2">
                    <span className="text-xs font-extrabold text-brote uppercase">
                      🏪 {merchant?.storeName}
                    </span>
                    <h4 className="font-brand text-2xl text-arena">{name}</h4>
                    {description.trim() && (
                      <p className="text-sm text-arena/85">{description}</p>
                    )}
                    <div className="pt-2 border-t border-arena/15 flex items-baseline justify-between">
                      <span className="text-xs font-bold uppercase text-arena/85">
                        Precio para tus vecinos
                      </span>
                      <span className="font-brand text-3xl text-brillo">
                        {formatBs(priceMotes)}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-brote">
                      🛡️ Comisión: 0 Bs — Cubierta por EcoBanco
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  <button
                    type="button"
                    disabled={isSubmittingProduct}
                    onClick={handleConfirmPublishProduct}
                    className="w-full py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-xl shadow-green-glow border-2 border-white/40 active:scale-95 transition"
                  >
                    {isSubmittingProduct
                      ? "Guardando tu puesto..."
                      : "Publicar así"}
                  </button>

                  <button
                    type="button"
                    disabled={isSubmittingProduct}
                    onClick={handleCorrectPrice}
                    className="w-full py-3.5 rounded-2xl bg-oro/20 hover:bg-oro/30 border-2 border-oro text-brillo font-extrabold text-base uppercase tracking-wide transition"
                  >
                    Corregir precio
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Envoltura visual "Cargar saldo con QR de tu Banco" sobre Pollar RampWidget */}
      <BankQrRechargeModal
        open={isRampOpen}
        role="merchant"
        userId={merchant?.id}
        purpose={merchant?.isProsumer ? "fiat_topup" : "merchant_premium"}
        amountBs={SUBSCRIPTION_COST}
        subtitle={
          merchant?.isProsumer
            ? "Carga saldo en Bolivianos (Bs) mediante Pollar (BOB → USDC)."
            : "Carga 100 Bs con el QR de tu banco para activar tu cuenta de Caserita Aliada."
        }
        onRampCredited={(event: RampCreditedEvent) => {
          if (event.merchant) {
            setMerchant(event.merchant);
            syncConfigFields(event.merchant);
          }
          setPendingRampOrder(null);
          setCfgError(null);
          setCfgMessage(event.message);
          setIsRampOpen(false);
        }}
        onRampPending={(pending) => {
          setPendingRampOrder(pending);
          setCfgError(null);
          setCfgMessage(
            `Orden Pollar ${pending.pollarOrderId} iniciada. Apenas se confirme el pago en la red se acreditará automáticamente.`
          );
        }}
        onRampError={(errMsg) => {
          setCfgError(translateBackendMessage(errMsg));
        }}
        onClose={() => {
          setIsRampOpen(false);
        }}
      />
    </div>
  );
}
