"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { usePollar } from "@pollar/react";
import type { AuthState } from "@pollar/core";
import {
  ensurePollarWalletAndSync,
  ensurePollarWalletProvisioned,
  extractPollarUserId,
  formatShortStellarAddress,
  PollarSyncResult,
} from "@/app/lib/pollarWallet";

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
  mode?: "auth-entry" | "profile-badge";
  compact?: boolean;
  onSynced?: (result: PollarSyncResult) => void;
  onPollarProfileLoaded?: (profile: PollarProfileSnapshot) => void;
}

function describeAuthStep(authState: AuthState): string | null {
  switch (authState.step) {
    case "creating_session":
      return "Iniciando sesión segura en Pollar...";
    case "opening_oauth":
      return "Completa tu acceso con Google en la ventana emergente...";
    case "sending_email":
      return "Enviando código OTP a tu correo...";
    case "entering_code":
    case "verifying_email_code":
      return "Verificando código OTP de correo...";
    case "authenticating":
      return "Confirmando autenticación en Stellar Testnet...";
    default:
      return null;
  }
}

export function PollarWalletSection({
  role,
  userId,
  savedStellarAddress,
  savedPollarUserId,
  mode = "auth-entry",
  compact = false,
  onSynced,
  onPollarProfileLoaded,
}: PollarWalletSectionProps) {
  const {
    getClient,
    openLoginModal,
    login,
    logout,
    isAuthenticated,
    wallet,
    hasWallet,
    configStatus,
  } = usePollar();

  const client = getClient();
  const [authState, setAuthState] = useState<AuthState>(() =>
    client.getAuthState()
  );
  const [isProvisioning, setIsProvisioning] = useState<boolean>(false);
  const [syncResult, setSyncResult] = useState<PollarSyncResult | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  const onProfileRef = useRef(onPollarProfileLoaded);
  onProfileRef.current = onPollarProfileLoaded;
  const lastProfileKeyRef = useRef<string>("");
  const lastSyncKeyRef = useRef<string>("");

  useEffect(() => {
    const unsubscribe = client.onAuthStateChange((next) => {
      setAuthState(next);
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

      setIsProvisioning(true);
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
      } finally {
        setIsProvisioning(false);
      }
    },
    [client, isAuthenticated, role, userId, wallet?.address, wallet?.provisioning]
  );

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

  const effectiveAddress =
    syncResult?.stellarAddress || wallet?.address || savedStellarAddress || "";
  const shortAddress = formatShortStellarAddress(effectiveAddress);
  const provisioningState =
    syncResult?.provisioning || wallet?.provisioning || null;
  const activeStepMessage = describeAuthStep(authState);

  const handleCopyAddress = async () => {
    if (!effectiveAddress) return;
    try {
      await navigator.clipboard.writeText(effectiveAddress);
    } catch {
      // Fallback silencioso si el portapapeles está bloqueado
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (mode === "profile-badge") {
    return (
      <div className="rounded-xl bg-[#0D1714] border border-oro/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="px-2 py-0.5 rounded-full bg-oro/20 border border-oro/50 text-brillo font-extrabold uppercase">
            Stellar Testnet
          </span>

          {effectiveAddress ? (
            <>
              <span
                title={effectiveAddress}
                className="font-mono font-bold text-arena"
              >
                {shortAddress}
              </span>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="px-2 py-0.5 rounded-lg bg-bosque border border-arena/25 text-[11px] font-bold text-brillo hover:border-oro"
              >
                {copied ? "✓ Copiado" : "Copiar G..."}
              </button>
              {isAuthenticated ? (
                provisioningState === "READY" ? (
                  <span className="px-2 py-0.5 rounded-full bg-brote/25 border border-brote/60 text-arena font-bold">
                    {syncResult?.trustlineReady
                      ? "✓ USDC Testnet listo"
                      : isProvisioning
                      ? "⏳ Activando USDC..."
                      : "✓ Cuenta READY"}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full bg-oro/20 border border-oro/50 text-brillo font-bold">
                    ⏳ Preparando cuenta G...
                  </span>
                )
              ) : (
                <button
                  type="button"
                  onClick={openLoginModal}
                  className="px-2.5 py-0.5 rounded-full bg-oro/20 border border-oro/60 text-brillo font-extrabold hover:bg-oro hover:text-bosque transition"
                >
                  🔗 Reconectar Pollar
                </button>
              )}
            </>
          ) : isAuthenticated ? (
            <span className="text-brillo font-bold">
              {provisioningState === "FAILED"
                ? "⚠️ No se pudo aprovisionar tu cuenta G..."
                : "⏳ Creando cuenta custodial G... y trustline USDC..."}
            </span>
          ) : (
            <span className="text-arena/80 font-semibold">
              Billetera Stellar no conectada aún
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <button
              type="button"
              onClick={openLoginModal}
              className="px-3 py-1 rounded-lg bg-gradient-to-r from-oro to-brillo text-bosque font-extrabold uppercase tracking-wide text-[11px]"
            >
              Conectar Pollar (Google / OTP)
            </button>
          ) : (
            <>
              {(provisioningState === "FAILED" ||
                (effectiveAddress && !syncResult?.trustlineReady && !isProvisioning)) && (
                <button
                  type="button"
                  onClick={() => void runSync(true)}
                  className="px-2.5 py-1 rounded-lg bg-brote/20 border border-brote/60 text-arena font-bold text-[11px]"
                >
                  ↻ Reintentar sync
                </button>
              )}
              <button
                type="button"
                onClick={() => logout()}
                className="px-2.5 py-1 rounded-lg bg-red-500/15 border border-red-400/40 text-red-200 font-bold text-[11px]"
              >
                Desconectar Pollar
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl bg-[#0F1A16] border-2 border-oro/45 ${
        compact ? "p-3.5 space-y-2.5" : "p-4 space-y-3"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-extrabold uppercase tracking-wider text-brillo">
          🔐 Acceso y Billetera Pollar (Stellar Testnet)
        </span>
        {effectiveAddress && (
          <span className="font-mono text-xs font-extrabold px-2.5 py-0.5 rounded-full bg-brote/25 border border-brote text-arena">
            {shortAddress}
          </span>
        )}
      </div>

      {!isAuthenticated ? (
        <div className="space-y-2.5">
          <p className="text-xs text-arena/85 leading-relaxed">
            Inicia sesión con Google o código OTP a tu correo para crear tu
            cuenta Stellar custodial (<span className="font-mono">G...</span>)
            y habilitar recargas reales con QR en Bolivianos (BOB → USDC).
          </p>

          {activeStepMessage && (
            <div className="p-2.5 rounded-xl bg-oro/15 border border-oro/45 text-xs font-bold text-brillo">
              ⏳ {activeStepMessage}
            </div>
          )}

          {authState.step === "error" && (
            <div className="p-2.5 rounded-xl bg-red-500/20 border border-red-400/60 text-xs font-bold text-red-100">
              ⚠️ {authState.message || "No se pudo completar el acceso con Pollar."}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={openLoginModal}
              disabled={configStatus === "loading"}
              className="w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-oro via-brillo to-oro text-bosque font-extrabold text-xs uppercase tracking-wide shadow disabled:opacity-60"
            >
              🔑 Google o Email OTP
            </button>
            <button
              type="button"
              onClick={() => login({ provider: "google" })}
              disabled={configStatus === "loading"}
              className="w-full py-2.5 px-3 rounded-xl bg-[#182822] hover:bg-oro/20 border border-oro/60 text-brillo font-extrabold text-xs uppercase tracking-wide transition disabled:opacity-60"
            >
              G Continuar con Google
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs space-y-0.5">
              <p className="font-bold text-brote">
                {isProvisioning
                  ? "⏳ Aprovisionando cuenta G... y trustline USDC Testnet..."
                  : provisioningState === "READY"
                  ? "✅ Billetera Stellar Testnet READY"
                  : "⏳ Verificando estado en Stellar Testnet..."}
              </p>
              {effectiveAddress && (
                <p className="font-mono text-arena/90">
                  Cuenta: <strong>{shortAddress}</strong>
                  {syncResult?.trustlineReady ? " · USDC habilitado" : ""}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {effectiveAddress && (
                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="px-2.5 py-1.5 rounded-lg bg-bosque border border-oro/40 text-brillo text-[11px] font-bold"
                >
                  {copied ? "✓ Copiado" : "Copiar"}
                </button>
              )}
              <button
                type="button"
                onClick={() => logout()}
                className="px-2.5 py-1.5 rounded-lg bg-red-500/15 border border-red-400/40 text-red-200 text-[11px] font-bold"
              >
                Salir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
