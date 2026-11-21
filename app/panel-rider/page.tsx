"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import { compressImageToWebP } from "@/app/lib/imageCompressor";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  normalizeDeliveryStatusKey,
  sanitizeUserError,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import {
  disconnectProfileSession,
  isPageReloadNavigation,
  purgeClientSessionStorage,
  useDisconnectOnPageUnload,
} from "@/app/lib/useDisconnectOnReload";
import { PollarWalletSection } from "@/app/components/PollarWalletSection";
import { ThemeToggleSetting } from "@/app/components/ThemeToggleSetting";
import { RiderAvailableList } from "@/app/components/rider/RiderAvailableList";
import { RiderActiveDeliveries } from "@/app/components/rider/RiderActiveDeliveries";
import { RiderEarningsTab } from "@/app/components/rider/RiderEarningsTab";
import { RiderBottomNav, RiderTab } from "@/app/components/rider/RiderBottomNav";
import {
  Delivery,
  Order,
  Rider,
  RiderVehicleType,
} from "@/app/types/ecobanco";

type AuthStatus = "checking" | "unauthenticated" | "authenticated";

function normalizeStatus(status?: string) {
  return normalizeDeliveryStatusKey(status);
}

export default function PanelRiderPage() {
  const router = useRouter();
  const { getClient: getPollarClient, logout: pollarLogout } = usePollar();

  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authTab, setAuthTab] = useState<"login" | "register">("login");
  const [rider, setRider] = useState<Rider | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<RiderTab>("disponibles");
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const disconnectPromiseRef = useRef<Promise<void> | null>(null);

  // Campos de ingreso (Login Repartidor)
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginSecret, setLoginSecret] = useState<string>("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState<boolean>(false);

  // Ficha de Confianza del Repartidor (Registro)
  const [nameInput, setNameInput] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [pinInput, setPinInput] = useState<string>("");
  const [vehicleInput, setVehicleInput] =
    useState<RiderVehicleType>("bicicleta");
  const [addressInput, setAddressInput] = useState<string>("");
  const [ciInput, setCiInput] = useState<string>("");
  const [selfieUrlInput, setSelfieUrlInput] = useState<string>("");
  const [ciPhotoUrlInput, setCiPhotoUrlInput] = useState<string>("");
  const [selfieKb, setSelfieKb] = useState<number | null>(null);
  const [ciKb, setCiKb] = useState<number | null>(null);
  const [isUploadingSelfie, setIsUploadingSelfie] = useState<boolean>(false);
  const [isUploadingCiPhoto, setIsUploadingCiPhoto] = useState<boolean>(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] =
    useState<boolean>(false);

  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const syncRiderFields = useCallback((loadedRider: Rider) => {
    setNameInput(loadedRider.name || "");
    setPhoneInput(loadedRider.phone || "");
    setVehicleInput(loadedRider.vehicleType || "bicicleta");
    setAddressInput(loadedRider.address || "");
    setCiInput(loadedRider.ciNumber || "");
    setSelfieUrlInput(loadedRider.selfieUrl || "");
    setCiPhotoUrlInput(loadedRider.ciPhotoUrl || "");
  }, []);

  const resetToLoginState = useCallback(() => {
    purgeClientSessionStorage();
    setRider(null);
    setDeliveries([]);
    setOrders([]);
    setPinInputs({});
    setSelfieKb(null);
    setCiKb(null);
    setFeedbackMsg(null);
    setFeedbackError(null);
    setShowSettings(false);
    setAuthTab("login");
    setAuthStatus("unauthenticated");
  }, []);

  const loadProtectedRiderData = useCallback(async () => {
    try {
      setIsLoadingData(true);
      const res = await fetch("/api/deliveries");
      if (res.status === 401) {
        resetToLoginState();
        return;
      }

      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(sanitizeUserError(data.error));
        return;
      }

      const loadedRider: Rider | null = data.rider || null;
      if (!loadedRider?.isLoggedIn || !loadedRider?.riderVerified) {
        resetToLoginState();
        return;
      }

      setRider(loadedRider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      syncRiderFields(loadedRider);
    } catch {
      setFeedbackError(COMMUNITY_COPY.defaultError);
    } finally {
      setIsLoadingData(false);
    }
  }, [resetToLoginState, syncRiderFields]);

  // Exige verificación explícita de sesión; en recarga o entrada con ?login=1 va directo al login
  useEffect(() => {
    let active = true;
    async function init() {
      const forceLogin =
        typeof window !== "undefined" &&
        new URLSearchParams(window.location.search).get("login") === "1";

      if (forceLogin || isPageReloadNavigation()) {
        if (forceLogin && typeof window !== "undefined") {
          window.history.replaceState(null, "", "/panel-rider");
        }
        if (active) {
          resetToLoginState();
        }
        const disconnectTask = disconnectProfileSession(
          "rider_logout",
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
        const res = await fetch("/api/users");
        const data = await res.json();
        if (!active) return;

        const loadedRider: Rider | null = data.rider || null;
        if (res.ok && loadedRider?.isLoggedIn && loadedRider?.riderVerified) {
          setRider(loadedRider);
          syncRiderFields(loadedRider);
          setAuthStatus("authenticated");
          await loadProtectedRiderData();
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
    loadProtectedRiderData,
    pollarLogout,
    resetToLoginState,
    syncRiderFields,
  ]);

  const isRiderVerified = Boolean(
    authStatus === "authenticated" && rider?.isLoggedIn && rider?.riderVerified
  );
  useDisconnectOnPageUnload(isRiderVerified, "rider_logout");

  const handleRiderPollarSynced = useCallback((result: PollarSyncResult) => {
    if (!result.synced) return;
    setRider((prev) =>
      prev
        ? {
            ...prev,
            pollar_user_id: result.pollarUserId ?? prev.pollar_user_id,
            stellar_address: result.stellarAddress ?? prev.stellar_address,
          }
        : prev
    );
  }, []);

  const syncRiderPollarInBackground = useCallback(
    async (targetRider: Rider | null) => {
      if (!targetRider?.isLoggedIn || !targetRider.riderVerified) return;
      const result = await ensurePollarWalletAndSync(getPollarClient(), {
        userId: targetRider.id,
        role: "rider",
      });
      if (result.synced) {
        handleRiderPollarSynced(result);
      }
    },
    [getPollarClient, handleRiderPollarSynced]
  );

  const handleVerificationPhotoUpload = async (
    file: File,
    kind: "selfie" | "ci"
  ) => {
    try {
      setOnboardingError(null);
      if (kind === "selfie") {
        setIsUploadingSelfie(true);
      } else {
        setIsUploadingCiPhoto(true);
      }

      const compressed = await compressImageToWebP(file, {
        maxDimension: 1080,
        maxBytes: 80 * 1024,
      });
      const compressedSizeKb = Math.max(
        1,
        Math.round(compressed.sizeBytes / 1024)
      );

      const res = await fetch("/api/storage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "rider-verifications",
          dataUrl: compressed.dataUrl,
          ownerId: `${rider?.id || phoneInput.trim() || "rider"}-${kind}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOnboardingError(sanitizeUserError(data.error));
        return;
      }

      if (kind === "selfie") {
        setSelfieUrlInput(data.publicUrl);
        setSelfieKb(compressedSizeKb);
      } else {
        setCiPhotoUrlInput(data.publicUrl);
        setCiKb(compressedSizeKb);
      }
    } catch (err) {
      setOnboardingError(sanitizeUserError(err));
    } finally {
      if (kind === "selfie") {
        setIsUploadingSelfie(false);
      } else {
        setIsUploadingCiPhoto(false);
      }
    }
  };

  const handleRiderLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const cleanId = loginIdentifier.trim();
    const cleanSecret = loginSecret.trim();

    if (!cleanId) {
      setAuthError("Ingresa tu WhatsApp o tu credencial ECO-R-XXXX.");
      return;
    }

    if (!cleanSecret) {
      setAuthError("Ingresa tu clave PIN de 4 números o tu número de CI.");
      return;
    }

    setIsSubmittingLogin(true);
    try {
      if (disconnectPromiseRef.current) {
        await disconnectPromiseRef.current;
      }

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rider_login",
          identifier: cleanId,
          password: cleanSecret,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.rider) {
        setAuthError(sanitizeUserError(data.error));
        return;
      }

      const loggedRider: Rider = data.rider;
      setRider(loggedRider);
      syncRiderFields(loggedRider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      setAuthStatus("authenticated");
      setLoginIdentifier("");
      setLoginSecret("");
      setAuthError(null);
      setFeedbackMsg(null);
      setFeedbackError(null);
      setActiveTab("disponibles");
      void syncRiderPollarInBackground(loggedRider);
    } catch (err) {
      setAuthError(sanitizeUserError(err));
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError(null);

    const cleanPin = pinInput.replace(/\D/g, "").slice(0, 4);

    if (
      !nameInput.trim() ||
      !phoneInput.trim() ||
      !addressInput.trim() ||
      !ciInput.trim() ||
      !selfieUrlInput ||
      !ciPhotoUrlInput
    ) {
      setOnboardingError(
        "Completa todos tus datos y sube tu selfie frontal sin cubrir y la foto de tu Carnet de Identidad (CI)."
      );
      return;
    }

    if (cleanPin.length !== 4) {
      setOnboardingError(
        "Crea tu clave secreta de 4 números (PIN) para ingresar de forma segura."
      );
      return;
    }

    setIsSubmittingOnboarding(true);
    try {
      if (disconnectPromiseRef.current) {
        await disconnectPromiseRef.current;
      }

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "rider_onboarding",
          name: nameInput,
          phone: phoneInput,
          vehicleType: vehicleInput,
          address: addressInput,
          ciNumber: ciInput,
          password: cleanPin,
          selfieUrl: selfieUrlInput,
          ciPhotoUrl: ciPhotoUrlInput,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.rider) {
        setOnboardingError(sanitizeUserError(data.error));
        return;
      }

      setRider(data.rider);
      syncRiderFields(data.rider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      setPinInput("");
      setAuthStatus("authenticated");
      void syncRiderPollarInBackground(data.rider);
      setFeedbackMsg(
        "¡Credencial oficial activada! Ya puedes tomar pedidos del barrio."
      );
      setActiveTab("disponibles");
    } catch (err) {
      setOnboardingError(sanitizeUserError(err));
    } finally {
      setIsSubmittingOnboarding(false);
    }
  };

  const handleRiderLogout = async (redirectHome = false) => {
    await disconnectProfileSession(
      redirectHome ? "logout_all" : "rider_logout",
      pollarLogout
    );
    resetToLoginState();
    setFeedbackMsg(null);
    setFeedbackError(null);
    setAuthError(null);
    setOnboardingError(null);
    if (redirectHome) {
      router.push("/");
    }
  };

  const handleCopyInviteCode = async () => {
    if (!rider?.riderInviteCode) return;
    try {
      await navigator.clipboard.writeText(rider.riderInviteCode);
    } catch {
      // ignore clipboard errors
    }
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleAcceptDelivery = async (deliveryId: string) => {
    try {
      setActionBusyId(deliveryId);
      setFeedbackMsg(null);
      setFeedbackError(null);

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "accept_delivery",
          deliveryId,
        }),
      });
      if (res.status === 401) {
        resetToLoginState();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(sanitizeUserError(data.error));
        return;
      }

      setRider(data.rider || rider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      setFeedbackMsg(
        translateBackendMessage(
          data.message ||
            "Pedido asignado. Pasa por el puesto de la caserita y dile el código de recojo."
        )
      );
      setActiveTab("en_curso");
    } catch (err) {
      setFeedbackError(sanitizeUserError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleValidatePickup = async (deliveryId: string) => {
    const pin = (pinInputs[deliveryId] || "").trim();
    if (pin.length !== 4) {
      setFeedbackError(
        "Ingresa el código de 4 números para confirmar el recojo."
      );
      return;
    }

    try {
      setActionBusyId(deliveryId);
      setFeedbackMsg(null);
      setFeedbackError(null);

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate_pickup",
          deliveryId,
          pin,
        }),
      });
      if (res.status === 401) {
        resetToLoginState();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(sanitizeUserError(data.error));
        return;
      }

      setRider(data.rider || rider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      setPinInputs((prev) => ({ ...prev, [deliveryId]: "" }));
      setFeedbackMsg(
        "¡Recojo confirmado! Ahora lleva el pedido al vecino y valida el código al entregar."
      );
      setActiveTab("en_curso");
    } catch (err) {
      setFeedbackError(sanitizeUserError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const handleValidateDelivery = async (deliveryId: string) => {
    const pin = (pinInputs[deliveryId] || "").trim();
    if (pin.length !== 4) {
      setFeedbackError(
        "Ingresa el código de 4 números del vecino para confirmar la entrega."
      );
      return;
    }

    try {
      setActionBusyId(deliveryId);
      setFeedbackMsg(null);
      setFeedbackError(null);

      const res = await fetch("/api/deliveries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "validate_delivery",
          deliveryId,
          pin,
        }),
      });
      if (res.status === 401) {
        resetToLoginState();
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(sanitizeUserError(data.error));
        return;
      }

      setRider(data.rider || rider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      setPinInputs((prev) => ({ ...prev, [deliveryId]: "" }));
      setFeedbackMsg(
        "¡Entrega confirmada! El pago pasó a la caserita y tu ganancia ya está en tu libreta."
      );
      setActiveTab("ganancias");
    } catch (err) {
      setFeedbackError(sanitizeUserError(err));
    } finally {
      setActionBusyId(null);
    }
  };

  const orderById = useMemo(
    () => new Map(orders.map((o) => [o.id, o])),
    [orders]
  );

  const availableDeliveries = useMemo(
    () =>
      deliveries.filter(
        (d) => normalizeStatus(d.delivery_status) === "pending" && !d.rider_id
      ),
    [deliveries]
  );

  const inProgressDeliveries = useMemo(
    () =>
      deliveries.filter((d) => {
        const st = normalizeStatus(d.delivery_status);
        if (st === "in_transit") {
          return !rider || !d.rider_id || d.rider_id === rider.id;
        }
        if (st === "pending" && rider && d.rider_id === rider.id) {
          return true;
        }
        return false;
      }),
    [deliveries, rider]
  );

  const completedDeliveries = useMemo(
    () =>
      deliveries.filter((d) => {
        const st = normalizeStatus(d.delivery_status);
        return (
          st === "delivered" &&
          (!rider || !d.rider_id || d.rider_id === rider.id)
        );
      }),
    [deliveries, rider]
  );

  const subsidizedCount = useMemo(
    () =>
      completedDeliveries.filter(
        (d) => d.subsidized_by_reserve || d.used_free_delivery
      ).length,
    [completedDeliveries]
  );

  const totalEarnedBs = Math.round(rider?.motesEarned ?? 0);

  // GUARDIA 1: Verificación de sesión (nunca muestra el dashboard ni datos previos)
  if (authStatus === "checking") {
    return (
      <div className="min-h-screen eco-page font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto rounded-2xl eco-card p-6 sm:p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-2xl eco-inset flex items-center justify-center text-3xl animate-pulse">
            🚲
          </div>
          <h1 className="font-brand text-2xl eco-text">
            Verificando acceso de repartidor...
          </h1>
          <p className="text-base eco-text-muted">
            Por seguridad, comprobamos tu credencial antes de mostrar los
            pedidos.
          </p>
        </div>
      </div>
    );
  }

  // GUARDIA 2: Pantalla de Ingreso / Registro del Repartidor de Barrio
  if (!isRiderVerified) {
    return (
      <div className="min-h-screen eco-page font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto space-y-5">
          <button
            type="button"
            onClick={() => void handleRiderLogout(true)}
            className="inline-flex items-center gap-1.5 px-4 min-h-[48px] rounded-2xl eco-btn-ghost text-base font-bold"
          >
            ← Inicio
          </button>

          <div className="rounded-2xl eco-card-green p-6 sm:p-7 space-y-5">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brote via-oro to-madera p-0.5 flex items-center justify-center shadow-md">
                <div className="w-full h-full rounded-2xl bg-bosque flex items-center justify-center text-3xl">
                  🛡️
                </div>
              </div>
              <span className="inline-block px-3 py-1 rounded-full eco-card-gold text-xs font-extrabold uppercase tracking-wider eco-text-gold">
                Repartidor de Barrio
              </span>
              <h1 className="font-brand text-2xl sm:text-3xl eco-text">
                {authTab === "login"
                  ? "Ingresa como Repartidor"
                  : "Credencial de Confianza"}
              </h1>
              <p className="text-base eco-text-muted leading-relaxed">
                {authTab === "login"
                  ? "Ingresa con tu WhatsApp o tu credencial oficial ECO-R-XXXX para ver entregas disponibles."
                  : "Registra tus datos para recibir tu credencial oficial ECO-R-XXXX y empezar a repartir en tu zona."}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl eco-inset">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("login");
                  setAuthError(null);
                  setOnboardingError(null);
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
                  setOnboardingError(null);
                }}
                className={`min-h-[48px] py-3 rounded-xl text-sm font-extrabold uppercase tracking-wider transition ${
                  authTab === "register"
                    ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow"
                    : "eco-text-muted hover:eco-text"
                }`}
              >
                Registrarme
              </button>
            </div>

            {authTab === "login" ? (
              <form onSubmit={handleRiderLogin} className="space-y-4">
                {authError && (
                  <div className="p-3.5 rounded-xl eco-alert-error text-base font-bold text-center">
                    ⚠️ {authError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold uppercase eco-text mb-1">
                    WhatsApp o Credencial (ECO-R-XXXX) *
                  </label>
                  <input
                    type="text"
                    required
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Ej. 64065089 o ECO-R-1234"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase eco-text-gold mb-1">
                    Clave secreta de 4 números (PIN) o Carnet (CI) *
                  </label>
                  <input
                    type="password"
                    required
                    value={loginSecret}
                    onChange={(e) => setLoginSecret(e.target.value)}
                    placeholder="Ingresa tu PIN de 4 números o CI"
                    className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base font-bold"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingLogin}
                  className="w-full min-h-[56px] py-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition disabled:opacity-60"
                >
                  {isSubmittingLogin
                    ? "Verificando credencial..."
                    : "Entrar a Repartir →"}
                </button>
              </form>
            ) : (
              <>
                {onboardingError && (
                  <div className="p-3.5 rounded-xl eco-alert-error text-base font-bold text-center">
                    ⚠️ {onboardingError}
                  </div>
                )}

                <form onSubmit={handleOnboardingSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase eco-text mb-1">
                      1. Nombre Completo *
                    </label>
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Ej. Oliver Lujan"
                      className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold uppercase eco-text mb-1">
                        2. WhatsApp de Contacto *
                      </label>
                      <input
                        type="tel"
                        required
                        value={phoneInput}
                        onChange={(e) => setPhoneInput(e.target.value)}
                        placeholder="Ej. 64065089"
                        className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase eco-text mb-1">
                        3. Número de Carnet (CI) *
                      </label>
                      <input
                        type="text"
                        required
                        value={ciInput}
                        onChange={(e) => setCiInput(e.target.value)}
                        placeholder="Ej. 8492014 LP"
                        className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase eco-text mb-1">
                      4. Dirección de Domicilio *
                    </label>
                    <input
                      type="text"
                      required
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      placeholder="Zona, calle y número de domicilio"
                      className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input text-base"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase eco-text-gold mb-1">
                      5. Crea tu clave secreta de 4 números (PIN) *
                    </label>
                    <input
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
                      placeholder="• • • •"
                      className="w-full px-4 py-3.5 min-h-[48px] rounded-xl eco-input font-mono text-2xl font-bold tracking-[0.4em] text-center"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase eco-text mb-1.5">
                      6. Tu Vehículo Ecológico *
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setVehicleInput("bicicleta")}
                        className={`min-h-[64px] p-3.5 rounded-2xl border-2 text-center transition space-y-1 ${
                          vehicleInput === "bicicleta"
                            ? "eco-alert-success font-extrabold"
                            : "eco-btn-ghost"
                        }`}
                      >
                        <span className="text-3xl block">🚲</span>
                        <span className="text-sm font-extrabold block">
                          Bicicleta
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setVehicleInput("moto_electrica")}
                        className={`min-h-[64px] p-3.5 rounded-2xl border-2 text-center transition space-y-1 ${
                          vehicleInput === "moto_electrica"
                            ? "eco-card-gold font-extrabold"
                            : "eco-btn-ghost"
                        }`}
                      >
                        <span className="text-3xl block">🛵</span>
                        <span className="text-sm font-extrabold block">
                          Moto Eléctrica
                        </span>
                      </button>
                    </div>
                  </div>

                  <div className="rounded-2xl eco-card-gold p-4 space-y-1.5">
                    <span className="text-xs font-extrabold uppercase eco-text-gold block">
                      🤝 Confianza en Comunidad
                    </span>
                    <p className="text-base font-semibold eco-text leading-relaxed">
                      Nuestras caseritas cuidan a su barrio. Tu foto y CI solo
                      sirven para darte tu credencial oficial{" "}
                      <strong className="eco-text-gold">ECO-R-XXXX</strong>.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase eco-text-gold">
                      7. Selfie Frontal (Rostro Descubierto) *
                    </label>
                    <label className="block w-full rounded-2xl border-2 border-dashed border-oro/70 eco-inset p-4 text-center cursor-pointer transition">
                      {selfieUrlInput ? (
                        <div className="space-y-2">
                          <img
                            src={selfieUrlInput}
                            alt="Selfie de verificación"
                            className="w-24 h-24 rounded-2xl object-cover mx-auto border-2 border-brote"
                          />
                          <span className="inline-block text-sm font-bold eco-text-green">
                            ✅ Selfie cargada
                            {selfieKb !== null ? ` (${selfieKb} KB)` : ""} ·
                            Toca para cambiar
                          </span>
                        </div>
                      ) : (
                        <div className="py-3 space-y-1">
                          <div className="text-3xl">🤳</div>
                          <span className="block text-sm font-extrabold eco-text-gold">
                            {isUploadingSelfie
                              ? "Optimizando foto..."
                              : "Toca aquí para subir tu selfie frontal"}
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            void handleVerificationPhotoUpload(file, "selfie");
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase eco-text-gold">
                      8. Foto de tu Carnet de Identidad (CI) *
                    </label>
                    <label className="block w-full rounded-2xl border-2 border-dashed border-brote/65 eco-inset p-4 text-center cursor-pointer transition">
                      {ciPhotoUrlInput ? (
                        <div className="space-y-2">
                          <img
                            src={ciPhotoUrlInput}
                            alt="Foto del Carnet de Identidad"
                            className="w-36 h-24 rounded-xl object-cover mx-auto border-2 border-brote"
                          />
                          <span className="inline-block text-sm font-bold eco-text-green">
                            ✅ Foto de CI cargada
                            {ciKb !== null ? ` (${ciKb} KB)` : ""} · Toca para
                            cambiar
                          </span>
                        </div>
                      ) : (
                        <div className="py-3 space-y-1">
                          <div className="text-3xl">🪪</div>
                          <span className="block text-sm font-extrabold eco-text-gold">
                            {isUploadingCiPhoto
                              ? "Optimizando foto del CI..."
                              : "Toca aquí para subir foto de tu CI"}
                          </span>
                        </div>
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file)
                            void handleVerificationPhotoUpload(file, "ci");
                        }}
                        className="hidden"
                      />
                    </label>
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isSubmittingOnboarding ||
                      isUploadingSelfie ||
                      isUploadingCiPhoto
                    }
                    className="w-full min-h-[56px] py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-lg sm:text-xl shadow-green-glow border-2 border-white/40 active:scale-95 transition disabled:opacity-60"
                  >
                    {isSubmittingOnboarding
                      ? "Preparando tu libreta comunitaria..."
                      : "Activar mi Credencial Oficial →"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen eco-page font-sans pb-28">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleRiderLogout(true)}
            className="inline-flex items-center gap-1.5 px-4 min-h-[48px] py-2.5 rounded-2xl eco-btn-ghost text-sm font-bold"
          >
            ← Inicio
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowSettings((prev) => !prev)}
              className={`px-3.5 min-h-[48px] py-2.5 rounded-2xl text-xs sm:text-sm font-extrabold transition ${
                showSettings ? "bg-oro text-bosque shadow" : "eco-btn-ghost"
              }`}
            >
              ⚙️ {showSettings ? "Volver" : "Configuración"}
            </button>
            <button
              type="button"
              disabled={isLoadingData}
              onClick={() => void loadProtectedRiderData()}
              className="px-3.5 min-h-[48px] py-2.5 rounded-2xl eco-btn-ghost text-xs sm:text-sm font-bold disabled:opacity-60"
            >
              {isLoadingData ? "Actualizando..." : "🔄 Actualizar"}
            </button>
            <button
              type="button"
              onClick={() => void handleRiderLogout(false)}
              className="px-3.5 min-h-[48px] py-2.5 rounded-2xl eco-btn-danger text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Configuración del Repartidor (Modo oscuro) */}
        {showSettings && (
          <section className="rounded-2xl eco-card p-5 space-y-3">
            <h2 className="font-brand text-xl eco-text">⚙️ Configuración</h2>
            <ThemeToggleSetting />
          </section>
        )}

        {/* Cabecera del Repartidor Verificado */}
        <header className="rounded-2xl eco-card-green p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {rider?.selfieUrl ? (
                <img
                  src={rider.selfieUrl}
                  alt={rider.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-brote shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl eco-inset flex items-center justify-center text-3xl shrink-0">
                  {rider?.vehicleType === "moto_electrica" ? "🛵" : "🚲"}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-brote text-bosque text-xs font-extrabold uppercase">
                    ✅ De Confianza
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full eco-card-gold text-xs font-extrabold uppercase eco-text-gold">
                    {rider?.vehicleType === "moto_electrica"
                      ? "🛵 Moto Eléctrica"
                      : "🚲 Bicicleta"}
                  </span>
                </div>
                <h1 className="font-brand text-xl sm:text-2xl eco-text truncate">
                  {rider?.name}
                </h1>
                <p className="text-xs eco-text-muted truncate">
                  📱 {rider?.phone} · 🪪 CI: {rider?.ciNumber}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs font-bold uppercase eco-text-muted block">
                Ganado
              </span>
              <span className="font-brand text-2xl eco-text-gold block">
                {formatBs(totalEarnedBs)}
              </span>
              <span className="text-xs font-extrabold eco-text-green">
                {formatMotes(totalEarnedBs)}
              </span>
            </div>
          </div>

          {rider?.riderInviteCode && (
            <div className="rounded-xl eco-inset p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider eco-text-muted block">
                    🪪 Tu Credencial Oficial de Repartidor
                  </span>
                  <span className="font-mono text-2xl font-extrabold tracking-widest eco-text-gold">
                    {rider.riderInviteCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInviteCode}
                  className="px-4 min-h-[48px] py-2.5 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold text-xs uppercase shadow active:scale-95 transition"
                >
                  {copiedCode ? "✅ ¡Copiado!" : "📋 Copiar credencial"}
                </button>
              </div>
            </div>
          )}

          {rider?.isLoggedIn && (
            <PollarWalletSection
              role="rider"
              userId={rider.id}
              savedStellarAddress={rider.stellar_address}
              savedPollarUserId={rider.pollar_user_id}
              mode="profile-badge"
              compact
              balanceBs={totalEarnedBs}
              balanceMotes={totalEarnedBs}
              movementsCount={completedDeliveries.length}
              onViewMovements={() => setActiveTab("ganancias")}
              onSynced={handleRiderPollarSynced}
            />
          )}
        </header>

        {feedbackMsg && (
          <div className="p-4 rounded-2xl eco-alert-success text-sm font-bold">
            ✅ {feedbackMsg}
          </div>
        )}
        {feedbackError && (
          <div className="p-4 rounded-2xl eco-alert-error text-sm font-bold">
            ⚠️ {feedbackError}
          </div>
        )}

        {/* PESTAÑA 1: PEDIDOS DISPONIBLES */}
        {activeTab === "disponibles" && (
          <RiderAvailableList
            deliveries={availableDeliveries}
            orderById={orderById}
            isLoading={isLoadingData}
            actionBusyId={actionBusyId}
            onAcceptDelivery={handleAcceptDelivery}
          />
        )}

        {/* PESTAÑA 2: EN CURSO (USO A UNA MANO) */}
        {activeTab === "en_curso" && (
          <RiderActiveDeliveries
            deliveries={inProgressDeliveries}
            orderById={orderById}
            pinInputs={pinInputs}
            actionBusyId={actionBusyId}
            onPinChange={(deliveryId, digits) =>
              setPinInputs((prev) => ({
                ...prev,
                [deliveryId]: digits,
              }))
            }
            onValidatePickup={handleValidatePickup}
            onValidateDelivery={handleValidateDelivery}
          />
        )}

        {/* PESTAÑA 3: MIS GANANCIAS */}
        {activeTab === "ganancias" && (
          <RiderEarningsTab
            rider={rider}
            completedDeliveries={completedDeliveries}
            orderById={orderById}
            totalEarnedBs={totalEarnedBs}
            subsidizedCount={subsidizedCount}
          />
        )}
      </main>

      {/* Navegación fija inferior para usar con una sola mano */}
      <RiderBottomNav
        activeTab={activeTab}
        availableCount={availableDeliveries.length}
        inProgressCount={inProgressDeliveries.length}
        completedCount={completedDeliveries.length}
        onSelectTab={setActiveTab}
      />
    </div>
  );
}
