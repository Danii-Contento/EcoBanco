import * as StellarSdk from "@stellar/stellar-sdk";
import type {
  ApproveMilestonePayload,
  ChangeMilestoneStatusPayload,
  EscrowRequestResponse,
  FundEscrowPayload,
  InitializeMultiReleaseEscrowPayload,
  InitializeMultiReleaseEscrowResponse,
  MultiReleaseReleaseFundsPayload,
  SendTransactionResponse,
} from "@trustless-work/escrow/types";

export const STELLAR_NETWORK = "TESTNET" as const;

export const STELLAR_TESTNET_HORIZON_URL =
  "https://horizon-testnet.stellar.org";

export function getHorizonTestnetUrl(): string {
  const configured = (
    process.env.STELLAR_HORIZON_URL || STELLAR_TESTNET_HORIZON_URL
  )
    .trim()
    .replace(/\/+$/, "");

  if (
    configured.includes("horizon.stellar.org") &&
    !configured.includes("testnet")
  ) {
    throw new Error(
      "STELLAR_HORIZON_URL debe apuntar a Stellar Testnet (horizon-testnet.stellar.org), nunca a Mainnet."
    );
  }
  return configured || STELLAR_TESTNET_HORIZON_URL;
}

export const STELLAR_TESTNET_USDC_ISSUER =
  "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

export const TRUSTLESS_WORK_FEE_RATE = 0.003; // 0.3% comisión de Trustless Work
export const TRUSTLESS_WORK_NET_FACTOR = 1 - TRUSTLESS_WORK_FEE_RATE; // 0.997

const STELLAR_CLASSIC_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
const SOROBAN_CONTRACT_ID_REGEX = /^C[A-Z2-7]{55}$/;

export function isValidSorobanContractId(
  contractId?: string | null
): contractId is string {
  if (!contractId) return false;
  return SOROBAN_CONTRACT_ID_REGEX.test(contractId.trim());
}

export function isClassicStellarGAddress(
  address?: string | null
): address is string {
  if (!address) return false;
  return STELLAR_CLASSIC_ACCOUNT_REGEX.test(address.trim());
}

/**
 * Aplica gross-up (monto_neto / 0.997) para absorber el 0.3% de comisión
 * de Trustless Work y garantizar que tanto la caserita como el repartidor
 * reciban el 100% íntegro de su monto neto (1 MOTE = 1 Bs = 1 USDC Testnet).
 */
export function grossUpForTrustlessWork(netAmountMotesOrBs: number): number {
  const numeric = Number(netAmountMotesOrBs);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error("El monto neto del hito debe ser mayor a 0.");
  }
  return Number((numeric / TRUSTLESS_WORK_NET_FACTOR).toFixed(2));
}

export function getTrustlessWorkViewerUrl(contractId: string): string {
  const clean = (contractId || "").trim();
  if (!clean) return "https://viewer.trustlesswork.com";
  return `https://viewer.trustlesswork.com/${encodeURIComponent(clean)}`;
}

export function getStellarExpertContractUrl(contractId: string): string {
  const clean = (contractId || "").trim();
  if (!clean) return "https://stellar.expert/explorer/testnet";
  if (SOROBAN_CONTRACT_ID_REGEX.test(clean)) {
    return `https://stellar.expert/explorer/testnet/contract/${encodeURIComponent(
      clean
    )}`;
  }
  return `https://stellar.expert/explorer/testnet/search?term=${encodeURIComponent(
    clean
  )}`;
}

export function getStellarExpertTxUrl(txHash?: string | null): string | null {
  const clean = (txHash || "").trim();
  if (!/^[a-fA-F0-9]{64}$/.test(clean)) return null;
  return `https://stellar.expert/explorer/testnet/tx/${encodeURIComponent(
    clean
  )}`;
}

interface TrustlessWorkConfigEnv {
  apiUrl: string;
  apiKey: string;
  treasuryPublic: string;
  treasurySecret: string;
  treasuryKeypair: StellarSdk.Keypair;
}

