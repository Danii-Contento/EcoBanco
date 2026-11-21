"use client";

import React, { useMemo } from "react";
import { PollarProvider } from "@pollar/react";
import type { PollarClientConfig } from "@pollar/core";
import "@pollar/react/styles.css";

const POLLAR_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_POLLAR_PUBLISHABLE_KEY || "";

export function PollarAppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientConfig = useMemo<PollarClientConfig>(
    () => ({
      apiKey: POLLAR_PUBLISHABLE_KEY,
      stellarNetwork: "testnet",
      locale: "es",
    }),
    []
  );

  return (
    <PollarProvider client={clientConfig} language="es">
      {children}
    </PollarProvider>
  );
}
