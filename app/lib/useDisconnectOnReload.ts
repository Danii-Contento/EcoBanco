"use client";

import { useEffect } from "react";

export type DisconnectAction =
  | "merchant_logout"
  | "buyer_logout"
  | "rider_logout"
  | "logout_all";

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
