"use client";

import type {
  PollarClient,
  RampOrder,
  WalletInfo,
  WalletProvisioning,
} from "@pollar/core";

// Official Circle USDC issuer on Stellar Testnet
export const STELLAR_TESTNET_USDC = {
  code: "USDC",
  issuer: "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5",
} as const;

const STELLAR_CLASSIC_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
const STELLAR_TX_HASH_REGEX = /^[a-fA-F0-9]{64}$/;

export interface PollarSyncResult {
  synced: boolean;
  persisted?: boolean;
  pollarUserId?: string | null;
  stellarAddress?: string | null;
  provisioning?: WalletProvisioning | null;
  trustlineReady?: boolean;
  reason?: string;
}

export interface PollarRampCompletedOrder {
  pollarOrderId: string;
  direction: "ONRAMP";
  orderState: "completed";
  amountBs: number;
  fiatCurrency: string;
  assetCode: string;
  cryptoAmount: number | null;
  onchainTxHash: string | null;
  pollarUserId: string | null;
  stellarAddress: string | null;
  createdAt: string;
  updatedAt: string;
}

const inFlightProvisionByClient = new WeakMap<
  PollarClient,
  Promise<PollarSyncResult>
>();
const inFlightSyncByTarget = new Map<string, Promise<PollarSyncResult>>();

export function isValidClassicStellarAddress(
  address?: string | null
): address is string {
  if (!address) return false;
  return STELLAR_CLASSIC_ACCOUNT_REGEX.test(address.trim());
}

export function extractPollarUserId(client: PollarClient): string | null {
  const auth = client.getAuthState();
  if (auth.step !== "authenticated") return null;
  return (
    auth.session.userId ||
    auth.session.user?.id ||
    auth.session.clientSessionId ||
    null
  );
}

/**
 * Waits until the Pollar Stellar wallet reaches `provisioning === 'READY'`.
 * Uses both `onWalletStateChange` and periodic `refreshWalletState()` checks.
 */
