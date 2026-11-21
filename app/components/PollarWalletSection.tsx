"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePollar } from "@pollar/react";
import {
  ensurePollarWalletAndSync,
  ensurePollarWalletProvisioned,
  extractPollarUserId,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";
import {
  COMMUNITY_COPY,
  formatBs,
  formatMotes,
  sanitizeUserError,
  translateBackendMessage,
} from "@/app/lib/friendlyCopy";
import {
  BankQrRechargeModal,
  RampCreditedEvent,
  RampPendingEvent,
  RampPurpose,
} from "@/app/components/BankQrRechargeModal";

export interface PollarProfileSnapshot {
  email?: string;
  name?: string;
  pollarUserId?: string | null;
  stellarAddress?: string | null;
}

interface PollarWalletSectionProps {
  role: "buyer" | "merchant" | "rider";
  userId?: string;
  savedStellarAddress?: string | null;
  savedPollarUserId?: string | null;
  mode?: "auth-entry" | "profile-badge" | "card";
  compact?: boolean;
  balanceBs?: number;
  balanceMotes?: number;
  rechargeAmountBs?: number;
  rechargePurpose?: RampPurpose;
  rechargeSubtitle?: string;
  movementsHref?: string;
  movementsCount?: number;
  onOpenRecharge?: () => void;
  onViewMovements?: () => void;
  onRampCredited?: (event: RampCreditedEvent) => void;
  onRampPending?: (event: RampPendingEvent) => void;
  onRampError?: (message: string) => void;
  onSynced?: (result: PollarSyncResult) => void;
  onPollarProfileLoaded?: (profile: PollarProfileSnapshot) => void;
}

export function PollarWalletSection({
  role,
  userId,
  savedStellarAddress,
  savedPollarUserId,
  mode = "card",
  compact = false,
  balanceBs = 0,
  balanceMotes = 0,
  rechargeAmountBs = 50,
  rechargePurpose = "fiat_topup",
  rechargeSubtitle,
  movementsHref = "#mis-movimientos",
  movementsCount,
  onOpenRecharge,
  onViewMovements,
  onRampCredited,
  onRampPending,
  onRampError,
  onSynced,
  onPollarProfileLoaded,
}: PollarWalletSectionProps) {
  const { getClient, isAuthenticated, wallet, hasWallet } = usePollar();

  const client = getClient();
  const [syncResult, setSyncResult] = useState<PollarSyncResult | null>(null);
  const [isRechargeModalOpen, setIsRechargeModalOpen] =
    useState<boolean>(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const onProfileRef = useRef(onPollarProfileLoaded);
  onProfileRef.current = onPollarProfileLoaded;
  const lastProfileKeyRef = useRef<string>("");
  const lastSyncKeyRef = useRef<string>("");

  // Escucha de estado en silencio para mantener sincronizada la cuenta en segundo plano
  useEffect(() => {
    const unsubscribe = client.onAuthStateChange((next) => {
      if (next.step === "idle") {
        setSyncResult(null);
        lastProfileKeyRef.current = "";
        lastSyncKeyRef.current = "";
      }
    });
    return unsubscribe;
  }, [client]);

  const runSync = useCallback(
    async (force = false) => {
      if (!isAuthenticated) return;
      const syncKey = `${role}:${userId || "anon"}:${wallet?.address || ""}:${
        wallet?.provisioning || ""
      }`;
      if (!force && lastSyncKeyRef.current === syncKey) {
        return;
      }
      lastSyncKeyRef.current = syncKey;

      try {
        const result = userId
          ? await ensurePollarWalletAndSync(client, { userId, role })
          : await ensurePollarWalletProvisioned(client);

        setSyncResult(result);
        if (result.synced) {
          onSyncedRef.current?.(result);
        }

        const profile = client.getUserProfile();
        const email =
          profile?.mail || profile?.providers?.email?.address || undefined;
        const name = [profile?.first_name, profile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        const pollarUserId =
          result.pollarUserId || extractPollarUserId(client) || null;
        const stellarAddress =
          result.stellarAddress || client.getWallet()?.address || null;
        const profileKey = `${pollarUserId || ""}|${stellarAddress || ""}|${
          email || ""
        }|${name || ""}`;

        if (
          (pollarUserId || stellarAddress || email) &&
          profileKey !== lastProfileKeyRef.current
        ) {
          lastProfileKeyRef.current = profileKey;
          onProfileRef.current?.({
            email,
            name: name || undefined,
            pollarUserId,
            stellarAddress,
          });
        }
      } catch {
        // Inicialización silenciosa: nunca muestra errores técnicos al usuario
      }
    },
    [client, isAuthenticated, role, userId, wallet?.address, wallet?.provisioning]
  );

  // Inicialización silenciosa en segundo plano
  useEffect(() => {
    if (!isAuthenticated) return;

    const alreadyPersisted =
      Boolean(userId) &&
      Boolean(savedPollarUserId) &&
      Boolean(savedStellarAddress) &&
      (!wallet?.address || savedStellarAddress === wallet.address) &&
      wallet?.provisioning === "READY" &&
      syncResult?.trustlineReady;

    if (alreadyPersisted) return;

    void runSync(false);
  }, [
    isAuthenticated,
    userId,
    savedPollarUserId,
    savedStellarAddress,
    wallet?.address,
    wallet?.provisioning,
    hasWallet,
    syncResult?.trustlineReady,
    runSync,
  ]);

  // En pantallas de ingreso o registro, corre únicamente en silencio sin mostrar elementos de acceso técnico
  if (mode === "auth-entry") {
    return null;
  }

  const handleRechargeClick = () => {
    setLocalFeedback(null);
    setLocalError(null);
    if (onOpenRecharge) {
      onOpenRecharge();
      return;
    }
    setIsRechargeModalOpen(true);
  };

  const modalRole: "buyer" | "merchant" =
    role === "merchant" ? "merchant" : "buyer";

  return (
    <>
      <section
        aria-label={COMMUNITY_COPY.walletTitle}
        className={`rounded-2xl eco-card-gold ${
          compact ? "p-4 space-y-3.5" : "p-5 space-y-4"
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xl" aria-hidden="true">
              📒
            </span>
            <h2 className="font-brand text-xl sm:text-2xl eco-text leading-none">
              {COMMUNITY_COPY.walletTitle}
            </h2>
          </div>
          <span className="px-3 py-1 rounded-full eco-alert-success text-xs font-extrabold">
            {COMMUNITY_COPY.moteParity}
          </span>
        </div>

        {/* Saldo claro en Bs y MOTES */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl eco-inset p-3.5 space-y-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider eco-text-muted">
              {COMMUNITY_COPY.balanceBsLabel}
            </span>
            <span className="block font-brand text-2xl sm:text-3xl eco-text-gold">
              {formatBs(balanceBs)}
            </span>
          </div>

          <div className="rounded-xl eco-inset p-3.5 space-y-1">
            <span className="block text-[11px] font-extrabold uppercase tracking-wider eco-text-muted">
              {COMMUNITY_COPY.balanceMotesLabel}
            </span>
            <span className="block font-brand text-2xl sm:text-3xl eco-text-green">
              {formatMotes(balanceMotes)}
            </span>
          </div>
        </div>

        <p className="text-xs font-semibold eco-text-muted text-center">
          {COMMUNITY_COPY.moteParityDetail} · {COMMUNITY_COPY.zeroCommission}
        </p>

        {/* Botón grande Recargar con QR y acceso simple a Mis movimientos */}
        <div className="space-y-2.5">
          <button
            type="button"
            onClick={handleRechargeClick}
            className="w-full py-4 px-5 rounded-2xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-brand text-lg sm:text-xl shadow-gold-glow border-2 border-[#fff3cc]/70 active:scale-[0.98] transition"
          >
            📲 {COMMUNITY_COPY.rechargeCta}
          </button>

          {onViewMovements ? (
            <button
              type="button"
              onClick={onViewMovements}
              className="w-full py-3 px-4 rounded-xl eco-btn-ghost text-sm font-extrabold transition flex items-center justify-center gap-2"
            >
              <span>📋 {COMMUNITY_COPY.movementsCta}</span>
              {typeof movementsCount === "number" && (
                <span className="px-2 py-0.5 rounded-full bg-oro/20 eco-text-gold text-xs font-extrabold">
                  {movementsCount}
                </span>
              )}
              <span aria-hidden="true">→</span>
            </button>
          ) : (
            <Link
              href={movementsHref}
              className="w-full py-3 px-4 rounded-xl eco-btn-ghost text-sm font-extrabold transition flex items-center justify-center gap-2"
            >
              <span>📋 {COMMUNITY_COPY.movementsCta}</span>
              {typeof movementsCount === "number" && (
                <span className="px-2 py-0.5 rounded-full bg-oro/20 eco-text-gold text-xs font-extrabold">
                  {movementsCount}
                </span>
              )}
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>

        {localFeedback && (
          <p className="text-xs font-bold eco-text-green text-center">
            ✨ {localFeedback}
          </p>
        )}
        {localError && (
          <p className="text-xs font-bold text-red-600 dark:text-red-200 text-center">
            ⚠️ {localError}
          </p>
        )}
      </section>

      {!onOpenRecharge && (
        <BankQrRechargeModal
          open={isRechargeModalOpen}
          role={modalRole}
          userId={userId}
          purpose={rechargePurpose}
          amountBs={rechargeAmountBs}
          subtitle={
            rechargeSubtitle ||
            "Recarga saldo en Bolivianos (Bs) escaneando el QR desde la app de tu banco."
          }
          onRampCredited={(event) => {
            setIsRechargeModalOpen(false);
            setLocalError(null);
            if (onRampCredited) {
              onRampCredited(event);
            } else {
              setLocalFeedback(
                translateBackendMessage(event.message) ||
                  `¡Listo! Sumamos ${formatBs(
                    event.creditedBs
                  )} a tu libreta comunitaria.`
              );
            }
          }}
          onRampPending={(pending) => {
            if (onRampPending) {
              onRampPending(pending);
            } else {
              setLocalFeedback(COMMUNITY_COPY.rechargePendingNotice);
            }
          }}
          onRampError={(errMsg) => {
            const safeMsg = sanitizeUserError(errMsg);
            if (onRampError) {
              onRampError(safeMsg);
            } else {
              setLocalError(safeMsg);
            }
          }}
          onClose={() => setIsRechargeModalOpen(false)}
        />
      )}
    </>
  );
}