function getTrustlessWorkEnv(): TrustlessWorkConfigEnv {
  const apiUrl = (
    process.env.TRUSTLESS_WORK_API_URL || "https://dev.api.trustlesswork.com"
  )
    .trim()
    .replace(/\/+$/, "");

  if (
    apiUrl === "https://api.trustlesswork.com" ||
    (!apiUrl.includes("dev.") && !apiUrl.includes("testnet") && !apiUrl.includes("localhost"))
  ) {
    throw new Error(
      "TRUSTLESS_WORK_API_URL debe apuntar al entorno Testnet/Dev (https://dev.api.trustlesswork.com)."
    );
  }

  const apiKey = (process.env.TRUSTLESS_WORK_API_KEY || "").trim();
  const treasuryPublic = (process.env.STELLAR_TREASURY_PUBLIC || "").trim();
  const treasurySecret = (process.env.STELLAR_TREASURY_SECRET || "").trim();

  if (!apiKey) {
    throw new Error(
      "TRUSTLESS_WORK_API_KEY no está configurada en las variables de entorno."
    );
  }
  if (!treasurySecret) {
    throw new Error(
      "STELLAR_TREASURY_SECRET no está configurada en las variables de entorno."
    );
  }

  const treasuryKeypair = StellarSdk.Keypair.fromSecret(treasurySecret);
  const derivedPublic = treasuryKeypair.publicKey();

  if (isClassicStellarGAddress(treasuryPublic) && treasuryPublic !== derivedPublic) {
    console.warn("[EcoBanco Testnet Audit][TREASURY_KEY_MISMATCH]", {
      configuredPublic: treasuryPublic,
      derivedPublic,
    });
  }

  return {
    apiUrl,
    apiKey,
    treasuryPublic: derivedPublic,
    treasurySecret,
    treasuryKeypair,
  };
}

export function getTreasuryPublicAddress(): string {
  return getTrustlessWorkEnv().treasuryPublic;
}

/**
 * Firma o co-firma un XDR en Stellar Testnet usando la cuenta custodial/tesorería.
 * Jamás intenta firmar sobre direcciones Passkey (C-address).
 */
export function signXdrWithTreasury(unsignedXdr: string): {
  signedXdr: string;
  txHash: string;
} {
  const { treasuryKeypair } = getTrustlessWorkEnv();
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    unsignedXdr,
    StellarSdk.Networks.TESTNET
  );
  tx.sign(treasuryKeypair);
  const txHash = Buffer.from(tx.hash()).toString("hex");
  return {
    signedXdr: tx.toXDR(),
    txHash,
  };
}

export function extractTxHashFromXdr(xdr: string): string {
  const tx = StellarSdk.TransactionBuilder.fromXDR(
    xdr,
    StellarSdk.Networks.TESTNET
  );
  return Buffer.from(tx.hash()).toString("hex");
}

interface HorizonAccountBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
}

interface HorizonAccountResponse {
  id: string;
  balances: HorizonAccountBalance[];
}

async function fetchHorizonAccount(
  address: string
): Promise<HorizonAccountResponse | null> {
  if (!isClassicStellarGAddress(address)) return null;
  const horizonUrl = getHorizonTestnetUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `${horizonUrl}/accounts/${encodeURIComponent(address)}`,
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      }
    );
    if (!res.ok) return null;
    return (await res.json()) as HorizonAccountResponse;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Verifica si una dirección clásica G... existe en Stellar Testnet y tiene
 * el trustline de USDC activo (requerido por Trustless Work para roles y receivers).
 * Si no tiene Pollar vinculado, es una C-address (Passkey) o aún no tiene el trustline USDC
 * activo en Horizon Testnet, hace fallback seguro a STELLAR_TREASURY_PUBLIC.
 */
export async function resolveOperationalStellarAddress(
  candidateAddress?: string | null
): Promise<string> {
  const { treasuryPublic } = getTrustlessWorkEnv();
  const clean = (candidateAddress || "").trim();
  if (!isClassicStellarGAddress(clean)) {
    return treasuryPublic;
  }
  if (clean === treasuryPublic) {
    return treasuryPublic;
  }

  const acct = await fetchHorizonAccount(clean);
  if (!acct || !Array.isArray(acct.balances)) {
    return treasuryPublic;
  }

  const hasUsdcTrustline = acct.balances.some(
    (b) =>
      b.asset_code === "USDC" &&
      b.asset_issuer === STELLAR_TESTNET_USDC_ISSUER
  );

  return hasUsdcTrustline ? clean : treasuryPublic;
}