export async function waitForWalletProvisioningReady(
  client: PollarClient,
  timeoutMs = 45000
): Promise<WalletProvisioning | null> {
  const current = client.getWallet();
  if (current?.provisioning === "READY") {
    return "READY";
  }

  return new Promise<WalletProvisioning | null>((resolve) => {
    let settled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const finish = (state: WalletProvisioning | null) => {
      if (settled) return;
      settled = true;
      if (pollTimer) clearInterval(pollTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      unsubscribe();
      resolve(state);
    };

    const unsubscribe = client.onWalletStateChange((state) => {
      if (state === "READY" || state === "FAILED") {
        finish(state);
      }
    });

    const checkOnce = async () => {
      try {
        const refreshed = await client.refreshWalletState();
        if (refreshed === "READY" || refreshed === "FAILED") {
          finish(refreshed);
        }
      } catch {
        // Non-blocking: keep waiting until timeout
      }
    };

    void checkOnce();
    pollTimer = setInterval(() => {
      void checkOnce();
    }, 2000);

    timeoutTimer = setTimeout(() => {
      finish(client.getWallet()?.provisioning ?? null);
    }, timeoutMs);
  });
}

async function runEnsurePollarWalletProvisioned(
  client: PollarClient
): Promise<PollarSyncResult> {
  try {
    await client.ready();
  } catch {
    // Continue and inspect current auth state
  }

  const authState = client.getAuthState();
  if (authState.step !== "authenticated") {
    return { synced: false, reason: "pollar_not_authenticated" };
  }

  // Enforce Stellar Testnet exclusively
  if (client.getNetwork() !== "testnet") {
    client.setNetwork("testnet");
  }

  // 1. Check hasWallet(); if no wallet exists, execute createWallet()
  let wallet: WalletInfo | null = client.getWallet();
  if (!client.hasWallet() || !wallet) {
    try {
      wallet = await client.createWallet();
    } catch {
      wallet = client.getWallet();
    }
  }

  // 2. Wait for wallet.provisioning === 'READY'
  let provisioning: WalletProvisioning | null = wallet?.provisioning ?? null;
  if (provisioning !== "READY") {
    provisioning = await waitForWalletProvisioningReady(client, 45000);
    wallet = client.getWallet() || wallet;
  }

  const stellarAddress = wallet?.address || null;
  const isClassicAccount = isValidClassicStellarAddress(stellarAddress);

  // 3. Ensure sponsored USDC trustline on Stellar Testnet (WITHOUT skipSponsorship)
  let trustlineReady = false;
  if (provisioning === "READY" && isClassicAccount) {
    try {
      await client.refreshAssets();
      const enabledState = client.getEnabledAssetsState();
      const loadedAssets =
        enabledState.step === "loaded" ? enabledState.data.assets : [];
      const configuredUsdc = loadedAssets.find(
        (a) =>
          a.code.toUpperCase() === "USDC" &&
          (!a.chain || a.chain === "STELLAR")
      );

      if (configuredUsdc?.trustlineEstablished) {
        trustlineReady = true;
      } else {
        const usdcAsset = {
          code: configuredUsdc?.code || STELLAR_TESTNET_USDC.code,
          issuer: configuredUsdc?.issuer || STELLAR_TESTNET_USDC.issuer,
        };
        // Sponsored trustline: omit skipSponsorship so app sponsorship applies
        const outcome = await client.setTrustline(usdcAsset);
        if (outcome.status === "success" || outcome.status === "pending") {
          trustlineReady = true;
          await client.refreshAssets();
        }
      }
    } catch {
      // Non-blocking: trustline can be retried on next sync
    }

    await client.refreshBalance().catch(() => undefined);
  }

  const pollarUserId = extractPollarUserId(client);

  return {
    synced: Boolean(pollarUserId || stellarAddress),
    pollarUserId,
    stellarAddress,
    provisioning,
    trustlineReady,
  };
}

/**
 * Ensures the authenticated Pollar user has:
 * 1) A classic custodial Stellar Testnet account (`G...`) via `hasWallet()` / `createWallet()`
 * 2) `wallet.provisioning === 'READY'`
 * 3) Sponsored USDC trustline on Stellar Testnet (WITHOUT `skipSponsorship`)
 */
export async function ensurePollarWalletProvisioned(
  client: PollarClient
): Promise<PollarSyncResult> {
  const existing = inFlightProvisionByClient.get(client);
  if (existing) {
    return existing;
  }

  const promise = runEnsurePollarWalletProvisioned(client)
    .catch((err) => ({
      synced: false,
      reason: err instanceof Error ? err.message : "pollar_sync_error",
    }))
    .finally(() => {
      inFlightProvisionByClient.delete(client);
    });

  inFlightProvisionByClient.set(client, promise);
  return promise;
}

/**
 * Provisions the Pollar Stellar Testnet wallet and persists `pollar_user_id`
 * and `stellar_address` in Supabase via `POST /api/users` (`action: "sync_pollar_wallet"`).
 */
export async function ensurePollarWalletAndSync(
  client: PollarClient,
  target: {
    userId?: string;
    role: "buyer" | "merchant" | "rider";
  }
): Promise<PollarSyncResult> {
  const targetKey = `${target.role}:${target.userId || "session"}`;
  const existing = inFlightSyncByTarget.get(targetKey);
  if (existing) {
    return existing;
  }

  const promise = (async (): Promise<PollarSyncResult> => {
    try {
      const provisioned = await ensurePollarWalletProvisioned(client);
      if (!provisioned.synced) {
        return provisioned;
      }

      if (!provisioned.pollarUserId && !provisioned.stellarAddress) {
        return provisioned;
      }

      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "sync_pollar_wallet",
          userId: target.userId,
          role: target.role,
          pollar_user_id: provisioned.pollarUserId,
          stellar_address: provisioned.stellarAddress,
        }),
      });

      return {
        ...provisioned,
        persisted: res.ok,
      };
    } catch (err) {
      return {
        synced: false,
        reason: err instanceof Error ? err.message : "pollar_sync_error",
      };
    } finally {
      inFlightSyncByTarget.delete(targetKey);
    }
  })();

  inFlightSyncByTarget.set(targetKey, promise);
  return promise;
}

/**
 * Extracts verified ONRAMP completion metadata from a Pollar `RampOrder`
 * so the backend can validate and credit Supabase without trusting client-invented amounts.
 */
