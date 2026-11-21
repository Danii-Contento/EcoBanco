"use client";

import { useEffect, useRef } from "react";
import { usePollar } from "@pollar/react";

/**
 * Al volver a la pantalla de Inicio (/), desconecta cualquier perfil activo
 * (caserita, vecino o repartidor) para cuidar la privacidad en equipos compartidos.
 */
export function SessionResetOnHome() {
  const { isAuthenticated, logout } = usePollar();
  const hasResetRef = useRef<boolean>(false);

  useEffect(() => {
    if (hasResetRef.current) return;
    hasResetRef.current = true;

    void fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout_all" }),
      keepalive: true,
    }).catch(() => undefined);

    if (isAuthenticated && typeof logout === "function") {
      try {
        logout();
      } catch {
        // ignore silent logout errors
      }
    }
  }, [isAuthenticated, logout]);

  return null;
}