/**
 * Garantiza que la Tesorería Operativa (STELLAR_TREASURY_PUBLIC) exista en Stellar Testnet,
 * tenga el trustline de USDC activo y cuente con saldo suficiente de USDC para fondear el contrato.
 */
export async function ensureTreasuryReady(
  minUsdcRequired = 50
): Promise<void> {
  const { treasuryPublic, treasuryKeypair } = getTrustlessWorkEnv();
  const server = new StellarSdk.Horizon.Server(getHorizonTestnetUrl());

  let acct = await fetchHorizonAccount(treasuryPublic);
  if (!acct) {
    await fetch(
      `https://friendbot.stellar.org/?addr=${encodeURIComponent(
        treasuryPublic
      )}`,
      { cache: "no-store" }
    );
    acct = await fetchHorizonAccount(treasuryPublic);
  }

  if (!acct) {
    throw new Error(
      `No se pudo inicializar la Tesorería Operativa ${treasuryPublic} en Stellar Testnet.`
    );
  }

  const usdcBalanceEntry = acct.balances.find(
    (b) =>
      b.asset_code === "USDC" &&
      b.asset_issuer === STELLAR_TESTNET_USDC_ISSUER
  );
  const currentUsdc = usdcBalanceEntry ? Number(usdcBalanceEntry.balance) : 0;

  if (usdcBalanceEntry && currentUsdc >= minUsdcRequired) {
    return;
  }

  const horizonAccount = await server.loadAccount(treasuryPublic);
  const usdcAsset = new StellarSdk.Asset("USDC", STELLAR_TESTNET_USDC_ISSUER);
  const txBuilder = new StellarSdk.TransactionBuilder(horizonAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: StellarSdk.Networks.TESTNET,
  });

  if (!usdcBalanceEntry) {
    txBuilder.addOperation(
      StellarSdk.Operation.changeTrust({
        asset: usdcAsset,
      })
    );
  }

  if (currentUsdc < minUsdcRequired) {
    txBuilder.addOperation(
      StellarSdk.Operation.pathPaymentStrictSend({
        sendAsset: StellarSdk.Asset.native(),
        sendAmount: "1500",
        destination: treasuryPublic,
        destAsset: usdcAsset,
        destMin: "1",
        path: [],
      })
    );
  }

  const tx = txBuilder.setTimeout(60).build();
  tx.sign(treasuryKeypair);
  await server.submitTransaction(tx);
}