export function extractCompletedRampOrder(
  order: RampOrder,
  client: PollarClient
): PollarRampCompletedOrder | null {
  if (!order || order.direction !== "ONRAMP" || order.state !== "completed") {
    return null;
  }

  const onrampLeg =
    order.legs.find((leg) => leg.kind === "PROVIDER_ONRAMP") || order.legs[0];
  const assetLeg =
    [...order.legs].reverse().find((leg) => leg.to.kind === "asset") ||
    onrampLeg;

  const fiatCurrency =
    onrampLeg && onrampLeg.from.kind === "fiat"
      ? onrampLeg.from.currency.toUpperCase()
      : "BOB";

  const rawFiatAmount =
    onrampLeg?.amountInActual || onrampLeg?.amountInPlanned || "0";
  const amountBs = Number(rawFiatAmount);
  if (!Number.isFinite(amountBs) || amountBs <= 0) {
    return null;
  }

  const assetCode =
    assetLeg && assetLeg.to.kind === "asset"
      ? assetLeg.to.code.toUpperCase()
      : "USDC";

  const rawCryptoAmount =
    assetLeg?.amountOutActual || assetLeg?.amountOutPlanned || "";
  const parsedCrypto = rawCryptoAmount ? Number(rawCryptoAmount) : NaN;
  const cryptoAmount =
    Number.isFinite(parsedCrypto) && parsedCrypto > 0 ? parsedCrypto : null;

  let onchainTxHash: string | null = null;
  for (const leg of [...order.legs].reverse()) {
    if (leg.onchainTxHash && STELLAR_TX_HASH_REGEX.test(leg.onchainTxHash)) {
      onchainTxHash = leg.onchainTxHash;
      break;
    }
    const stepWithHash = leg.steps?.find(
      (s) => s.hash && STELLAR_TX_HASH_REGEX.test(s.hash)
    );
    if (stepWithHash?.hash) {
      onchainTxHash = stepWithHash.hash;
      break;
    }
  }

  const pollarUserId = extractPollarUserId(client);
  const stellarAddress =
    client.getWallet()?.address || assetLeg?.fundsLocation?.address || null;

  return {
    pollarOrderId: order.id,
    direction: "ONRAMP",
    orderState: "completed",
    amountBs: Math.round(amountBs * 100) / 100,
    fiatCurrency,
    assetCode,
    cryptoAmount,
    onchainTxHash,
    pollarUserId,
    stellarAddress,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function formatShortStellarAddress(address?: string | null): string {
  if (!address) return "";
  if (address.length <= 12) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export interface PollarSignXdrResult {
  signed: boolean;
  signedXdr?: string;
  signerAddress?: string;
  reason?: string;
}

/**
 * Firma un XDR usando la cuenta custodial clásica G... de Pollar cuando el usuario
 * tiene sesión Pollar activa. Jamás ejecuta signTx sobre Passkeys (C-address).
 */
export async function signXdrWithPollarCustodial(
  client: PollarClient,
  unsignedXdr: string
): Promise<PollarSignXdrResult> {
  if (!unsignedXdr || !unsignedXdr.trim()) {
    return { signed: false, reason: "empty_xdr" };
  }

  const auth = client.getAuthState();
  if (auth.step !== "authenticated") {
    return { signed: false, reason: "pollar_not_authenticated" };
  }

  const wallet = client.getWallet();
  const address = wallet?.address?.trim() || "";

  // Prohibido usar signTx sobre Passkeys (C-address)
  if (
    !address ||
    address.startsWith("C") ||
    wallet?.custody === "smart" ||
    !isValidClassicStellarAddress(address)
  ) {
    return { signed: false, reason: "non_classic_or_passkey_c_address" };
  }

  if (wallet?.provisioning && wallet.provisioning !== "READY") {
    return { signed: false, reason: "wallet_not_ready" };
  }

  try {
    const outcome = await client.signTx(unsignedXdr);
    if (outcome.status === "signed" && outcome.signedXdr) {
      return {
        signed: true,
        signedXdr: outcome.signedXdr,
        signerAddress: address,
      };
    }
    return {
      signed: false,
      signerAddress: address,
      reason: outcome.status,
    };
  } catch (err) {
    return {
      signed: false,
      signerAddress: address,
      reason: err instanceof Error ? err.message : "pollar_sign_error",
    };
  }
}
