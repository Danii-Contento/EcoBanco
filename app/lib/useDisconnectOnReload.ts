"use client";

import { useEffect } from "react";
import { clearPollarWalletRuntimeCaches } from "./pollarWallet";

export type DisconnectAction =
  | "merchant_logout"
  | "buyer_logout"
  | "rider_logout"
  | "logout_all";

const THEME_STORAGE_KEY = "ecobanco_theme";

/**
 * Purga por completo localStorage, sessionStorage y cachés en memoria de sesión
 * preservando únicamente la preferencia visual de tema (Ajayu Día / Modo Noche).
 */
export function purgeClientSessionStorage(): void {
  clearPollarWalletRuntimeCaches();
  if (typeof window === "undefined") return;

  try {
    window.sessionStorage.clear();
  } catch {
    // ignore sessionStorage errors
  }

  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
    window.localStorage.clear();
    if (savedTheme === "light" || savedTheme === "dark") {
      window.localStorage.setItem(THEME_STORAGE_KEY, savedTheme);
    }
  } catch {
    // ignore localStorage errors
  }
}

export function isPageReloadNavigation(): boolean {
  if (typeof window === "undefined" || typeof performance === "undefined") {
    return false;
  }
  const entries = performance.getEntriesByType(
    "navigation"
  ) as PerformanceNavigationTiming[];
  return entries[0]?.type === "reload";
}

export async function disconnectProfileSession(
  action: DisconnectAction,
  pollarLogout?: () => void
): Promise<void> {
  try {
    await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
      keepalive: true,
    });
  } catch {
    // ignore network errors on logout
  }

  if (pollarLogout) {
    try {
      pollarLogout();
    } catch {
      // ignore silent logout errors
    }
  }

  purgeClientSessionStorage();
}

/**
 * Envía señal de desconexión cuando el usuario recarga o abandona la pestaña
 * mientras tiene un perfil activo.
 */
export function useDisconnectOnPageUnload(
  active: boolean,
  action: DisconnectAction
) {
  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    const sendDisconnectBeacon = () => {
      purgeClientSessionStorage();
      try {
        const blob = new Blob([JSON.stringify({ action })], {
          type: "application/json",
        });
        navigator.sendBeacon("/api/users", blob);
      } catch {
        // ignore beacon errors
      }
    };

    window.addEventListener("pagehide", sendDisconnectBeacon);
    return () => {
      window.removeEventListener("pagehide", sendDisconnectBeacon);
    };
  }, [active, action]);
}