async function trustlessWorkRequest<TResponse>(
  endpoint: string,
  options: {
    method?: "GET" | "POST" | "PUT";
    body?: unknown;
  } = {}
): Promise<TResponse> {
  const { apiUrl, apiKey } = getTrustlessWorkEnv();
  const res = await fetch(`${apiUrl}${endpoint}`, {
    method: options.method || "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      Authorization: `Bearer ${apiKey}`,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  const rawText = await res.text();
  let parsed: unknown = null;
  try {
    parsed = rawText ? JSON.parse(rawText) : {};
  } catch {
    parsed = { message: rawText };
  }

  if (!res.ok) {
    const errObj = parsed as {
      message?: string;
      details?: unknown;
      error?: string;
    };
    const detailStr = errObj?.details ? ` (${JSON.stringify(errObj.details)})` : "";
    throw new Error(
      `Trustless Work API ${endpoint} (${res.status}): ${
        errObj?.message || errObj?.error || rawText
      }${detailStr}`
    );
  }

  return parsed as TResponse;
}

export interface SendTxWithHashResponse extends SendTransactionResponse {
  contractId?: string;
  txHash: string;
  escrow?: unknown;
}

/**
 * Envía una transacción XDR firmada a Stellar Testnet a través de Trustless Work
 * (`/helper/send-transaction`) y retorna el hash real de la transacción en Stellar.
 */
export async function sendSignedTransactionToTrustlessWork(
  signedXdr: string
): Promise<SendTxWithHashResponse> {
  const txHash = extractTxHashFromXdr(signedXdr);
  const response = await trustlessWorkRequest<
    SendTransactionResponse & { contractId?: string; escrow?: unknown }
  >("/helper/send-transaction", {
    method: "POST",
    body: { signedXdr },
  });

  if (response.status && response.status !== "SUCCESS") {
    throw new Error(
      response.message ||
        "Trustless Work rechazó el envío de la transacción XDR."
    );
  }

  return {
    ...response,
    txHash,
  };
}

export interface MultiReleaseMilestoneConfig {
  description: string;
  netAmount: number;
  grossAmount: number;
  serviceProvider: string;
}

export interface DeployMultiReleaseOrderInput {
  engagementId: string;
  title: string;
  description: string;
  sellerStellarAddress?: string | null;
  riderStellarAddress?: string | null;
  buyerStellarAddress?: string | null;
  productNetAmountMotes: number;
  deliveryFeeNetAmountMotes: number;
  subsidizedDelivery?: boolean;
  preSignedDeployXdr?: string | null;
}

export interface DeployedAndFundedMultiReleaseOrder {
  contractId: string;
  engagementId: string;
  deployTxHash: string;
  fundTxHash: string;
  milestone1NetAmount: number;
  milestone1GrossAmount: number;
  milestone2NetAmount: number;
  milestone2GrossAmount: number;
  totalFundedAmount: number;
  sellerServiceProvider: string;
  riderServiceProvider: string;
  subsidizedDelivery: boolean;
}

/**
 * 1) Construye el payload Multi-Release con 2 hitos y gross-up (monto_neto / 0.997):
 *    - Hito 1 (Mercadería): receiver/serviceProvider = stellar_address de la caserita (o fallback a STELLAR_TREASURY_PUBLIC)
 *    - Hito 2 (Envío Ecológico EcoDohmi): receiver/serviceProvider = stellar_address del repartidor (o fallback a STELLAR_TREASURY_PUBLIC)
 * 2) Llama a POST /deployer/multi-release para obtener el unsignedTransaction XDR.
 */
export async function prepareMultiReleaseDeployment(
  input: DeployMultiReleaseOrderInput
): Promise<{
  payload: InitializeMultiReleaseEscrowPayload;
  unsignedTransaction: string;
  milestone1GrossAmount: number;
  milestone2GrossAmount: number;
  totalFundedAmount: number;
  sellerServiceProvider: string;
  riderServiceProvider: string;
}> {
  const { treasuryPublic } = getTrustlessWorkEnv();

  const milestone1GrossAmount = grossUpForTrustlessWork(
    input.productNetAmountMotes
  );
  const milestone2GrossAmount = grossUpForTrustlessWork(
    input.deliveryFeeNetAmountMotes
  );
  const totalFundedAmount = Number(
    (milestone1GrossAmount + milestone2GrossAmount).toFixed(2)
  );

  await ensureTreasuryReady(Math.max(50, totalFundedAmount + 10));

  const [sellerServiceProvider, riderServiceProvider] = await Promise.all([
    resolveOperationalStellarAddress(input.sellerStellarAddress),
    resolveOperationalStellarAddress(input.riderStellarAddress),
  ]);

  const payload: InitializeMultiReleaseEscrowPayload = {
    signer: treasuryPublic,
    engagementId: input.engagementId,
    title: input.title,
    description: input.description,
    platformFee: 0,
    trustline: {
      symbol: "USDC",
      address: STELLAR_TESTNET_USDC_ISSUER,
    },
    roles: {
      approver: treasuryPublic,
      serviceProvider: treasuryPublic,
      platformAddress: treasuryPublic,
      releaseSigner: treasuryPublic,
      disputeResolver: treasuryPublic,
    },
    milestones: [
      {
        description: `Hito 1 (Mercadería): ${input.title}`,
        amount: milestone1GrossAmount,
        receiver: sellerServiceProvider,
      },
      {
        description: `Hito 2 (Envío Ecológico EcoDohmi)${
          input.subsidizedDelivery ? " - Subsidiado por Tesorería" : ""
        }`,
        amount: milestone2GrossAmount,
        receiver: riderServiceProvider,
      },
    ],
  };

  const initRes =
    await trustlessWorkRequest<InitializeMultiReleaseEscrowResponse>(
      "/deployer/multi-release",
      {
        method: "POST",
        body: payload,
      }
    );

  if (!initRes.unsignedTransaction) {
    throw new Error(
      initRes.message ||
        "Trustless Work no devolvió unsignedTransaction al inicializar el contrato Multi-Release."
    );
  }

  return {
    payload,
    unsignedTransaction: initRes.unsignedTransaction,
    milestone1GrossAmount,
    milestone2GrossAmount,
    totalFundedAmount,
    sellerServiceProvider,
    riderServiceProvider,
  };
}

/**
 * Fondea un contrato Multi-Release existente en Soroban Testnet con USDC.
 */
export async function fundMultiReleaseEscrow(params: {
  contractId: string;
  amount: number;
  preSignedFundXdr?: string | null;
}): Promise<{ fundTxHash: string; amount: number }> {
  const { treasuryPublic } = getTrustlessWorkEnv();
  const payload: FundEscrowPayload = {
    contractId: params.contractId,
    signer: treasuryPublic,
    amount: params.amount,
  };

  let signedXdr = (params.preSignedFundXdr || "").trim();
  if (!signedXdr) {
    const fundInit = await trustlessWorkRequest<EscrowRequestResponse>(
      "/escrow/multi-release/fund-escrow",
      {
        method: "POST",
        body: payload,
      }
    );

    if (!fundInit.unsignedTransaction) {
      throw new Error(
        "Trustless Work no devolvió unsignedTransaction al fondear el contrato Multi-Release."
      );
    }

    signedXdr = signXdrWithTreasury(fundInit.unsignedTransaction).signedXdr;
  }

  const fundSend = await sendSignedTransactionToTrustlessWork(signedXdr);
  console.info("[EcoBanco Testnet Audit][ESCROW_FUNDED]", {
    contractId: params.contractId,
    fundTxHash: fundSend.txHash,
    amountUsdc: params.amount,
  });
  return {
    fundTxHash: fundSend.txHash,
    amount: params.amount,
  };
}

/**
 * Despliega y fondea un contrato Multi-Release real de 2 hitos en Soroban Testnet.
 */
export async function deployAndFundMultiReleaseOrder(
  input: DeployMultiReleaseOrderInput
): Promise<DeployedAndFundedMultiReleaseOrder> {
  const prepared = await prepareMultiReleaseDeployment(input);

  const signedDeployXdr = input.preSignedDeployXdr?.trim()
    ? input.preSignedDeployXdr.trim()
    : signXdrWithTreasury(prepared.unsignedTransaction).signedXdr;

  const deploySend = await sendSignedTransactionToTrustlessWork(
    signedDeployXdr
  );

  const contractId = (deploySend.contractId || "").trim();
  if (!isValidSorobanContractId(contractId)) {
    throw new Error(
      `Trustless Work no devolvió un contractId Soroban válido (recibido: "${contractId}").`
    );
  }

  console.info("[EcoBanco Testnet Audit][ESCROW_DEPLOYED]", {
    contractId,
    engagementId: input.engagementId,
    deployTxHash: deploySend.txHash,
  });

  const funded = await fundMultiReleaseEscrow({
    contractId,
    amount: prepared.totalFundedAmount,
  });

  // Actualización no bloqueante del indexer de Trustless Work
  void trustlessWorkRequest("/indexer/update-from-txhash", {
    method: "PUT",
    body: { txHash: funded.fundTxHash },
  }).catch(() => undefined);

  return {
    contractId,
    engagementId: input.engagementId,
    deployTxHash: deploySend.txHash,
    fundTxHash: funded.fundTxHash,
    milestone1NetAmount: input.productNetAmountMotes,
    milestone1GrossAmount: prepared.milestone1GrossAmount,
    milestone2NetAmount: input.deliveryFeeNetAmountMotes,
    milestone2GrossAmount: prepared.milestone2GrossAmount,
    totalFundedAmount: prepared.totalFundedAmount,
    sellerServiceProvider: prepared.sellerServiceProvider,
    riderServiceProvider: prepared.riderServiceProvider,
    subsidizedDelivery: Boolean(input.subsidizedDelivery),
  };
}

/**
 * Registra en segundo plano el hito de recojo en tránsito ("InProgress") sobre Soroban Testnet
 * sin exponer códigos secretos de entrega ni bloquear al repartidor.
 */
export async function recordPickupMilestoneEvidence(params: {
  contractId: string;
  deliveryId?: string;
  orderId?: string;
  riderName?: string;
}): Promise<{ txHash: string } | null> {
  const cleanContractId = (params.contractId || "").trim();
  if (!isValidSorobanContractId(cleanContractId)) {
    return null;
  }

  const { treasuryPublic } = getTrustlessWorkEnv();
  const evidence = `Recojo EcoDohmi confirmado${
    params.riderName ? ` por ${params.riderName}` : ""
  }${params.orderId ? ` (Orden ${params.orderId})` : ""}`;

  const changePayload: ChangeMilestoneStatusPayload = {
    contractId: cleanContractId,
    milestoneIndex: "0",
    newStatus: "InProgress",
    newEvidence: evidence,
    serviceProvider: treasuryPublic,
  };

  const changeInit = await trustlessWorkRequest<EscrowRequestResponse>(
    "/escrow/multi-release/change-milestone-status",
    {
      method: "POST",
      body: changePayload,
    }
  );

  if (!changeInit.unsignedTransaction) {
    return null;
  }

  const signedChange = signXdrWithTreasury(changeInit.unsignedTransaction);
  const sendRes = await sendSignedTransactionToTrustlessWork(
    signedChange.signedXdr
  );

  console.info("[EcoBanco Testnet Audit][MILESTONE_IN_PROGRESS_OK]", {
    contractId: cleanContractId,
    deliveryId: params.deliveryId ?? null,
    orderId: params.orderId ?? null,
    txHash: sendRes.txHash,
  });

  return { txHash: sendRes.txHash };
}

/**
 * Cambia estado a "Completed", aprueba y libera un hito individual de un contrato Multi-Release.
 */
export async function approveAndReleaseSingleMilestone(params: {
  contractId: string;
  milestoneIndex: "0" | "1";
  evidence: string;
}): Promise<{
  statusTxHash: string;
  approveTxHash: string;
  releaseTxHash: string;
}> {
  const { treasuryPublic } = getTrustlessWorkEnv();

  // 1. Change milestone status -> "Completed"
  const changePayload: ChangeMilestoneStatusPayload = {
    contractId: params.contractId,
    milestoneIndex: params.milestoneIndex,
    newStatus: "Completed",
    newEvidence: params.evidence,
    serviceProvider: treasuryPublic,
  };
  const changeInit = await trustlessWorkRequest<EscrowRequestResponse>(
    "/escrow/multi-release/change-milestone-status",
    {
      method: "POST",
      body: changePayload,
    }
  );
  if (!changeInit.unsignedTransaction) {
    throw new Error(
      `Trustless Work no devolvió unsignedTransaction en change-milestone-status para el hito ${params.milestoneIndex}.`
    );
  }
  const signedChange = signXdrWithTreasury(changeInit.unsignedTransaction);
  const changeSend = await sendSignedTransactionToTrustlessWork(
    signedChange.signedXdr
  );

  // 2. Approve milestone -> approved = true
  const approvePayload: ApproveMilestonePayload = {
    contractId: params.contractId,
    milestoneIndex: params.milestoneIndex,
    approver: treasuryPublic,
  };
  const approveInit = await trustlessWorkRequest<EscrowRequestResponse>(
    "/escrow/multi-release/approve-milestone",
    {
      method: "POST",
      body: approvePayload,
    }
  );
  if (!approveInit.unsignedTransaction) {
    throw new Error(
      `Trustless Work no devolvió unsignedTransaction en approve-milestone para el hito ${params.milestoneIndex}.`
    );
  }
  const signedApprove = signXdrWithTreasury(approveInit.unsignedTransaction);
  const approveSend = await sendSignedTransactionToTrustlessWork(
    signedApprove.signedXdr
  );

  // 3. Release milestone funds -> transfiere USDC al receiver del hito
  const releasePayload: MultiReleaseReleaseFundsPayload = {
    contractId: params.contractId,
    milestoneIndex: params.milestoneIndex,
    releaseSigner: treasuryPublic,
  };
  const releaseInit = await trustlessWorkRequest<EscrowRequestResponse>(
    "/escrow/multi-release/release-milestone-funds",
    {
      method: "POST",
      body: releasePayload,
    }
  );
  if (!releaseInit.unsignedTransaction) {
    throw new Error(
      `Trustless Work no devolvió unsignedTransaction en release-milestone-funds para el hito ${params.milestoneIndex}.`
    );
  }
  const signedRelease = signXdrWithTreasury(releaseInit.unsignedTransaction);
  const releaseSend = await sendSignedTransactionToTrustlessWork(
    signedRelease.signedXdr
  );

  return {
    statusTxHash: changeSend.txHash,
    approveTxHash: approveSend.txHash,
    releaseTxHash: releaseSend.txHash,
  };
}

/**
 * Aprueba y libera on-chain los 2 hitos del contrato Multi-Release (Hito 1: Mercadería e Hito 2: Envío Ecológico EcoDohmi)
 * al validar el delivery_pin en /api/deliveries.
 */
export async function approveAndReleaseMultiReleaseOrder(params: {
  contractId: string;
  deliveryPin: string;
  orderId?: string;
  deliveryId?: string;
}): Promise<{
  releaseTxHash: string;
  milestone0ReleaseTxHash: string;
  milestone1ReleaseTxHash: string;
}> {
  const cleanContractId = (params.contractId || "").trim();
  if (!isValidSorobanContractId(cleanContractId)) {
    throw new Error(
      `El contract_id "${cleanContractId}" no es un contrato Soroban Multi-Release válido (C...).`
    );
  }

  const evidence = `Entrega EcoDohmi confirmada${
    params.orderId ? ` (Orden ${params.orderId})` : ""
  }`;

  const milestone0 = await approveAndReleaseSingleMilestone({
    contractId: cleanContractId,
    milestoneIndex: "0",
    evidence: `${evidence} - Hito 1: Mercadería`,
  });

  const milestone1 = await approveAndReleaseSingleMilestone({
    contractId: cleanContractId,
    milestoneIndex: "1",
    evidence: `${evidence} - Hito 2: Envío Ecológico EcoDohmi`,
  });

  console.info("[EcoBanco Testnet Audit][ESCROW_RELEASED]", {
    contractId: cleanContractId,
    orderId: params.orderId ?? null,
    deliveryId: params.deliveryId ?? null,
    milestone0ReleaseTxHash: milestone0.releaseTxHash,
    milestone1ReleaseTxHash: milestone1.releaseTxHash,
  });

  // Actualización no bloqueante del indexer de Trustless Work
  void trustlessWorkRequest("/indexer/update-from-txhash", {
    method: "PUT",
    body: { txHash: milestone1.releaseTxHash },
  }).catch(() => undefined);

  return {
    releaseTxHash: milestone1.releaseTxHash,
    milestone0ReleaseTxHash: milestone0.releaseTxHash,
    milestone1ReleaseTxHash: milestone1.releaseTxHash,
  };
}

/**
 * Diagnóstico de lectura para verificar conectividad en Stellar Testnet y Trustless Work Dev API.
 */
export async function getTrustlessWorkTestnetStatus(): Promise<{
  network: typeof STELLAR_NETWORK;
  horizonUrl: string;
  apiUrl: string;
  treasuryPublic: string;
  treasuryExists: boolean;
  usdcBalance: number;
  indexerReachable: boolean;
}> {
  const { apiUrl, treasuryPublic } = getTrustlessWorkEnv();
  const horizonUrl = getHorizonTestnetUrl();
  const acct = await fetchHorizonAccount(treasuryPublic);
  const usdcEntry = acct?.balances?.find(
    (b) =>
      b.asset_code === "USDC" &&
      b.asset_issuer === STELLAR_TESTNET_USDC_ISSUER
  );

  let indexerReachable = false;
  try {
    await trustlessWorkRequest<unknown>(
      `/helper/get-escrows-by-signer?signer=${encodeURIComponent(treasuryPublic)}`,
      { method: "GET" }
    );
    indexerReachable = true;
  } catch {
    indexerReachable = false;
  }

  return {
    network: STELLAR_NETWORK,
    horizonUrl,
    apiUrl,
    treasuryPublic,
    treasuryExists: Boolean(acct),
    usdcBalance: usdcEntry ? Number(usdcEntry.balance) : 0,
    indexerReachable,
  };
}
