"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import { compressImageToWebP } from "@/app/lib/imageCompressor";
import {
  formatBs,
  formatMotes,
  formatOrderCode,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import {
  PollarProfileSnapshot,
  PollarWalletSection,
} from "@/app/components/PollarWalletSection";
import { OnChainEscrowAuditLinks } from "@/app/components/OnChainEscrowAuditLinks";
import {
  Delivery,
  Order,
  Rider,
  RiderVehicleType,
} from "@/app/types/ecobanco";

type RiderTab = "disponibles" | "en_curso" | "ganancias";

function normalizeStatus(status?: string) {
  const s = (status || "").toLowerCase();
  if (s === "in_transit") return "in_transit";
  if (s === "delivered") return "delivered";
  return "pending";
}

export default function PanelRiderPage() {
  const {
    getClient: getPollarClient,
    isAuthenticated: isPollarAuthenticated,
  } = usePollar();
  const [rider, setRider] = useState<Rider | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<RiderTab>("disponibles");
  const [pollarDraft, setPollarDraft] = useState<{
    pollarUserId?: string | null;
    stellarAddress?: string | null;
  }>({});
  const skipAutoPollarLoginRef = useRef<boolean>(false);
  const pollarLookupKeyRef = useRef<string>("");

  // Ficha de Confianza del Repartidor
  const [nameInput, setNameInput] = useState<string>("");
  const [phoneInput, setPhoneInput] = useState<string>("");
  const [vehicleInput, setVehicleInput] =
    useState<RiderVehicleType>("bicicleta");
  const [addressInput, setAddressInput] = useState<string>("");
  const [ciInput, setCiInput] = useState<string>("");
  const [selfieUrlInput, setSelfieUrlInput] = useState<string>("");
  const [ciPhotoUrlInput, setCiPhotoUrlInput] = useState<string>("");
  const [isUploadingSelfie, setIsUploadingSelfie] = useState<boolean>(false);
  const [isUploadingCiPhoto, setIsUploadingCiPhoto] = useState<boolean>(false);
  const [onboardingError, setOnboardingError] = useState<string | null>(null);
  const [isSubmittingOnboarding, setIsSubmittingOnboarding] =
    useState<boolean>(false);

  // Copiar credencial ECO-R-XXXX
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  // Inputs de PIN por deliveryId
  const [pinInputs, setPinInputs] = useState<Record<string, string>>({});
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const loadDeliveries = async () => {
    try {
      setIsLoading(true);
      const res = await fetch("/api/deliveries");
      const data = await res.json();
      const loadedRider: Rider | null = data.rider || null;
      setRider(loadedRider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);

      if (loadedRider) {
        setNameInput(loadedRider.name || "");
        setPhoneInput(loadedRider.phone || "");
        setVehicleInput(loadedRider.vehicleType || "bicicleta");
        setAddressInput(loadedRider.address || "");
        setCiInput(loadedRider.ciNumber || "");
        setSelfieUrlInput(loadedRider.selfieUrl || "");
        setCiPhotoUrlInput(loadedRider.ciPhotoUrl || "");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDeliveries();
  }, []);

  const handleRiderPollarSynced = useCallback((result: PollarSyncResult) => {
    if (!result.synced) return;
    setPollarDraft({
      pollarUserId: result.pollarUserId ?? null,
      stellarAddress: result.stellarAddress ?? null,
    });
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

  const handlePollarRiderProfile = useCallback(
    async (profile: PollarProfileSnapshot) => {
      setPollarDraft({
        pollarUserId: profile.pollarUserId ?? null,
        stellarAddress: profile.stellarAddress ?? null,
      });

      if (profile.name && !nameInput.trim()) {
        setNameInput(profile.name);
      }

      if (
        (rider?.isLoggedIn && rider.riderVerified) ||
        skipAutoPollarLoginRef.current
      ) {
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
            role: "rider",
            pollar_user_id: profile.pollarUserId,
            stellar_address: profile.stellarAddress,
            email: profile.email,
          }),
        });
        const data = await res.json();
        if (res.ok && data.matched && data.rider) {
          await loadDeliveries();
        }
      } catch {
        // El repartidor puede completar su Ficha de Confianza normalmente
      }
    },
    [rider?.isLoggedIn, rider?.riderVerified, nameInput]
  );

  useEffect(() => {
    if (!isPollarAuthenticated) {
      skipAutoPollarLoginRef.current = false;
      pollarLookupKeyRef.current = "";
    }
  }, [isPollarAuthenticated]);

  // "Modo Megas": comprime a WebP (< 80 KB, máx. 1080px) antes de subir a rider-verifications
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
        setOnboardingError(
          translateBackendMessage(
            data.error || "No se pudo subir tu foto. Intenta de nuevo."
          )
        );
        return;
      }

      if (kind === "selfie") {
        setSelfieUrlInput(data.publicUrl);
      } else {
        setCiPhotoUrlInput(data.publicUrl);
      }
    } catch {
      setOnboardingError("No se pudo guardar la foto. Revisa tu conexión.");
    } finally {
      if (kind === "selfie") {
        setIsUploadingSelfie(false);
      } else {
        setIsUploadingCiPhoto(false);
      }
    }
  };

  const handleOnboardingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setOnboardingError(null);

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

    setIsSubmittingOnboarding(true);
    try {
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
          selfieUrl: selfieUrlInput,
          ciPhotoUrl: ciPhotoUrlInput,
          pollar_user_id: pollarDraft.pollarUserId || undefined,
          stellar_address: pollarDraft.stellarAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOnboardingError(
          translateBackendMessage(
            data.error || "No se pudo completar tu registro."
          )
        );
        return;
      }

      setRider(data.rider);
      setDeliveries(data.deliveries || []);
      setOrders(data.orders || []);
      void syncRiderPollarInBackground(data.rider);
      setFeedbackMsg(
        "¡Credencial oficial activada! Ya puedes tomar pedidos del barrio."
      );
      setActiveTab("disponibles");
    } finally {
      setIsSubmittingOnboarding(false);
    }
  };

  const handleRiderLogout = async () => {
    skipAutoPollarLoginRef.current = true;
    const res = await fetch("/api/deliveries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rider_logout" }),
    });
    const data = await res.json();
    setRider(data.rider || null);
    setFeedbackMsg(null);
    setFeedbackError(null);
  };

  const handleCopyInviteCode = async () => {
    if (!rider?.riderInviteCode) return;
    try {
      await navigator.clipboard.writeText(rider.riderInviteCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2500);
    }
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
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(
          translateBackendMessage(data.error || "No se pudo tomar el pedido.")
        );
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
    } finally {
      setActionBusyId(null);
    }
  };

  const handleValidatePickup = async (deliveryId: string) => {
    const pin = (pinInputs[deliveryId] || "").trim();
    if (pin.length !== 4) {
      setFeedbackError("Ingresa el código de 4 números para confirmar el recojo.");
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
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(
          translateBackendMessage(
            data.error || "Código de recojo incorrecto. Revísalo con la caserita."
          )
        );
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
    } finally {
      setActionBusyId(null);
    }
  };

  const handleValidateDelivery = async (deliveryId: string) => {
    const pin = (pinInputs[deliveryId] || "").trim();
    if (pin.length !== 4) {
      setFeedbackError("Ingresa el código de 4 números del vecino para confirmar la entrega.");
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
      const data = await res.json();
      if (!res.ok) {
        setFeedbackError(
          translateBackendMessage(
            data.error || "Código de entrega incorrecto. Revísalo con el vecino."
          )
        );
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
    } finally {
      setActionBusyId(null);
    }
  };

  const orderById = new Map(orders.map((o) => [o.id, o]));

  const availableDeliveries = deliveries.filter(
    (d) => normalizeStatus(d.delivery_status) === "pending" && !d.rider_id
  );

  const inProgressDeliveries = deliveries.filter((d) => {
    const st = normalizeStatus(d.delivery_status);
    if (st === "in_transit") {
      return !rider || !d.rider_id || d.rider_id === rider.id;
    }
    if (st === "pending" && rider && d.rider_id === rider.id) {
      return true;
    }
    return false;
  });

  const completedDeliveries = deliveries.filter((d) => {
    const st = normalizeStatus(d.delivery_status);
    return (
      st === "delivered" &&
      (!rider || !d.rider_id || d.rider_id === rider.id)
    );
  });

  const subsidizedCount = completedDeliveries.filter(
    (d) => d.subsidized_by_reserve || d.used_free_delivery
  ).length;

  const isRiderVerified = Boolean(rider?.isLoggedIn && rider?.riderVerified);
  const totalEarnedBs = Math.round(rider?.motesEarned ?? 0);

  // Pantalla de Ficha de Confianza del Repartidor de Barrio
  if (!isLoading && !isRiderVerified) {
    return (
      <div className="min-h-screen bg-bosque text-arena font-sans flex flex-col justify-center px-4 py-8">
        <div className="max-w-md w-full mx-auto space-y-5">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena"
          >
            ← Inicio
          </Link>

          <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-[#111C18] border border-arena/20 opacity-85">
            <div className="py-2.5 px-2 rounded-xl bg-madera/50 border border-oro/40 text-xs font-extrabold text-brillo text-center">
              🔒 Disponibles
            </div>
            <div className="py-2.5 px-2 rounded-xl text-xs font-bold text-arena/70 text-center">
              🚲 En Curso
            </div>
            <div className="py-2.5 px-2 rounded-xl text-xs font-bold text-arena/70 text-center">
              💵 Ganancias
            </div>
          </div>

          <div className="rounded-2xl bg-gradient-to-b from-[#1B2C26] to-[#121D19] border-2 border-brote/70 p-6 sm:p-7 shadow-green-glow space-y-5">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brote via-oro to-madera p-0.5 flex items-center justify-center shadow-md">
                <div className="w-full h-full rounded-2xl bg-bosque flex items-center justify-center text-3xl">
                  🛡️
                </div>
              </div>
              <span className="inline-block px-3 py-1 rounded-full bg-oro/25 border border-oro/60 text-brillo text-xs font-extrabold uppercase tracking-wider">
                Repartidor de Barrio
              </span>
              <h1 className="font-brand text-2xl sm:text-3xl text-arena">
                Credencial de Confianza
              </h1>
              <p className="text-sm text-arena/90 leading-relaxed">
                Registra tus datos para recibir tu credencial oficial{" "}
                <strong className="text-brillo">ECO-R-XXXX</strong> y empezar a
                repartir en tu zona.
              </p>
            </div>

            <PollarWalletSection
              role="rider"
              mode="auth-entry"
              compact
              onSynced={handleRiderPollarSynced}
              onPollarProfileLoaded={handlePollarRiderProfile}
            />

            {onboardingError && (
              <div className="p-3.5 rounded-xl bg-red-500/20 border border-red-400/60 text-sm font-bold text-red-100 text-center">
                ⚠️ {onboardingError}
              </div>
            )}

            <form onSubmit={handleOnboardingSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  1. Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Ej. Oliver Lujan"
                  className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    2. WhatsApp de Contacto *
                  </label>
                  <input
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Ej. 64065089"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brillo"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-arena mb-1">
                    3. Número de Carnet (CI) *
                  </label>
                  <input
                    type="text"
                    required
                    value={ciInput}
                    onChange={(e) => setCiInput(e.target.value)}
                    placeholder="Ej. 8492014 LP"
                    className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brillo"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1">
                  4. Dirección de Domicilio *
                </label>
                <input
                  type="text"
                  required
                  value={addressInput}
                  onChange={(e) => setAddressInput(e.target.value)}
                  placeholder="Zona, calle y número de domicilio"
                  className="w-full px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote/50 text-arena text-base focus:outline-none focus:border-brillo"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-arena mb-1.5">
                  5. Tu Vehículo Ecológico *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setVehicleInput("bicicleta")}
                    className={`p-3.5 rounded-2xl border-2 text-center transition space-y-1 ${
                      vehicleInput === "bicicleta"
                        ? "bg-brote/25 border-brote text-brillo shadow-green-glow"
                        : "bg-bosque border-arena/25 text-arena/85 hover:border-oro"
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
                    className={`p-3.5 rounded-2xl border-2 text-center transition space-y-1 ${
                      vehicleInput === "moto_electrica"
                        ? "bg-oro/25 border-oro text-brillo shadow-gold-glow"
                        : "bg-bosque border-arena/25 text-arena/85 hover:border-oro"
                    }`}
                  >
                    <span className="text-3xl block">🛵</span>
                    <span className="text-sm font-extrabold block">
                      Moto Eléctrica
                    </span>
                  </button>
                </div>
              </div>

              {/* Mensaje de confianza comunitaria junto a selfie y foto de CI */}
              <div className="rounded-2xl bg-[#202B1C] border-2 border-oro/65 p-4 space-y-1.5">
                <span className="text-xs font-extrabold uppercase text-brillo block">
                  🤝 Confianza en Comunidad
                </span>
                <p className="text-sm font-semibold text-arena leading-relaxed">
                  Nuestras caseritas cuidan a su barrio. Tu foto y CI solo
                  sirven para darte tu credencial oficial{" "}
                  <strong className="text-brillo">ECO-R-XXXX</strong> y que te
                  elijan como repartidor de confianza.
                </p>
              </div>

              {/* 6. Selfie frontal del rostro descubierto (WebP Modo Megas) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-brillo">
                  6. Selfie Frontal (Rostro Descubierto) *
                </label>
                <p className="text-xs font-semibold text-arena bg-madera/40 border border-oro/50 rounded-xl px-3.5 py-2">
                  📸 Toma una foto clara de tu rostro, sin gorra ni lentes
                  oscuros
                </p>

                <label className="block w-full rounded-2xl border-2 border-dashed border-oro/70 bg-bosque/90 p-4 text-center cursor-pointer hover:border-brillo transition">
                  {selfieUrlInput ? (
                    <div className="space-y-2">
                      <img
                        src={selfieUrlInput}
                        alt="Selfie de verificación"
                        className="w-24 h-24 rounded-2xl object-cover mx-auto border-2 border-brote"
                      />
                      <span className="inline-block text-sm font-bold text-brote">
                        ✅ Selfie cargada · Toca para cambiar
                      </span>
                    </div>
                  ) : (
                    <div className="py-3 space-y-1">
                      <div className="text-3xl">🤳</div>
                      <span className="block text-sm font-extrabold text-brillo">
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
                      if (file) void handleVerificationPhotoUpload(file, "selfie");
                    }}
                    className="hidden"
                  />
                </label>
              </div>

              {/* 7. Foto del Carnet de Identidad (CI) obligatoria (WebP Modo Megas) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase text-brillo">
                  7. Foto de tu Carnet de Identidad (CI) *
                </label>

                <label className="block w-full rounded-2xl border-2 border-dashed border-brote/65 bg-bosque/90 p-4 text-center cursor-pointer hover:border-brillo transition">
                  {ciPhotoUrlInput ? (
                    <div className="space-y-2">
                      <img
                        src={ciPhotoUrlInput}
                        alt="Foto del Carnet de Identidad"
                        className="w-36 h-24 rounded-xl object-cover mx-auto border-2 border-brote"
                      />
                      <span className="inline-block text-sm font-bold text-brote">
                        ✅ Foto de CI cargada · Toca para cambiar
                      </span>
                    </div>
                  ) : (
                    <div className="py-3 space-y-1">
                      <div className="text-3xl">🪪</div>
                      <span className="block text-sm font-extrabold text-brillo">
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
                      if (file) void handleVerificationPhotoUpload(file, "ci");
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
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-brote via-[#5cd060] to-brote text-bosque font-brand text-lg sm:text-xl shadow-green-glow border-2 border-white/40 active:scale-95 transition disabled:opacity-60"
              >
                {isSubmittingOnboarding
                  ? "Activando tu libreta digital..."
                  : "Activar mi Credencial Oficial →"}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bosque text-arena font-sans pb-16">
      <main className="max-w-md sm:max-w-2xl mx-auto px-4 pt-6 space-y-5">
        {/* Barra superior */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-sm font-bold text-arena"
          >
            ← Inicio
          </Link>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadDeliveries}
              className="px-3.5 py-2.5 rounded-xl bg-[#182822] border border-arena/25 text-xs sm:text-sm font-bold text-arena hover:text-brillo"
            >
              🔄 Actualizar
            </button>
            <button
              type="button"
              onClick={handleRiderLogout}
              className="px-3.5 py-2.5 rounded-xl bg-red-500/20 border border-red-400/50 text-red-200 text-xs sm:text-sm font-bold"
            >
              Salir
            </button>
          </div>
        </div>

        {/* Cabecera del Repartidor Verificado (Solo Bs y MOTES, cero USDC/Stellar/Pollar) */}
        <header className="rounded-2xl bg-gradient-to-b from-[#1B2C26] to-[#121D19] border-2 border-brote/60 p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {rider?.selfieUrl ? (
                <img
                  src={rider.selfieUrl}
                  alt={rider.name}
                  className="w-16 h-16 rounded-2xl object-cover border-2 border-brote shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-brote/20 border-2 border-brote flex items-center justify-center text-3xl shrink-0">
                  {rider?.vehicleType === "moto_electrica" ? "🛵" : "🚲"}
                </div>
              )}
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full bg-brote text-bosque text-xs font-extrabold uppercase">
                    ✅ De Confianza
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-oro/25 border border-oro/60 text-brillo text-xs font-extrabold uppercase">
                    {rider?.vehicleType === "moto_electrica"
                      ? "🛵 Moto Eléctrica"
                      : "🚲 Bicicleta"}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-brote/20 border border-brote/60 text-arena text-[11px] font-extrabold uppercase">
                    💳 MOTES + Bs Activos
                  </span>
                </div>
                <h1 className="font-brand text-xl sm:text-2xl text-arena truncate">
                  {rider?.name}
                </h1>
                <p className="text-xs text-arena/85 truncate">
                  📱 {rider?.phone} · 🪪 CI: {rider?.ciNumber}
                </p>
              </div>
            </div>

            <div className="text-right shrink-0">
              <span className="text-xs font-bold uppercase text-arena/85 block">
                Ganado
              </span>
              <span className="font-brand text-2xl text-brillo block">
                {formatBs(totalEarnedBs)}
              </span>
              <span className="text-xs font-extrabold text-brote">
                {formatMotes(totalEarnedBs)}
              </span>
            </div>
          </div>

          {/* Credencial Oficial ECO-R-XXXX */}
          {rider?.riderInviteCode && (
            <div className="rounded-xl bg-[#0B1410] border-2 border-oro/60 p-3.5 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs font-extrabold uppercase tracking-wider text-arena/85 block">
                    🪪 Tu Credencial Oficial de Repartidor
                  </span>
                  <span className="font-mono text-2xl font-extrabold tracking-widest text-brillo">
                    {rider.riderInviteCode}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyInviteCode}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold text-xs uppercase shadow active:scale-95 transition"
                >
                  {copiedCode ? "✅ ¡Copiado!" : "📋 Copiar credencial"}
                </button>
              </div>
              <p className="text-xs text-arena/90 leading-snug">
                Comparte esta credencial para que las caseritas de tu zona te
                elijan como su repartidor de confianza.
              </p>
            </div>
          )}

          {rider?.isLoggedIn && (
            <PollarWalletSection
              role="rider"
              userId={rider.id}
              savedStellarAddress={rider.stellar_address}
              savedPollarUserId={rider.pollar_user_id}
              mode="profile-badge"
              onSynced={handleRiderPollarSynced}
            />
          )}
        </header>

        {/* Mensajes de estado */}
        {feedbackMsg && (
          <div className="p-4 rounded-2xl bg-brote/25 border-2 border-brote text-sm font-bold text-arena">
            ✅ {feedbackMsg}
          </div>
        )}
        {feedbackError && (
          <div className="p-4 rounded-2xl bg-red-500/20 border-2 border-red-400/60 text-sm font-bold text-red-100">
            ⚠️ {feedbackError}
          </div>
        )}

        {/* 3 Pestañas del Repartidor */}
        <nav
          aria-label="Secciones del Repartidor"
          className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-[#111C18] border-2 border-arena/20"
        >
          <button
            type="button"
            onClick={() => setActiveTab("disponibles")}
            className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
              activeTab === "disponibles"
                ? "bg-gradient-to-r from-oro to-brillo text-bosque shadow"
                : "text-arena/85 hover:text-brillo"
            }`}
          >
            📦 Disponibles ({availableDeliveries.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("en_curso")}
            className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
              activeTab === "en_curso"
                ? "bg-gradient-to-r from-brote to-[#5cd060] text-bosque shadow"
                : "text-arena/85 hover:text-brillo"
            }`}
          >
            🚲 En Curso ({inProgressDeliveries.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ganancias")}
            className={`py-3 px-2 rounded-xl text-xs sm:text-sm font-extrabold transition ${
              activeTab === "ganancias"
                ? "bg-gradient-to-r from-oro via-brillo to-oro text-bosque shadow"
                : "text-arena/85 hover:text-brillo"
            }`}
          >
            💵 Ganancias ({completedDeliveries.length})
          </button>
        </nav>

        {/* PESTAÑA 1: PEDIDOS DISPONIBLES */}
        {activeTab === "disponibles" && (
          <section aria-label="Pedidos Disponibles" className="space-y-4">
            {isLoading ? (
              <div className="h-40 rounded-2xl bg-[#182721] animate-pulse" />
            ) : availableDeliveries.length === 0 ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-[#14221D] border-2 border-arena/20 p-8 text-center space-y-2">
                  <div className="text-4xl">🚲</div>
                  <h2 className="font-brand text-xl text-arena">
                    No hay pedidos disponibles por ahora
                  </h2>
                  <p className="text-sm text-arena/85">
                    Cuando un vecino haga un pedido en tu zona, aparecerá aquí
                    para que lo recojas.
                  </p>
                </div>

                {(inProgressDeliveries.length > 0 ||
                  completedDeliveries.length > 0) && (
                  <div className="rounded-2xl bg-[#14221D] border-2 border-oro/40 p-4 space-y-3">
                    <h3 className="font-brand text-lg text-arena">
                      📋 Entregas Recientes y Contratos On-Chain
                    </h3>
                    {[...inProgressDeliveries, ...completedDeliveries].map(
                      (del) => {
                        const order = orderById.get(del.order_id);
                        return (
                          <div
                            key={`recent-${del.id}`}
                            className="p-3.5 rounded-xl bg-bosque border border-arena/20 space-y-2.5"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                              <span className="font-bold text-arena">
                                {del.product_name} ({del.seller_name} →{" "}
                                {del.buyer_name})
                              </span>
                              <span className="font-extrabold text-brillo uppercase">
                                {normalizeStatus(del.delivery_status) ===
                                "delivered"
                                  ? "✅ Entregado"
                                  : "🚲 En Curso"}
                              </span>
                            </div>
                            <OnChainEscrowAuditLinks
                              contractId={
                                del.contract_id || order?.contract_id
                              }
                              engagementId={
                                del.engagement_id || order?.engagement_id
                              }
                              fundTxHash={
                                del.fund_tx_hash || order?.fund_tx_hash
                              }
                              releaseTxHash={
                                del.release_tx_hash || order?.release_tx_hash
                              }
                              compact
                            />
                          </div>
                        );
                      }
                    )}
                  </div>
                )}
              </div>
            ) : (
              availableDeliveries.map((del) => {
                const order = orderById.get(del.order_id);
                const isBusy = actionBusyId === del.id;
                const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));
                return (
                  <article
                    key={del.id}
                    className="rounded-2xl bg-gradient-to-br from-[#1B2B24] to-[#111C18] border-2 border-oro/45 p-4 sm:p-5 space-y-4 shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <span className="font-mono text-xs font-extrabold text-brillo block">
                          {formatOrderCode(
                            del.contract_id || order?.contract_id
                          )}
                        </span>
                        <h2 className="font-brand text-xl text-arena">
                          {del.product_name}
                        </h2>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="px-3 py-1.5 rounded-xl bg-brote/25 border-2 border-brote text-base font-brand text-brillo block">
                          +{formatBs(feeBs)}
                        </span>
                        <span className="text-[11px] font-bold text-arena/85 block mt-0.5">
                          ({formatMotes(feeBs)})
                        </span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-bosque border border-arena/20 p-3.5 space-y-1.5 text-sm">
                      <p className="text-arena">
                        🏪 <strong>Recoger en:</strong> {del.seller_name}
                        {del.pickup_address ? ` (${del.pickup_address})` : ""}
                      </p>
                      <p className="text-arena">
                        📍 <strong>Entregar a:</strong> {del.buyer_name}
                        {del.delivery_address
                          ? ` · ${del.delivery_address}`
                          : ""}
                      </p>
                      <p className="text-brote font-bold text-xs pt-0.5">
                        {del.subsidized_by_reserve || del.used_free_delivery
                          ? "🚲 Envío ecológico cubierto por EcoBanco · Comisión: 0 Bs"
                          : "🚲 Entrega de barrio · Comisión: 0 Bs — Cubierta por EcoBanco"}
                      </p>
                    </div>

                    <OnChainEscrowAuditLinks
                      contractId={del.contract_id || order?.contract_id}
                      engagementId={del.engagement_id || order?.engagement_id}
                      fundTxHash={del.fund_tx_hash || order?.fund_tx_hash}
                      releaseTxHash={
                        del.release_tx_hash || order?.release_tx_hash
                      }
                      compact
                    />

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAcceptDelivery(del.id)}
                      className="w-full py-4 px-4 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg tracking-wide shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-95 transition"
                    >
                      {isBusy ? "Tomando pedido..." : "Tomar este Pedido →"}
                    </button>
                  </article>
                );
              })
            )}
          </section>
        )}

        {/* PESTAÑA 2: EN CURSO CON CÓDIGOS PIN GIGANTES DICTABLES EN VOZ ALTA */}
        {activeTab === "en_curso" && (
          <section aria-label="Pedidos En Curso" className="space-y-4">
            {inProgressDeliveries.length === 0 ? (
              <div className="rounded-2xl bg-[#14221D] border-2 border-arena/20 p-8 text-center space-y-2">
                <div className="text-4xl">🚲</div>
                <h2 className="font-brand text-xl text-arena">
                  No tienes entregas en curso
                </h2>
                <p className="text-sm text-arena/85">
                  Toma un pedido en Disponibles para recogerlo donde la caserita
                  y llevarlo al vecino.
                </p>
              </div>
            ) : (
              inProgressDeliveries.map((del) => {
                const status = normalizeStatus(del.delivery_status);
                const isBusy = actionBusyId === del.id;
                const order = orderById.get(del.order_id);
                const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));

                return (
                  <article
                    key={del.id}
                    className="rounded-2xl bg-gradient-to-br from-[#1B2B24] to-[#111C18] border-2 border-brote/70 p-4 sm:p-5 space-y-4 shadow-lg"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="font-mono text-xs font-extrabold text-brillo">
                            {formatOrderCode(
                              del.contract_id || order?.contract_id
                            )}
                          </span>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-xs font-extrabold uppercase ${
                              status === "in_transit"
                                ? "bg-oro text-bosque"
                                : "bg-brote text-bosque"
                            }`}
                          >
                            {status === "in_transit"
                              ? "🚲 En Camino al Vecino"
                              : "🏪 Recoger en Puesto"}
                          </span>
                        </div>
                        <h2 className="font-brand text-xl text-arena">
                          {del.product_name}
                        </h2>
                      </div>
                      <span className="font-brand text-lg text-brillo shrink-0">
                        +{formatBs(feeBs)}
                      </span>
                    </div>

                    <div className="rounded-xl bg-bosque border border-arena/20 p-3.5 space-y-1.5 text-sm">
                      <p className="text-arena">
                        🏪 <strong>Caserita:</strong> {del.seller_name}
                        {del.pickup_address ? ` · ${del.pickup_address}` : ""}
                      </p>
                      <p className="text-arena">
                        📍 <strong>Vecino:</strong> {del.buyer_name}
                        {del.delivery_address
                          ? ` · ${del.delivery_address}`
                          : ""}
                      </p>
                    </div>

                    <OnChainEscrowAuditLinks
                      contractId={del.contract_id || order?.contract_id}
                      engagementId={del.engagement_id || order?.engagement_id}
                      fundTxHash={del.fund_tx_hash || order?.fund_tx_hash}
                      releaseTxHash={
                        del.release_tx_hash || order?.release_tx_hash
                      }
                      compact
                    />

                    {status === "pending" ? (
                      <div className="rounded-2xl bg-[#0B1410] border-2 border-oro p-4 sm:p-5 space-y-4">
                        <div className="text-center space-y-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-oro block">
                            Paso 1 · Al recoger en el puesto
                          </span>
                          <p className="text-base font-bold text-arena">
                            Dile este código a tu caserita al recoger:
                          </p>
                          <div className="py-2 px-4 rounded-2xl bg-bosque border-2 border-brillo inline-block">
                            <span className="font-mono text-5xl font-bold tracking-[0.22em] text-brillo">
                              {del.pickup_pin}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-arena/15">
                          <label className="block text-xs font-bold uppercase text-arena text-center">
                            Escribe el código de 4 números para confirmar que ya
                            recogiste el pedido:
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={pinInputs[del.id] || ""}
                              onChange={(e) =>
                                setPinInputs((prev) => ({
                                  ...prev,
                                  [del.id]: e.target.value.replace(/\D/g, ""),
                                }))
                              }
                              placeholder="0000"
                              className="sm:w-40 px-4 py-3.5 rounded-xl bg-bosque border-2 border-oro font-mono text-2xl font-bold tracking-[0.25em] text-center text-brillo focus:outline-none focus:border-brillo"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleValidatePickup(del.id)}
                              className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg shadow-gold-glow"
                            >
                              {isBusy
                                ? "Confirmando recojo..."
                                : "Confirmar Recojo →"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl bg-[#0B1410] border-2 border-brote p-4 sm:p-5 space-y-4">
                        <div className="text-center space-y-2">
                          <span className="text-xs font-extrabold uppercase tracking-wider text-brote block">
                            Paso 2 · Al entregar al vecino
                          </span>
                          <p className="text-base font-bold text-arena">
                            Dile este código al vecino al entregar:
                          </p>
                          <div className="py-2 px-4 rounded-2xl bg-bosque border-2 border-brote inline-block">
                            <span className="font-mono text-5xl font-bold tracking-[0.22em] text-brillo">
                              {del.delivery_pin}
                            </span>
                          </div>
                        </div>

                        <div className="space-y-2 pt-2 border-t border-arena/15">
                          <label className="block text-xs font-bold uppercase text-arena text-center">
                            Escribe el código de 4 números para confirmar la
                            entrega y cobrar:
                          </label>
                          <div className="flex flex-col sm:flex-row gap-2.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              maxLength={4}
                              value={pinInputs[del.id] || ""}
                              onChange={(e) =>
                                setPinInputs((prev) => ({
                                  ...prev,
                                  [del.id]: e.target.value.replace(/\D/g, ""),
                                }))
                              }
                              placeholder="0000"
                              className="sm:w-40 px-4 py-3.5 rounded-xl bg-bosque border-2 border-brote font-mono text-2xl font-bold tracking-[0.25em] text-center text-brillo focus:outline-none focus:border-brillo"
                            />
                            <button
                              type="button"
                              disabled={isBusy}
                              onClick={() => handleValidateDelivery(del.id)}
                              className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-brote to-[#5cd060] text-bosque font-brand text-lg shadow-green-glow"
                            >
                              {isBusy
                                ? "Confirmando entrega..."
                                : "Confirmar Entrega y Cobrar ✓"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })
            )}
          </section>
        )}

        {/* PESTAÑA 3: MIS GANANCIAS (SOLO Bs Y MOTES, SIN USDC NI DECIMALES) */}
        {activeTab === "ganancias" && (
          <section aria-label="Mis Ganancias" className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl bg-gradient-to-b from-[#1A2A25] to-[#101A17] border-2 border-oro/70 p-5 shadow-wallet-inner wallet-inset">
                <span className="text-xs font-extrabold uppercase tracking-wider text-arena block">
                  Dinero Disponible (Bs)
                </span>
                <div className="my-2 flex items-baseline gap-1.5">
                  <span className="font-brand text-4xl text-brillo">
                    {totalEarnedBs}
                  </span>
                  <span className="text-lg font-extrabold text-oro">Bs</span>
                </div>
                <p className="text-xs text-brote font-bold">
                  🛡️ Comisión: 0 Bs — Cubierta por EcoBanco
                </p>
                <p className="text-xs text-arena/85 mt-1">
                  🚲 {subsidizedCount} entregas cubiertas por EcoBanco
                </p>
              </div>

              <div className="rounded-2xl bg-gradient-to-br from-[#1B3326] via-[#172820] to-[#292315] border-2 border-brote/80 p-5 shadow-wallet-inner wallet-inset">
                <span className="text-xs font-extrabold uppercase tracking-wider text-brillo block">
                  Puntos de Trueque (MOTES)
                </span>
                <div className="my-2 flex items-baseline gap-1.5">
                  <span className="font-brand text-4xl text-brillo">
                    {totalEarnedBs}
                  </span>
                  <span className="text-sm font-extrabold text-brote uppercase">
                    MOTES
                  </span>
                </div>
                <p className="text-xs font-bold text-arena">
                  1 MOTE = 1 Bs en productos del barrio
                </p>
                <p className="text-xs text-arena/85 mt-1">
                  {rider?.completedDeliveries ?? 0} entregas completadas
                </p>
              </div>
            </div>

            <div className="rounded-2xl bg-[#14221D] border-2 border-arena/20 p-5 space-y-3.5">
              <h2 className="font-brand text-xl text-arena">
                Historial de Entregas ({completedDeliveries.length})
              </h2>

              {completedDeliveries.length === 0 ? (
                <p className="text-sm text-arena/85">
                  Completa tu primera entrega confirmando el código con el
                  vecino para ver aquí tus ganancias en Bolivianos (Bs).
                </p>
              ) : (
                <div className="space-y-2.5">
                  {completedDeliveries.map((del) => {
                    const order = orderById.get(del.order_id);
                    const feeBs = Math.round(Number(del.delivery_fee_motes ?? 5));
                    return (
                      <div
                        key={del.id}
                        className="p-4 rounded-xl bg-bosque border border-brote/45 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="font-mono text-xs font-bold text-brillo block">
                              {formatOrderCode(
                                del.contract_id || order?.contract_id
                              )}{" "}
                              · ✅ Entregado
                            </span>
                            <h3 className="font-bold text-sm text-arena">
                              {del.product_name}
                            </h3>
                            <p className="text-xs text-arena/85">
                              {del.seller_name} → {del.buyer_name}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-brand text-xl text-brillo block">
                              +{formatBs(feeBs)}
                            </span>
                            <span className="text-xs font-bold text-brote">
                              +{formatMotes(feeBs)}
                            </span>
                          </div>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
