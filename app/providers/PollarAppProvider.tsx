"use client";

import React, { useMemo } from "react";
import { PollarProvider } from "@pollar/react";
import type { PollarClientConfig } from "@pollar/core";
import "@pollar/react/styles.css";

const POLLAR_PUBLISHABLE_KEY = (
  process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY || ""
).trim();
const POLLAR_API_URL = (process.env.NEXT_PUBLIC_POLLAR_API_URL || "").trim();
const POLLAR_OAUTH_CALLBACK_PATH = "/auth/callback";

export function PollarAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientConfig = useMemo<PollarClientConfig>(() => {
    if (
      process.env.NODE_ENV !== "production" &&
      POLLAR_PUBLISHABLE_KEY &&
      !POLLAR_PUBLISHABLE_KEY.startsWith("pub_testnet_")
    ) {
      console.warn(
        "[EcoBanco Testnet Audit][POLLAR_KEY_WARN] NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY no tiene prefijo pub_testnet_."
      );
    }

    const oauthRedirectUri =
      typeof window !== "undefined" && window.location?.origin
        ? `${window.location.origin}${POLLAR_OAUTH_CALLBACK_PATH}`
        : undefined;

    return {
      apiKey: POLLAR_PUBLISHABLE_KEY,
      stellarNetwork: "testnet",
      ...(POLLAR_API_URL ? { baseUrl: POLLAR_API_URL } : {}),
      ...(oauthRedirectUri ? { oauthRedirectUri } : {}),
      locale: "es",
    };
  }, []);

  return (
    <PollarProvider client={clientConfig} language="es">
      {children}
    </PollarProvider>
  );
}
