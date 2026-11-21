import {
  Delivery,
  EscrowTransaction,
  Order,
  Product,
  Rider,
  RiderVehicleType,
  User,
} from "../types/ecobanco";
import { EcoBancoSession } from "./session";
import { areSameBolivianPhone, normalizeBolivianPhone } from "./phone";
import {
  SUPABASE_BUCKETS,
  SupabaseProductRow,
  SupabaseRampTransactionRow,
  SupabaseUserRow,
  isRiderUserRow,
  supabaseTables,
  uploadImageToStorage,
} from "./supabase";
import {
  approveAndReleaseMultiReleaseOrder,
  deployAndFundMultiReleaseOrder,
  isValidSorobanContractId,
} from "./trustlessWork";

export const SUBSCRIPTION_COST = 100; // 100 MOTES o 100 Bs en FIAT
export const PREMIUM_FREE_DELIVERIES = 5;
export const PROSUMER_WELCOME_MOTES = 50;
export const RIDER_DELIVERY_FEE_MOTES = 5;
export const RIDER_DELIVERY_FEE_USDC = 0.5;

const STELLAR_CLASSIC_ACCOUNT_REGEX = /^G[A-Z2-7]{55}$/;
const STELLAR_TX_HASH_REGEX = /^[a-fA-F0-9]{64}$/;
const POLLAR_ORDER_ID_REGEX = /^[A-Za-z0-9_:-]{8,128}$/;
const STELLAR_HORIZON_TESTNET_URL = "https://horizon-testnet.stellar.org";
const CLOSED_STORE_MARKER = "[[ECO_CLOSED]]";

const globalRampStore = globalThis as unknown as {
  ecoBancoProcessedRampKeys?: Set<string>;
  ecoBancoMerchantOpenOverrides?: Map<string, boolean>;
};
const processedRampKeys: Set<string> =
  globalRampStore.ecoBancoProcessedRampKeys ??
  (globalRampStore.ecoBancoProcessedRampKeys = new Set<string>());
const merchantOpenOverrides: Map<string, boolean> =
  globalRampStore.ecoBancoMerchantOpenOverrides ??
  (globalRampStore.ecoBancoMerchantOpenOverrides = new Map<string, boolean>());

function stripClosedMarker(text?: string | null): string {
  return (text || "").replace(/\s*\[\[ECO_CLOSED\]\]\s*/g, "").trim();
}

function extractStoreOpenAndDescription(row: SupabaseUserRow): {
  isOpen: boolean;
  cleanDescription: string;
} {
  const rawDesc = row.store_description ?? "";
  const cleanDescription = stripClosedMarker(rawDesc);
  if (typeof row.is_open === "boolean") {
    return { isOpen: row.is_open, cleanDescription };
  }
  if (merchantOpenOverrides.has(row.id)) {
    return {
      isOpen: Boolean(merchantOpenOverrides.get(row.id)),
      cleanDescription,
    };
  }
  if (rawDesc.includes(CLOSED_STORE_MARKER)) {
    return { isOpen: false, cleanDescription };
  }
  return { isOpen: true, cleanDescription };
}

function encodeOrderProductName(
  baseName: string,
  quantity: number,
  specialNotes?: string
): string {
  const cleanBase = baseName.trim();
  const qtyPrefix = quantity > 1 ? `${quantity}x ` : "";
  const cleanNotes = (specialNotes || "").trim();
  const noteSuffix = cleanNotes ? ` · Nota: ${cleanNotes}` : "";
  return `${qtyPrefix}${cleanBase}${noteSuffix}`;
}

function parseOrderProductMeta(
  rawName?: string | null,
  explicitQty?: number | null,
  explicitNotes?: string | null
): {
  displayName: string;
  quantity: number;
  specialNotes: string;
} {
  let text = (rawName || "").trim();
  let parsedNotes = (explicitNotes || "").trim();
  let parsedQty =
    typeof explicitQty === "number" && Number.isFinite(explicitQty) && explicitQty >= 1
      ? Math.round(explicitQty)
      : 0;

  const noteIdx = text.indexOf(" · Nota: ");
  if (noteIdx >= 0) {
    if (!parsedNotes) {
      parsedNotes = text.slice(noteIdx + " · Nota: ".length).trim();
    }
    text = text.slice(0, noteIdx).trim();
  }

  const qtyMatch = text.match(/^(\d{1,2})x\s+(.+)$/i);
  if (qtyMatch) {
    if (!parsedQty) {
      parsedQty = Math.max(1, Number(qtyMatch[1]) || 1);
    }
    text = qtyMatch[2].trim();
  }

  return {
    displayName: text || rawName || "Pedido EcoBanco",
    quantity: parsedQty >= 1 ? parsedQty : 1,
    specialNotes: parsedNotes,
  };
}

async function verifyStellarTestnetTx(
  txHash: string
): Promise<{ verified: boolean; reason?: string }> {
  const cleanHash = txHash.trim();
  if (!STELLAR_TX_HASH_REGEX.test(cleanHash)) {
    return {
      verified: false,
      reason: "Hash de transacción Stellar inválido.",
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const res = await fetch(
      `${STELLAR_HORIZON_TESTNET_URL}/transactions/${encodeURIComponent(
        cleanHash
      )}`,
      {
        method: "GET",
        signal: controller.signal,
        cache: "no-store",
      }
    );

    if (res.status === 404 || res.status === 400) {
      return {
        verified: false,
        reason:
          "La transacción aún no figura confirmada en Stellar Testnet.",
      };
    }

    if (!res.ok) {
      return { verified: true };
    }

    const txData = (await res.json()) as { successful?: boolean };
    if (txData.successful === false) {
      return {
        verified: false,
        reason: "La transacción falló en Stellar Testnet.",
      };
    }

    return { verified: true };
  } catch {
    // Si Horizon Testnet no responde temporalmente, no bloqueamos una orden ya completada por Pollar
    return { verified: true };
  } finally {
    clearTimeout(timer);
  }
}

function generateReferralCode(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 6);
  const suffix = Math.floor(10 + Math.random() * 90);
  return `ECO-${clean || "USER"}${suffix}`;
}

function generateUniqueRiderInviteCode(users: SupabaseUserRow[]): string {
  const existingCodes = new Set(
    users
      .map((u) => u.rider_invite_code)
      .filter((code): code is string => Boolean(code))
  );

  for (let attempt = 0; attempt < 50; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000);
    const candidate = `ECO-R-${digits}`;
    if (!existingCodes.has(candidate)) {
      return candidate;
    }
  }

  return `ECO-R-${String(Date.now()).slice(-4)}`;
}

function generateFourDigitPin(excludePin?: string): string {
  let pin = String(Math.floor(1000 + Math.random() * 9000));
  if (excludePin && pin === excludePin) {
    const shifted = ((Number(pin) - 1000 + 1) % 9000) + 1000;
    pin = String(shifted);
  }
  return pin;
}

function formatDisplayTime(isoOrText: string): string {
  const parsed = new Date(isoOrText);
  if (Number.isNaN(parsed.getTime())) {
    return isoOrText;
  }
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeDeliveryStatus(
  status?: string
): "pending" | "in_transit" | "delivered" {
  const normalized = (status || "").toLowerCase();
  if (normalized === "in_transit") return "in_transit";
  if (normalized === "delivered") return "delivered";
  return "pending";
}

function mapOrderToTransaction(
  order: Order,
  delivery?: Delivery,
  buyerName?: string
): EscrowTransaction {
  const meta = parseOrderProductMeta(
    order.product_name,
    order.quantity ?? delivery?.quantity,
    order.special_notes ?? delivery?.special_notes
  );
  return {
    contractId: order.contract_id,
    engagementId: order.engagement_id ?? delivery?.engagement_id ?? null,
    fundTxHash: order.fund_tx_hash ?? delivery?.fund_tx_hash ?? null,
    releaseTxHash: order.release_tx_hash ?? delivery?.release_tx_hash ?? null,
    orderId: order.id,
    productId: order.product_id || "",
    productName: meta.displayName,
    quantity: meta.quantity,
    specialNotes: meta.specialNotes || undefined,
    sellerId: order.seller_id,
    sellerName: order.seller_name,
    buyerId: order.buyer_id,
    buyerName: buyerName || delivery?.buyer_name,
    buyerType: order.buyer_type,
    amountMotes: Number(order.amount_motes),
    status: order.status === "RELEASED" ? "RELEASED" : "LOCKED_IN_ESCROW",
    createdAt: formatDisplayTime(order.created_at),
    deliveryId: delivery?.id,
    deliveryStatus: delivery
      ? normalizeDeliveryStatus(delivery.delivery_status)
      : "pending",
    pickupPin: delivery?.pickup_pin,
    deliveryPin: delivery?.delivery_pin,
    usedFreeDelivery: delivery?.used_free_delivery,
    subsidizedByReserve: delivery?.subsidized_by_reserve,
    riderName: delivery?.rider_name ?? null,
    vehicleType: delivery?.vehicle_type,
  };
}

// NUNCA devuelve el campo `password` en las respuestas JSON
function mapUserRow(
  row: SupabaseUserRow,
  orders: Order[],
  deliveries: Delivery[],
  users: SupabaseUserRow[],
  isSessionActive: boolean
): User {
  const freeDeliveries = Number(row.free_deliveries_remaining ?? 0);
  const deliveryByOrderId = new Map(deliveries.map((d) => [d.order_id, d]));
  const userNameById = new Map(
    users.map((u) => [u.id, u.store_name || u.name])
  );

  const isMerchant = row.role === "merchant";
  const isRider = isRiderUserRow(row);
  const motesEnabled =
    isMerchant || isRider
      ? true
      : Boolean(row.motes_enabled || row.is_prosumer);
  const fiatWalletEnabled = isMerchant
    ? Boolean(row.fiat_wallet_enabled || row.is_prosumer || row.is_premium)
    : true;
  const isPremiumOrProsumer = Boolean(row.is_prosumer || row.is_premium);
  const motesBalance =
    isMerchant || isRider
      ? Number(row.motes_balance ?? 0)
      : motesEnabled
      ? Number(row.motes_balance ?? 0)
      : 0;
  const deliveryAddress = row.delivery_address || row.address || "";
  const storeState = extractStoreOpenAndDescription(row);

  return {
    id: row.id,
    role: isRider ? "rider" : row.role,
    name: row.name,
    storeName: row.store_name ?? undefined,
    storeDescription: storeState.cleanDescription,
    address: row.address ?? "",
    deliveryAddress,
    schedule: row.schedule ?? "",
    avatarUrl: row.avatar_url ?? "",
    profileCompleted: Boolean(row.profile_completed),
    phone: row.phone ?? undefined,
    hasFourDigitPin: /^\d{4}$/.test(String(row.password || "").trim()),
    bankQrUrl: row.bank_qr_url ?? "",
    email: row.email ?? undefined,
    isLoggedIn: isSessionActive,
    isOpen: isMerchant ? storeState.isOpen : true,
    isProsumer: isPremiumOrProsumer,
    isPremium: isPremiumOrProsumer,
    fiatWalletEnabled,
    motesEnabled,
    qrEnabled: Boolean(row.qr_enabled || isPremiumOrProsumer),
    motes: motesBalance,
    fiatBs: Number(row.fiat_balance_bs ?? 0),
    freeDeliveries,
    free_deliveries_remaining: freeDeliveries,
    salesCount: Number(row.sales_count ?? 0),
    ciNumber: row.ci_number ?? "",
    selfieUrl: row.selfie_url ?? "",
    ciPhotoUrl: row.ci_photo_url ?? "",
    riderVerified: Boolean(row.rider_verified),
    riderInviteCode: row.rider_invite_code ?? undefined,
    pollar_user_id: row.pollar_user_id ?? null,
    stellar_address: row.stellar_address ?? null,
    referrals: {
      code: row.referral_code || "",
      invitedCount: Number(row.invited_count ?? 0),
      motesEarned: Number(row.motes_earned ?? 0),
      freeDeliveriesEarned: Number(row.free_deliveries_earned ?? 0),
    },
    transactions: orders
      .filter((o) => o.buyer_id === row.id)
      .map((o) =>
        mapOrderToTransaction(
          o,
          deliveryByOrderId.get(o.id),
          o.buyer_id ? userNameById.get(o.buyer_id) : undefined
        )
      ),
  };
}

function mapRiderRow(row: SupabaseUserRow, isSessionActive: boolean): Rider {
  const completedDeliveries = Number(row.sales_count ?? 0);
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || "",
    vehicleType:
      row.store_name === "moto_electrica" ? "moto_electrica" : "bicicleta",
    address: row.address || row.delivery_address || "",
    ciNumber: row.ci_number || "",
    selfieUrl: row.selfie_url || row.avatar_url || "",
    ciPhotoUrl: row.ci_photo_url || "",
    riderVerified: Boolean(row.rider_verified),
    riderInviteCode: row.rider_invite_code || "",
    isLoggedIn: isSessionActive,
    // Todo repartidor verificado tiene AMBAS billeteras (MOTES y FIAT/USDC) activas
    motesEnabled: true,
    fiatWalletEnabled: true,
    motesEarned: Number(row.motes_earned ?? row.motes_balance ?? 0),
    fiatBs: Number(row.fiat_balance_bs ?? 0),
    usdcEarned: Number((completedDeliveries * RIDER_DELIVERY_FEE_USDC).toFixed(2)),
    completedDeliveries,
    pollar_user_id: row.pollar_user_id ?? null,
    stellar_address: row.stellar_address ?? null,
    createdAt: row.created_at,
  };
}

function mapProductRow(
  row: SupabaseProductRow,
  users: SupabaseUserRow[]
): Product {
  const seller = users.find(
    (u) =>
      u.role === "merchant" &&
      (u.id === row.seller_id ||
        (u.store_name &&
          u.store_name.toLowerCase() === row.seller_name.toLowerCase()))
  );

  const sellerState = seller
    ? extractStoreOpenAndDescription(seller)
    : { isOpen: Boolean(row.active), cleanDescription: "" };

  return {
    id: row.id,
    name: row.name,
    sellerId: row.seller_id ?? seller?.id ?? undefined,
    sellerName: seller?.store_name || row.seller_name,
    sellerPhone: seller?.phone ?? row.seller_phone ?? undefined,
    sellerAvatarUrl: seller?.avatar_url || row.seller_avatar_url || "",
    sellerAddress: seller?.address || row.seller_address || "",
    sellerSchedule: seller?.schedule || row.seller_schedule || "",
    sellerDescription: sellerState.cleanDescription,
    sellerFreeDeliveries: Number(seller?.free_deliveries_remaining ?? 0),
    sellerIsOpen: sellerState.isOpen,
    category: (row.category as Product["category"]) || undefined,
    priceMotes: Number(row.price_motes),
    imageUrl: row.image_url,
    description: row.description,
    active: Boolean(row.active),
    createdAt: row.created_at,
  };
}

function enrichDeliveriesWithContext(
  deliveries: Delivery[],
  orders: Order[],
  users: SupabaseUserRow[]
): Delivery[] {
  const orderById = new Map(orders.map((o) => [o.id, o]));
  const userById = new Map(users.map((u) => [u.id, u]));

  return deliveries.map((del) => {
    const order = orderById.get(del.order_id);
    const seller = del.seller_id ? userById.get(del.seller_id) : undefined;
    const buyer = del.buyer_id ? userById.get(del.buyer_id) : undefined;
    const productMeta = parseOrderProductMeta(
      del.product_name || order?.product_name || "Pedido EcoBanco",
      del.quantity ?? order?.quantity,
      del.special_notes ?? order?.special_notes
    );

    return {
      ...del,
      delivery_status: normalizeDeliveryStatus(del.delivery_status),
      contract_id: del.contract_id || order?.contract_id || "",
      engagement_id: del.engagement_id ?? order?.engagement_id ?? null,
      fund_tx_hash: del.fund_tx_hash ?? order?.fund_tx_hash ?? null,
      release_tx_hash: del.release_tx_hash ?? order?.release_tx_hash ?? null,
      product_name: productMeta.displayName,
      quantity: productMeta.quantity,
      special_notes: productMeta.specialNotes || null,
      amount_motes: Number(del.amount_motes ?? order?.amount_motes ?? 0),
      seller_name:
        del.seller_name || seller?.store_name || order?.seller_name || "",
      seller_phone: del.seller_phone ?? seller?.phone ?? null,
      pickup_address:
        del.pickup_address || seller?.address || "Comercio EcoBanco",
      buyer_name:
        del.buyer_name || buyer?.store_name || buyer?.name || "Vecino EcoBanco",
      delivery_address:
        del.delivery_address ||
        buyer?.delivery_address ||
        buyer?.address ||
        "Entrega en comunidad",
      subsidized_by_reserve:
        del.subsidized_by_reserve !== undefined
          ? Boolean(del.subsidized_by_reserve)
          : Boolean(del.used_free_delivery),
      delivery_fee_motes: Number(
        del.delivery_fee_motes ?? RIDER_DELIVERY_FEE_MOTES
      ),
      delivery_fee_usdc: Number(
        del.delivery_fee_usdc ?? RIDER_DELIVERY_FEE_USDC
      ),
    };
  });
}

export function createEmptyBuyer(): User {
  return {
    id: "",
    role: "buyer",
    name: "",
    email: "",
    phone: "",
    address: "",
    deliveryAddress: "",
    isLoggedIn: false,
    isProsumer: false,
    isPremium: false,
    fiatWalletEnabled: true,
    motesEnabled: false,
    qrEnabled: false,
    motes: 0,
    fiatBs: 0,
    freeDeliveries: 0,
    free_deliveries_remaining: 0,
    pollar_user_id: null,
    stellar_address: null,
    referrals: {
      code: "",
      invitedCount: 0,
      motesEarned: 0,
      freeDeliveriesEarned: 0,
    },
    transactions: [],
  };
}

export class SupabaseEcoBancoRepository {
  public async getSessionUsers(session: EcoBancoSession): Promise<{
    buyer: User;
    merchant: User | null;
    rider: Rider | null;
    activeBuyerType: "buyer" | "merchant";
  }> {
    if (!session.buyerId && !session.merchantId && !session.riderId) {
      return {
        buyer: createEmptyBuyer(),
        merchant: null,
        rider: null,
        activeBuyerType: "buyer",
      };
    }

    if (session.riderId && !session.buyerId && !session.merchantId) {
      const riderRow = await supabaseTables.getUserById(session.riderId);
      const validRider =
        riderRow && isRiderUserRow(riderRow)
          ? mapRiderRow(riderRow, true)
          : null;
      return {
        buyer: createEmptyBuyer(),
        merchant: null,
        rider: validRider,
        activeBuyerType: "buyer",
      };
    }

    const [users, orders, rawDeliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const deliveries = enrichDeliveriesWithContext(rawDeliveries, orders, users);

    const merchantRow = session.merchantId
      ? users.find(
          (u) => u.role === "merchant" && u.id === session.merchantId
        ) || null
      : null;

    const buyerRow = session.buyerId
      ? users.find(
          (u) =>
            u.role === "buyer" &&
            !isRiderUserRow(u) &&
            u.id === session.buyerId
        ) || null
      : null;

    const riderRow = session.riderId
      ? users.find((u) => isRiderUserRow(u) && u.id === session.riderId) || null
      : null;

    const activeBuyerType: "buyer" | "merchant" =
      session.activeBuyerType === "merchant" && merchantRow
        ? "merchant"
        : "buyer";

    return {
      buyer: buyerRow
        ? mapUserRow(buyerRow, orders, deliveries, users, true)
        : createEmptyBuyer(),
      merchant: merchantRow
        ? mapUserRow(merchantRow, orders, deliveries, users, true)
        : null,
      rider: riderRow ? mapRiderRow(riderRow, true) : null,
      activeBuyerType,
    };
  }

  public async getState(session: EcoBancoSession): Promise<{
    buyer: User;
    merchant: User | null;
    products: Product[];
    orders: Order[];
    deliveries: Delivery[];
    rider: Rider | null;
    activeBuyerType: "buyer" | "merchant";
  }> {
    const [users, productRows, orders, rawDeliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listProducts(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const deliveries = enrichDeliveriesWithContext(rawDeliveries, orders, users);

    const merchantRow = session.merchantId
      ? users.find(
          (u) => u.role === "merchant" && u.id === session.merchantId
        ) || null
      : null;

    const buyerRow = session.buyerId
      ? users.find(
          (u) =>
            u.role === "buyer" &&
            !isRiderUserRow(u) &&
            u.id === session.buyerId
        ) || null
      : null;

    const riderRow = session.riderId
      ? users.find((u) => isRiderUserRow(u) && u.id === session.riderId) || null
      : null;

    const activeBuyerType: "buyer" | "merchant" =
      session.activeBuyerType === "merchant" && merchantRow
        ? "merchant"
        : "buyer";

    return {
      buyer: buyerRow
        ? mapUserRow(buyerRow, orders, deliveries, users, true)
        : createEmptyBuyer(),
      merchant: merchantRow
        ? mapUserRow(merchantRow, orders, deliveries, users, true)
        : null,
      products: productRows.map((row) => mapProductRow(row, users)),
      orders,
      deliveries,
      rider: riderRow ? mapRiderRow(riderRow, true) : null,
      activeBuyerType,
    };
  }

  public async getProducts(options?: {
    includeClosed?: boolean;
    merchantId?: string;
  }): Promise<Product[]> {
    const [rows, users] = await Promise.all([
      supabaseTables.listProducts(),
      supabaseTables.listUsers(),
    ]);
    let mapped = rows.map((row) => mapProductRow(row, users));

    if (options?.merchantId) {
      const merchant = users.find(
        (u) => u.role === "merchant" && u.id === options.merchantId
      );
      const merchantStoreLower = (merchant?.store_name || "").toLowerCase();
      mapped = mapped.filter(
        (p) =>
          p.sellerId === options.merchantId ||
          (merchantStoreLower &&
            p.sellerName.toLowerCase() === merchantStoreLower)
      );
    }

    if (options?.includeClosed) {
      return mapped;
    }
    return mapped.filter((p) => p.active && p.sellerIsOpen !== false);
  }

  public async registerMerchant(
    ownerName: string,
    storeName: string,
    phone: string,
    pollar?: { pollarUserId?: string; stellarAddress?: string },
    password?: string
  ): Promise<{ ok: boolean; error?: string; merchant?: User }> {
    const cleanOwner = ownerName.trim();
    const cleanStore = storeName.trim();
    const cleanPhone =
      normalizeBolivianPhone(phone) ?? phone.replace(/\s+/g, "").trim();
    const cleanPass = (password || "").trim() || cleanPhone;
    const cleanPollarUserId = pollar?.pollarUserId?.trim() || null;
    const cleanStellarAddress =
      pollar?.stellarAddress &&
      STELLAR_CLASSIC_ACCOUNT_REGEX.test(pollar.stellarAddress.trim())
        ? pollar.stellarAddress.trim()
        : null;

    if (!cleanOwner || !cleanStore || !cleanPhone) {
      return {
        ok: false,
        error: "Debes completar los 3 datos para crear tu cuenta.",
      };
    }

    const users = await supabaseTables.listUsers();
    const exists = users.find(
      (u) =>
        areSameBolivianPhone(u.phone, cleanPhone) ||
        (u.role === "merchant" &&
          u.store_name?.toLowerCase() === cleanStore.toLowerCase())
    );

    if (exists) {
      return {
        ok: false,
        error:
          "Ya existe una cuenta registrada con ese nombre de negocio o número de WhatsApp.",
      };
    }

    const newRow: SupabaseUserRow = {
      id: `mer-${Date.now()}`,
      role: "merchant",
      name: cleanOwner,
      store_name: cleanStore,
      store_description: "",
      address: "",
      schedule: "",
      avatar_url: "",
      profile_completed: false,
      phone: cleanPhone,
      password: cleanPass,
      bank_qr_url: "",
      email: null,
      is_prosumer: false,
      is_premium: false,
      fiat_wallet_enabled: false,
      qr_enabled: false,
      motes_enabled: true,
      motes_balance: 0,
      fiat_balance_bs: 0,
      free_deliveries_remaining: 0,
      sales_count: 0,
      referral_code: generateReferralCode(cleanStore),
      invited_count: 0,
      motes_earned: 0,
      free_deliveries_earned: 0,
      delivery_address: "",
      ci_number: "",
      selfie_url: "",
      ci_photo_url: "",
      rider_verified: false,
      rider_invite_code: null,
      pollar_user_id: cleanPollarUserId,
      stellar_address: cleanStellarAddress,
      created_at: new Date().toISOString(),
    };

    const created = await supabaseTables.insertUser(newRow);
    const [orders, deliveries] = await Promise.all([
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);
    return {
      ok: true,
      merchant: mapUserRow(
        created,
        orders,
        deliveries,
        [...users, created],
        true
      ),
    };
  }

  public async loginMerchant(
    identifier: string,
    password: string
  ): Promise<{ ok: boolean; error?: string; merchant?: User }> {
    const normalize = (str: string) =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

    const cleanId = normalize(identifier);
    const cleanPhoneId = identifier.replace(/\s+/g, "").trim();
    const cleanPass = password.replace(/\s+/g, "").trim();

    const users = await supabaseTables.listUsers();
    const found = users.find(
      (u) =>
        u.role === "merchant" &&
        (normalize(u.store_name || "") === cleanId ||
          normalize(u.name) === cleanId ||
          areSameBolivianPhone(u.phone, cleanPhoneId))
    );

    if (!found) {
      return {
        ok: false,
        error:
          "No encontramos una cuenta con ese nombre, negocio o número de teléfono.",
      };
    }

    if (found.password !== cleanPass) {
      return {
        ok: false,
        error: "Contraseña incorrecta.",
      };
    }

    const [orders, deliveries] = await Promise.all([
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    return {
      ok: true,
      merchant: mapUserRow(found, orders, deliveries, users, true),
    };
  }

  public async updateMerchantSettings(
    session: EcoBancoSession,
    input: {
      storeName?: string;
      password?: string;
      storeDescription?: string;
      address?: string;
      schedule?: string;
      avatarUrl?: string;
      bankQrUrl?: string;
      isOpen?: boolean;
    }
  ): Promise<{ ok: boolean; error?: string; merchant?: User }> {
    if (!session.merchantId) {
      return { ok: false, error: "No hay sesión activa de comerciante." };
    }

    const users = await supabaseTables.listUsers();
    const current = users.find(
      (u) => u.role === "merchant" && u.id === session.merchantId
    );

    if (!current) {
      return { ok: false, error: "No hay sesión activa de comerciante." };
    }

    let resolvedAvatarUrl = current.avatar_url;
    if (input.avatarUrl !== undefined) {
      if (input.avatarUrl.startsWith("data:")) {
        const uploaded = await uploadImageToStorage(
          SUPABASE_BUCKETS.AVATARS,
          input.avatarUrl,
          current.id
        );
        resolvedAvatarUrl = uploaded.publicUrl;
      } else {
        resolvedAvatarUrl = input.avatarUrl;
      }
    }

    let resolvedBankQrUrl = current.bank_qr_url;
    if (
      (current.is_prosumer || current.qr_enabled) &&
      input.bankQrUrl !== undefined
    ) {
      if (input.bankQrUrl.startsWith("data:")) {
        const uploaded = await uploadImageToStorage(
          SUPABASE_BUCKETS.QR_BANCARIOS,
          input.bankQrUrl,
          current.id
        );
        resolvedBankQrUrl = uploaded.publicUrl;
      } else {
        resolvedBankQrUrl = input.bankQrUrl;
      }
    }

    const currentStoreState = extractStoreOpenAndDescription(current);
    const nextIsOpen =
      typeof input.isOpen === "boolean" ? input.isOpen : currentStoreState.isOpen;
    merchantOpenOverrides.set(current.id, nextIsOpen);

    const nextStoreName =
      input.storeName && input.storeName.trim()
        ? input.storeName.trim()
        : current.store_name || current.name;

    const nextPassword =
      input.password && input.password.trim()
        ? input.password.trim()
        : current.password;

    const cleanDescription =
      input.storeDescription !== undefined
        ? stripClosedMarker(input.storeDescription)
        : currentStoreState.cleanDescription;

    const persistedDescription = nextIsOpen
      ? cleanDescription
      : cleanDescription
      ? `${cleanDescription} ${CLOSED_STORE_MARKER}`
      : CLOSED_STORE_MARKER;

    const nextAddress =
      input.address !== undefined ? input.address.trim() : current.address;

    const nextSchedule =
      input.schedule !== undefined ? input.schedule.trim() : current.schedule;

    const profileCompleted = Boolean(
      cleanDescription && nextAddress && nextSchedule && resolvedAvatarUrl
    );

    const updated = await supabaseTables.updateUser(current.id, {
      store_name: nextStoreName,
      password: nextPassword,
      store_description: persistedDescription,
      address: nextAddress,
      schedule: nextSchedule,
      avatar_url: resolvedAvatarUrl,
      bank_qr_url: resolvedBankQrUrl,
      profile_completed: profileCompleted,
      is_open: nextIsOpen,
    });

    await supabaseTables.updateProductsBySeller(current.id, {
      seller_name: nextStoreName,
      seller_avatar_url: resolvedAvatarUrl,
      seller_address: nextAddress,
      seller_schedule: nextSchedule,
      active: nextIsOpen,
    });

    const [orders, deliveries] = await Promise.all([
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);
    return {
      ok: true,
      merchant: mapUserRow(
        updated
          ? { ...updated, is_open: nextIsOpen, store_description: persistedDescription }
          : { ...current, is_open: nextIsOpen, store_description: persistedDescription },
        orders,
        deliveries,
        users,
        true
      ),
    };
  }

  public async toggleMerchantOpen(
    session: EcoBancoSession,
    isOpen: boolean
  ): Promise<{ ok: boolean; error?: string; merchant?: User }> {
    return this.updateMerchantSettings(session, { isOpen });
  }

  public async upgradeMerchantSubscription(
    session: EcoBancoSession,
    method: "motes" | "fiat"
  ): Promise<{ ok: boolean; error?: string; merchant?: User }> {
    if (!session.merchantId) {
      return { ok: false, error: "No hay sesión activa de comerciante." };
    }

    const users = await supabaseTables.listUsers();
    const current = users.find(
      (u) => u.role === "merchant" && u.id === session.merchantId
    );

    if (!current) {
      return { ok: false, error: "No hay sesión activa de comerciante." };
    }

    const [orders, deliveries] = await Promise.all([
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    if (current.is_prosumer || current.is_premium) {
      return {
        ok: true,
        merchant: mapUserRow(current, orders, deliveries, users, true),
      };
    }

    const currentMotes = Number(current.motes_balance ?? 0);
    const currentFiat = Number(current.fiat_balance_bs ?? 0);

    if (method === "motes") {
      if (currentMotes < SUBSCRIPTION_COST) {
        return {
          ok: false,
          error: `Necesitas acumular ${SUBSCRIPTION_COST} MOTES en ventas para activar Caserita Aliada con tus MOTES (te faltan ${
            SUBSCRIPTION_COST - currentMotes
          } MOTES), o realizar la recarga de ${SUBSCRIPTION_COST} Bs mediante Pollar.`,
        };
      }

      const updated = await supabaseTables.updateUser(current.id, {
        motes_balance: currentMotes - SUBSCRIPTION_COST,
        is_prosumer: true,
        is_premium: true,
        fiat_wallet_enabled: true,
        qr_enabled: true,
        free_deliveries_remaining:
          Number(current.free_deliveries_remaining ?? 0) +
          PREMIUM_FREE_DELIVERIES,
      });

      return {
        ok: true,
        merchant: mapUserRow(updated || current, orders, deliveries, users, true),
      };
    }

    // Pago en Bs: requiere saldo real >= 100 Bs (las recargas directas pasan por RampWidget + confirm_ramp_topup)
    if (currentFiat < SUBSCRIPTION_COST) {
      return {
        ok: false,
        error: `Saldo insuficiente (necesitas ${SUBSCRIPTION_COST} Bs disponibles o ${SUBSCRIPTION_COST} MOTES en ventas). Realiza la recarga de ${SUBSCRIPTION_COST} Bs con QR a través de Pollar para desbloquear Caserita Aliada.`,
      };
    }

    const updated = await supabaseTables.updateUser(current.id, {
      fiat_balance_bs: currentFiat - SUBSCRIPTION_COST,
      is_prosumer: true,
      is_premium: true,
      fiat_wallet_enabled: true,
      qr_enabled: true,
      free_deliveries_remaining:
        Number(current.free_deliveries_remaining ?? 0) +
        PREMIUM_FREE_DELIVERIES,
    });
    return {
      ok: true,
      merchant: mapUserRow(updated || current, orders, deliveries, users, true),
    };
  }

  // ============================================================================
  // Reglas estrictas del Comprador:
  // - Inicia estrictamente con motes_balance = 0, motes_enabled = false, fiat_wallet_enabled = true
  // - Exige WhatsApp (phone) y Dirección de entrega (delivery_address)
  // - Los bonos de referido SOLO se acreditan cuando un usuario NUEVO real se registra con código
  // ============================================================================
  public async registerOrLoginBuyer(input: {
    name: string;
    email?: string;
    phone: string;
    deliveryAddress: string;
    referralCode?: string;
    pollarUserId?: string;
    stellarAddress?: string;
  }): Promise<{ ok: boolean; error?: string; buyer?: User }> {
    const cleanName = (input.name || "").trim();
    const cleanEmail = (input.email || "").trim().toLowerCase();
    const cleanPhone =
      normalizeBolivianPhone(input.phone) ??
      (input.phone || "").replace(/\s+/g, "").trim();
    const cleanAddress = (input.deliveryAddress || "").trim();
    const cleanReferralCode = (input.referralCode || "").trim().toUpperCase();
    const cleanPollarUserId = input.pollarUserId?.trim() || null;
    const cleanStellarAddress =
      input.stellarAddress &&
      STELLAR_CLASSIC_ACCOUNT_REGEX.test(input.stellarAddress.trim())
        ? input.stellarAddress.trim()
        : null;

    if (!cleanName || !cleanPhone) {
      return {
        ok: false,
        error:
          "Escribe tu nombre o apodo y tu número de WhatsApp para continuar.",
      };
    }

    const [users, orders, deliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const existingBuyer = users.find(
      (u) =>
        u.role === "buyer" &&
        !isRiderUserRow(u) &&
        (areSameBolivianPhone(u.phone, cleanPhone) ||
          (cleanEmail && u.email?.toLowerCase() === cleanEmail))
    );

    const phoneConflict = users.find(
      (u) =>
        areSameBolivianPhone(u.phone, cleanPhone) && u.id !== existingBuyer?.id
    );
    if (phoneConflict) {
      return {
        ok: false,
        error:
          "Ese número de WhatsApp ya está registrado en una cuenta de caserita o repartidor. Usa otro número para pedir como vecino.",
      };
    }

    if (existingBuyer) {
      const isProsumer = Boolean(
        existingBuyer.is_prosumer ||
          existingBuyer.is_premium ||
          existingBuyer.motes_enabled
      );
      const updated = await supabaseTables.updateUser(existingBuyer.id, {
        name: cleanName,
        ...(cleanEmail ? { email: cleanEmail } : {}),
        phone: cleanPhone,
        ...(cleanAddress
          ? { address: cleanAddress, delivery_address: cleanAddress }
          : {}),
        fiat_wallet_enabled: true,
        motes_enabled: isProsumer,
        motes_balance: isProsumer
          ? Number(existingBuyer.motes_balance ?? 0)
          : 0,
        ...(cleanPollarUserId ? { pollar_user_id: cleanPollarUserId } : {}),
        ...(cleanStellarAddress ? { stellar_address: cleanStellarAddress } : {}),
      });
      return {
        ok: true,
        buyer: mapUserRow(
          updated || existingBuyer,
          orders,
          deliveries,
          users,
          true
        ),
      };
    }

    const newBuyerRow: SupabaseUserRow = {
      id: `usr-${Date.now()}`,
      role: "buyer",
      name: cleanName,
      store_name: null,
      store_description: "",
      address: cleanAddress,
      delivery_address: cleanAddress,
      schedule: "",
      avatar_url: "",
      profile_completed: Boolean(cleanAddress),
      phone: cleanPhone,
      password: null,
      bank_qr_url: "",
      email: cleanEmail || null,
      is_prosumer: false,
      is_premium: false,
      fiat_wallet_enabled: true,
      motes_enabled: false,
      qr_enabled: false,
      motes_balance: 0,
      fiat_balance_bs: 0,
      free_deliveries_remaining: 0,
      sales_count: 0,
      referral_code: generateReferralCode(cleanName),
      invited_count: 0,
      motes_earned: 0,
      free_deliveries_earned: 0,
      ci_number: "",
      selfie_url: "",
      ci_photo_url: "",
      rider_verified: false,
      rider_invite_code: null,
      pollar_user_id: cleanPollarUserId,
      stellar_address: cleanStellarAddress,
      created_at: new Date().toISOString(),
    };

    const created = await supabaseTables.insertUser(newBuyerRow);

    // Acreditar bono de referido ÚNICAMENTE porque un usuario NUEVO real se registró con un código válido
    if (cleanReferralCode) {
      const referrer = users.find(
        (u) =>
          u.id !== created.id &&
          (u.referral_code || "").toUpperCase() === cleanReferralCode
      );
      if (referrer) {
        const referrerCanEarnMotes = Boolean(
          referrer.role === "merchant" ||
            isRiderUserRow(referrer) ||
            referrer.motes_enabled ||
            referrer.is_prosumer
        );
        await supabaseTables.updateUser(referrer.id, {
          ...(referrerCanEarnMotes
            ? {
                motes_balance: Number(referrer.motes_balance ?? 0) + 2,
                motes_earned: Number(referrer.motes_earned ?? 0) + 2,
              }
            : {}),
          free_deliveries_remaining:
            Number(referrer.free_deliveries_remaining ?? 0) + 1,
          invited_count: Number(referrer.invited_count ?? 0) + 1,
          free_deliveries_earned:
            Number(referrer.free_deliveries_earned ?? 0) + 1,
        });
      }
    }

    return {
      ok: true,
      buyer: mapUserRow(
        created,
        orders,
        deliveries,
        [...users, created],
        true
      ),
    };
  }

  public async loginBuyerByPhone(
    phone: string
  ): Promise<{ ok: boolean; error?: string; buyer?: User }> {
    const cleanPhone =
      normalizeBolivianPhone(phone) ?? (phone || "").replace(/\s+/g, "").trim();
    if (!cleanPhone) {
      return { ok: false, error: "Escribe tu número de WhatsApp." };
    }

    const [users, orders, deliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const found = users.find(
      (u) =>
        u.role === "buyer" &&
        !isRiderUserRow(u) &&
        areSameBolivianPhone(u.phone, cleanPhone)
    );

    if (!found) {
      return {
        ok: false,
        error:
          "No encontramos pedidos guardados con ese WhatsApp todavía. Puedes pedir directo en el Mercado del Barrio sin registrarte.",
      };
    }

    return {
      ok: true,
      buyer: mapUserRow(found, orders, deliveries, users, true),
    };
  }

  public async updateBuyerProfile(
    session: EcoBancoSession,
    input: {
      name?: string;
      email?: string;
      phone: string;
      deliveryAddress: string;
    }
  ): Promise<{ ok: boolean; error?: string; buyer?: User }> {
    if (!session.buyerId) {
      return { ok: false, error: "No hay sesión activa de comprador." };
    }

    const cleanPhone =
      normalizeBolivianPhone(input.phone) ??
      (input.phone || "").replace(/\s+/g, "").trim();
    const cleanAddress = (input.deliveryAddress || "").trim();

    if (!cleanPhone || !cleanAddress) {
      return {
        ok: false,
        error:
          "El número de WhatsApp y la dirección de entrega son obligatorios.",
      };
    }

    const [users, orders, deliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const activeBuyer = users.find(
      (u) =>
        u.role === "buyer" && !isRiderUserRow(u) && u.id === session.buyerId
    );

    if (!activeBuyer) {
      return { ok: false, error: "No hay sesión activa de comprador." };
    }

    const phoneConflict = users.find(
      (u) => areSameBolivianPhone(u.phone, cleanPhone) && u.id !== activeBuyer.id
    );
    if (phoneConflict) {
      return {
        ok: false,
        error:
          "Ese número de WhatsApp ya está registrado en otra cuenta de EcoBanco.",
      };
    }

    const updated = await supabaseTables.updateUser(activeBuyer.id, {
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(input.email?.trim()
        ? { email: input.email.trim().toLowerCase() }
        : {}),
      phone: cleanPhone,
      address: cleanAddress,
      delivery_address: cleanAddress,
      fiat_wallet_enabled: true,
    });

    return {
      ok: true,
      buyer: mapUserRow(updated || activeBuyer, orders, deliveries, users, true),
    };
  }

  // Las recargas manuales sin orden verificada en Pollar están deshabilitadas
  public async confirmFiatTopup(): Promise<{
    ok: boolean;
    error?: string;
    buyer?: User;
    merchant?: User | null;
  }> {
    return {
      ok: false,
      error:
        "Las recargas manuales sin orden verificada están deshabilitadas. Usa Cargar saldo con QR de tu Banco (Pollar Ramp) para acreditar saldo real.",
    };
  }

  // Acreditación real verificada desde <RampWidget> (Pollar ONRAMP completed -> Supabase)
  public async confirmRampTopup(
    session: EcoBancoSession,
    input: {
      role?: "buyer" | "merchant";
      purpose?: "fiat_topup" | "prosumer_subscription" | "merchant_premium";
      pollarOrderId: string;
      direction?: string;
      orderState?: string;
      amountBs: number;
      fiatCurrency?: string;
      assetCode?: string;
      cryptoAmount?: number | null;
      onchainTxHash?: string | null;
      pollarUserId?: string | null;
      stellarAddress?: string | null;
    }
  ): Promise<{
    ok: boolean;
    duplicate?: boolean;
    error?: string;
    creditedBs?: number;
    pollarOrderId?: string;
    buyer?: User;
    merchant?: User | null;
  }> {
    const cleanOrderId = (input.pollarOrderId || "").trim();
    if (!POLLAR_ORDER_ID_REGEX.test(cleanOrderId)) {
      return {
        ok: false,
        error: "Identificador de orden de Pollar inválido o ausente.",
      };
    }

    const cleanState = (input.orderState || "").trim().toLowerCase();
    if (cleanState !== "completed") {
      return {
        ok: false,
        error:
          "La orden de Pollar aún no ha finalizado (state !== 'completed').",
      };
    }

    const cleanDirection = (input.direction || "").trim().toUpperCase();
    if (cleanDirection !== "ONRAMP") {
      return {
        ok: false,
        error: "Solo las órdenes ONRAMP completadas pueden acreditar saldo.",
      };
    }

    const cleanFiat = (input.fiatCurrency || "").trim().toUpperCase();
    if (cleanFiat !== "BOB") {
      return {
        ok: false,
        error: "La moneda de origen de la orden debe ser BOB.",
      };
    }

    const cleanAsset = (input.assetCode || "").trim().toUpperCase();
    if (cleanAsset !== "USDC") {
      return {
        ok: false,
        error: "El activo destino de la orden debe ser USDC.",
      };
    }

    const amount = Math.round(Number(input.amountBs) * 100) / 100;
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
      return {
        ok: false,
        error: "Monto de orden Pollar inválido (debe estar entre 1 Bs y 50000 Bs).",
      };
    }

    const purpose: "fiat_topup" | "prosumer_subscription" | "merchant_premium" =
      input.purpose === "prosumer_subscription"
        ? "prosumer_subscription"
        : input.purpose === "merchant_premium"
        ? "merchant_premium"
        : "fiat_topup";

    const targetRole: "buyer" | "merchant" =
      purpose === "merchant_premium"
        ? "merchant"
        : purpose === "prosumer_subscription"
        ? "buyer"
        : input.role === "merchant"
        ? "merchant"
        : "buyer";

    if (
      (purpose === "prosumer_subscription" || purpose === "merchant_premium") &&
      amount < SUBSCRIPTION_COST
    ) {
      return {
        ok: false,
        error: `El monto acreditado (${amount} Bs) es menor a los ${SUBSCRIPTION_COST} Bs requeridos para activar este plan.`,
      };
    }

    const targetId =
      targetRole === "merchant" ? session.merchantId : session.buyerId;
    if (!targetId) {
      return {
        ok: false,
        error: "Debes iniciar sesión antes de acreditar una recarga de Pollar.",
      };
    }

    const cleanStellarAddress = (input.stellarAddress || "").trim();
    if (!STELLAR_CLASSIC_ACCOUNT_REGEX.test(cleanStellarAddress)) {
      return {
        ok: false,
        error:
          "Se requiere una billetera Stellar clásica (G...) verificada en Pollar para acreditar la recarga.",
      };
    }

    const cleanPollarUserId = input.pollarUserId?.trim() || null;
    const cleanTxHash = input.onchainTxHash?.trim() || null;
    if (cleanTxHash) {
      const txCheck = await verifyStellarTestnetTx(cleanTxHash);
      if (!txCheck.verified) {
        return {
          ok: false,
          error:
            txCheck.reason ||
            "No pudimos validar la transacción en Stellar Testnet.",
        };
      }
    }

    const [users, orders, deliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);

    const targetUser = users.find((u) =>
      targetRole === "merchant"
        ? u.role === "merchant" && u.id === targetId
        : u.role === "buyer" && !isRiderUserRow(u) && u.id === targetId
    );
    if (!targetUser) {
      return { ok: false, error: "Cuenta de EcoBanco no encontrada." };
    }

    if (
      targetUser.stellar_address &&
      targetUser.stellar_address !== cleanStellarAddress
    ) {
      return {
        ok: false,
        error:
          "La billetera Stellar conectada no coincide con la cuenta vinculada a este perfil.",
      };
    }
    if (
      targetUser.pollar_user_id &&
      cleanPollarUserId &&
      targetUser.pollar_user_id !== cleanPollarUserId
    ) {
      return {
        ok: false,
        error:
          "La sesión de Pollar no coincide con el usuario vinculado a este perfil.",
      };
    }

    const orderKey = `order:${cleanOrderId}`;
    const hashKey = cleanTxHash ? `tx:${cleanTxHash}` : null;

    if (
      processedRampKeys.has(orderKey) ||
      (hashKey && processedRampKeys.has(hashKey))
    ) {
      return {
        ok: false,
        duplicate: true,
        error: "Esta orden de Pollar ya fue acreditada anteriormente.",
      };
    }

    const existingLookup = await supabaseTables.findRampTransactionByOrderOrHash(
      cleanOrderId,
      cleanTxHash
    );
    if (existingLookup.existing) {
      processedRampKeys.add(orderKey);
      if (hashKey) processedRampKeys.add(hashKey);
      return {
        ok: false,
        duplicate: true,
        error: "Esta orden de Pollar ya fue acreditada anteriormente.",
      };
    }

    processedRampKeys.add(orderKey);
    if (hashKey) processedRampKeys.add(hashKey);

    const parsedCrypto = Number(input.cryptoAmount);
    const cryptoAmount =
      Number.isFinite(parsedCrypto) && parsedCrypto > 0 ? parsedCrypto : null;

    const rampRow: SupabaseRampTransactionRow = {
      id: `ramp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      pollar_order_id: cleanOrderId,
      onchain_tx_hash: cleanTxHash,
      user_id: targetUser.id,
      role: targetRole,
      purpose,
      amount_bs: amount,
      fiat_currency: "BOB",
      asset_code: "USDC",
      crypto_amount: cryptoAmount,
      pollar_user_id: cleanPollarUserId,
      stellar_address: cleanStellarAddress,
      status: "COMPLETED",
      created_at: new Date().toISOString(),
    };

    try {
      const insertOutcome = await supabaseTables.insertRampTransaction(rampRow);
      if (!insertOutcome.ok || insertOutcome.duplicate) {
        return {
          ok: false,
          duplicate: true,
          error: "Esta orden de Pollar ya fue acreditada anteriormente.",
        };
      }
    } catch (err) {
      processedRampKeys.delete(orderKey);
      if (hashKey) processedRampKeys.delete(hashKey);
      throw err;
    }

    const currentFiat = Number(targetUser.fiat_balance_bs ?? 0);
    const currentMotes = Number(targetUser.motes_balance ?? 0);
    const currentFreeDeliveries = Number(
      targetUser.free_deliveries_remaining ?? 0
    );

    const patch: Partial<SupabaseUserRow> = {
      fiat_wallet_enabled: true,
      ...(cleanPollarUserId && !targetUser.pollar_user_id
        ? { pollar_user_id: cleanPollarUserId }
        : {}),
      ...(cleanStellarAddress && !targetUser.stellar_address
        ? { stellar_address: cleanStellarAddress }
        : {}),
    };

    if (purpose === "prosumer_subscription") {
      if (targetUser.is_prosumer && targetUser.motes_enabled) {
        patch.fiat_balance_bs = Math.round((currentFiat + amount) * 100) / 100;
      } else {
        const baseMotes = Boolean(
          targetUser.motes_enabled || targetUser.is_prosumer
        )
          ? currentMotes
          : 0;
        const remainderBs = Math.max(0, amount - SUBSCRIPTION_COST);
        patch.is_prosumer = true;
        patch.is_premium = true;
        patch.motes_enabled = true;
        patch.qr_enabled = true;
        patch.fiat_balance_bs =
          Math.round((currentFiat + remainderBs) * 100) / 100;
        patch.motes_balance = baseMotes + PROSUMER_WELCOME_MOTES;
        patch.free_deliveries_remaining =
          currentFreeDeliveries + PREMIUM_FREE_DELIVERIES;
      }
    } else if (purpose === "merchant_premium") {
      if (targetUser.is_prosumer || targetUser.is_premium) {
        patch.fiat_balance_bs = Math.round((currentFiat + amount) * 100) / 100;
      } else {
        const remainderBs = Math.max(0, amount - SUBSCRIPTION_COST);
        patch.is_prosumer = true;
        patch.is_premium = true;
        patch.qr_enabled = true;
        patch.fiat_balance_bs =
          Math.round((currentFiat + remainderBs) * 100) / 100;
        patch.free_deliveries_remaining =
          currentFreeDeliveries + PREMIUM_FREE_DELIVERIES;
      }
    } else {
      patch.fiat_balance_bs = Math.round((currentFiat + amount) * 100) / 100;
    }

    const updated = await supabaseTables.updateUser(targetUser.id, patch);
    const mapped = mapUserRow(
      updated || { ...targetUser, ...patch },
      orders,
      deliveries,
      users,
      true
    );

    return targetRole === "merchant"
      ? {
          ok: true,
          creditedBs: amount,
          pollarOrderId: cleanOrderId,
          merchant: mapped,
        }
      : {
          ok: true,
          creditedBs: amount,
          pollarOrderId: cleanOrderId,
          buyer: mapped,
        };
  }

  // Suscripción Prosumidor (100 Bs/mes):
  // - Requiere saldo real disponible >= 100 Bs (se descuenta)
  // - Activa is_prosumer, is_premium, motes_enabled y acredita +50 MOTES + 5 envíos incluidos
  public async upgradeBuyerProsumer(session: EcoBancoSession): Promise<{
    ok: boolean;
    error?: string;
    buyer: User;
  }> {
    if (!session.buyerId) {
      return {
        ok: false,
        error: "Debes iniciar sesión primero.",
        buyer: createEmptyBuyer(),
      };
    }

    const [users, orders, deliveries] = await Promise.all([
      supabaseTables.listUsers(),
      supabaseTables.listOrders(),
      supabaseTables.listDeliveries(),
    ]);
    const activeBuyer = users.find(
      (u) =>
        u.role === "buyer" && !isRiderUserRow(u) && u.id === session.buyerId
    );

    if (!activeBuyer) {
      return {
        ok: false,
        error: "Debes iniciar sesión primero.",
        buyer: createEmptyBuyer(),
      };
    }

    if (activeBuyer.is_prosumer && activeBuyer.motes_enabled) {
      return {
        ok: true,
        buyer: mapUserRow(activeBuyer, orders, deliveries, users, true),
      };
    }

    const currentFiat = Number(activeBuyer.fiat_balance_bs ?? 0);
    if (currentFiat < SUBSCRIPTION_COST) {
      return {
        ok: false,
        error: `Saldo insuficiente (${SUBSCRIPTION_COST} Bs). Realiza tu recarga con QR a través de Pollar para activar el Club Vecino (Prosumidor).`,
        buyer: mapUserRow(activeBuyer, orders, deliveries, users, true),
      };
    }

    const nextFiat = Math.round((currentFiat - SUBSCRIPTION_COST) * 100) / 100;
    const baseMotes = Boolean(
      activeBuyer.motes_enabled || activeBuyer.is_prosumer
    )
      ? Number(activeBuyer.motes_balance ?? 0)
      : 0;

    const updated = await supabaseTables.updateUser(activeBuyer.id, {
      is_prosumer: true,
      is_premium: true,
      motes_enabled: true,
      fiat_wallet_enabled: true,
      qr_enabled: true,
      fiat_balance_bs: nextFiat,
      motes_balance: baseMotes + PROSUMER_WELCOME_MOTES,
      free_deliveries_remaining:
        Number(activeBuyer.free_deliveries_remaining ?? 0) +
        PREMIUM_FREE_DELIVERIES,
    });

    return {
      ok: true,
      buyer: mapUserRow(updated || activeBuyer, orders, deliveries, users, true),
    };
  }

  public async addProduct(
    session: EcoBancoSession,
    input: {
      name: string;
      priceMotes: number;
      description: string;
      imageUrl: string;
      sellerName?: string;
    }
  ): Promise<{ ok: boolean; error?: string; product?: Product }> {
    if (!session.merchantId) {
      return {
        ok: false,
        error: "Debes iniciar sesión como caserita para publicar productos.",
      };
    }

    const users = await supabaseTables.listUsers();
    const activeMer = users.find(
      (u) => u.role === "merchant" && u.id === session.merchantId
    );
    if (!activeMer) {
      return {
        ok: false,
        error: "Sesión de caserita no válida.",
      };
    }

    const resolvedImage = input.imageUrl.startsWith("data:")
      ? (
          await uploadImageToStorage(
            SUPABASE_BUCKETS.PRODUCT_IMAGES,
            input.imageUrl,
            activeMer.id
          )
        ).publicUrl
      : input.imageUrl;

    const merchantOpen = extractStoreOpenAndDescription(activeMer).isOpen;

    const newRow: SupabaseProductRow = {
      id: `prod-${Date.now()}`,
      seller_id: activeMer.id,
      seller_name: input.sellerName?.trim() || activeMer.store_name || "",
      seller_phone: activeMer.phone || null,
      seller_avatar_url: activeMer.avatar_url || "",
      seller_address: activeMer.address || "",
      seller_schedule: activeMer.schedule || "",
      name: input.name.trim(),
      category: null,
      price_motes: Number(input.priceMotes),
      image_url: resolvedImage,
      description: input.description.trim(),
      active: merchantOpen,
      created_at: new Date().toISOString(),
    };

    const inserted = await supabaseTables.insertProduct(newRow);
    return { ok: true, product: mapProductRow(inserted, users) };
  }

  public async updateProduct(
    session: EcoBancoSession,
    id: string,
    patch: Partial<Product>
  ): Promise<{ ok: boolean; error?: string; product?: Product | null }> {
    if (!session.merchantId) {
      return {
        ok: false,
        error: "Debes iniciar sesión como caserita para editar productos.",
      };
    }

    const [products, users] = await Promise.all([
      supabaseTables.listProducts(),
      supabaseTables.listUsers(),
    ]);
    const existing = products.find((p) => p.id === id);
    if (!existing) {
      return { ok: false, error: "Producto no encontrado." };
    }
    if (existing.seller_id && existing.seller_id !== session.merchantId) {
      return {
        ok: false,
        error: "Solo puedes editar productos de tu propio puesto.",
      };
    }

    const dbPatch: Partial<SupabaseProductRow> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name.trim();
    if (patch.priceMotes !== undefined)
      dbPatch.price_motes = Number(patch.priceMotes);
    if (patch.description !== undefined)
      dbPatch.description = patch.description.trim();
    if (patch.imageUrl !== undefined) {
      dbPatch.image_url = patch.imageUrl.startsWith("data:")
        ? (
            await uploadImageToStorage(
              SUPABASE_BUCKETS.PRODUCT_IMAGES,
              patch.imageUrl,
              id
            )
          ).publicUrl
        : patch.imageUrl;
    }

    const updated = await supabaseTables.updateProduct(id, dbPatch);
    return {
      ok: true,
      product: updated ? mapProductRow(updated, users) : null,
    };
  }

  public async removeProduct(
    session: EcoBancoSession,
    id: string
  ): Promise<{ ok: boolean; error?: string }> {
    if (!session.merchantId) {
      return {
        ok: false,
        error: "Debes iniciar sesión como caserita para eliminar productos.",
      };
    }

    const products = await supabaseTables.listProducts();
    const existing = products.find((p) => p.id === id);
    if (!existing) {
      return { ok: false, error: "Producto no encontrado." };
    }
    if (existing.seller_id && existing.seller_id !== session.merchantId) {
      return {
        ok: false,
        error: "Solo puedes eliminar productos de tu propio puesto.",
      };
    }

    await supabaseTables.deleteProduct(id);
    return { ok: true };
  }

  // ============================================================================
  // Blindaje financiero del Escrow:
  // - Rechaza cualquier compra si no hay saldo suficiente (PROHIBIDO comprar con saldo 0)
  // - Verifica fiat_balance_bs o motes_balance según método elegido
  // ============================================================================
  public async executeEscrow(
    session: EcoBancoSession,
    productId: string,
    buyerType: "buyer" | "merchant",
    paymentMethod?: "fiat" | "motes",
    preSignedDeployXdr?: string | null,
    orderOptions?: {
      quantity?: number;
      specialNotes?: string;
    }
  ): Promise<{
    ok: boolean;
    error?: string;
    receipt?: EscrowTransaction;
    order?: Order;
    delivery?: Delivery;
  }> {
    const [products, users] = await Promise.all([
      supabaseTables.listProducts(),
      supabaseTables.listUsers(),
    ]);

    const product = products.find((p) => p.id === productId);
    if (!product) {
      return {
        ok: false,
        error: "El producto seleccionado no existe.",
      };
    }

    const sellerAccount = users.find(
      (u) =>
        u.role === "merchant" &&
        (u.id === product.seller_id ||
          u.store_name?.toLowerCase() === product.seller_name.toLowerCase())
    );

    if (
      !product.active ||
      (sellerAccount && !extractStoreOpenAndDescription(sellerAccount).isOpen)
    ) {
      return {
        ok: false,
        error:
          "Este puesto se encuentra cerrado en este momento. Intenta cuando la caserita vuelva a abrir.",
      };
    }

    const activeBuyer =
      buyerType === "merchant"
        ? session.merchantId
          ? users.find(
              (u) => u.role === "merchant" && u.id === session.merchantId
            )
          : undefined
        : session.buyerId
        ? users.find(
            (u) =>
              u.role === "buyer" &&
              !isRiderUserRow(u) &&
              u.id === session.buyerId
          )
        : undefined;

    if (!activeBuyer) {
      return {
        ok: false,
        error: "Completa tus datos de entrega antes de confirmar tu pedido.",
      };
    }

    const buyerDeliveryAddress = (
      activeBuyer.delivery_address ||
      activeBuyer.address ||
      ""
    ).trim();

    if (
      buyerType === "buyer" &&
      (!activeBuyer.phone?.trim() || !buyerDeliveryAddress)
    ) {
      return {
        ok: false,
        error:
          "Debes completar tu número de WhatsApp y dirección de entrega antes de confirmar tu pedido.",
      };
    }

    const unitPrice = Number(product.price_motes);
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
      return { ok: false, error: "Precio del producto inválido." };
    }

    const rawQty = Number(orderOptions?.quantity ?? 1);
    const quantity = Number.isFinite(rawQty)
      ? Math.min(20, Math.max(1, Math.round(rawQty)))
      : 1;
    const specialNotes = (orderOptions?.specialNotes || "")
      .trim()
      .slice(0, 240);
    const priceMotes = Math.round(unitPrice * quantity * 100) / 100;
    const formattedProductName = encodeOrderProductName(
      product.name,
      quantity,
      specialNotes
    );

    const buyerMotes = Number(activeBuyer.motes_balance ?? 0);
    const buyerFiatBs = Number(activeBuyer.fiat_balance_bs ?? 0);
    const buyerMotesEnabled =
      buyerType === "merchant" ||
      Boolean(activeBuyer.motes_enabled || activeBuyer.is_prosumer);

    let nextBuyerMotes = buyerMotes;
    let nextBuyerFiat = buyerFiatBs;

    if (buyerType === "merchant") {
      if (buyerMotes < priceMotes) {
        return {
          ok: false,
          error: `Saldo insuficiente de MOTES. Necesitas ${priceMotes} MOTES y tienes ${buyerMotes} MOTES.`,
        };
      }
      nextBuyerMotes = buyerMotes - priceMotes;
    } else if (paymentMethod === "motes") {
      if (!buyerMotesEnabled) {
        return {
          ok: false,
          error:
            "Aún no tienes MOTES activos. Paga con QR el monto exacto de tu pedido o usa tu saldo en Bs.",
        };
      }
      if (buyerMotes < priceMotes) {
        return {
          ok: false,
          error: `Saldo insuficiente de MOTES. Necesitas ${priceMotes} MOTES y tienes ${buyerMotes} MOTES.`,
        };
      }
      nextBuyerMotes = buyerMotes - priceMotes;
    } else if (paymentMethod === "fiat") {
      if (buyerFiatBs < priceMotes) {
        return {
          ok: false,
          error: `Saldo insuficiente en Bolivianos (Bs). Necesitas ${priceMotes} Bs y tienes ${buyerFiatBs} Bs. Genera el QR para pagar el monto exacto de tu pedido.`,
        };
      }
      nextBuyerFiat = buyerFiatBs - priceMotes;
    } else {
      // Selección automática segura: jamás permite saldo insuficiente o saldo 0
      if (buyerMotesEnabled && buyerMotes >= priceMotes) {
        nextBuyerMotes = buyerMotes - priceMotes;
      } else if (buyerFiatBs >= priceMotes) {
        nextBuyerFiat = buyerFiatBs - priceMotes;
      } else {
        return {
          ok: false,
          error: `Para confirmar este pedido de ${priceMotes} Bs, genera el QR de pago exacto o completa tu saldo en Mi Libreta.`,
        };
      }
    }

    const sellerFreeDeliveries = Number(
      sellerAccount?.free_deliveries_remaining ?? 0
    );
    const buyerFreeDeliveries = Number(
      activeBuyer.free_deliveries_remaining ?? 0
    );
    const sellerSponsorsDelivery = Boolean(
      sellerAccount && sellerFreeDeliveries > 0
    );
    const buyerSponsorsDelivery = Boolean(
      !sellerSponsorsDelivery &&
        (activeBuyer.is_prosumer ||
          activeBuyer.is_premium ||
          buyerFreeDeliveries > 0) &&
        buyerFreeDeliveries > 0
    );
    const usedFreeDelivery = sellerSponsorsDelivery || buyerSponsorsDelivery;

    const nowIso = new Date().toISOString();
    const ts = Date.now();
    const orderId = `ord-${ts}`;
    const engagementId = `eng-${ts}`;

    let onchainEscrow: Awaited<ReturnType<typeof deployAndFundMultiReleaseOrder>>;
    try {
      onchainEscrow = await deployAndFundMultiReleaseOrder({
        engagementId,
        title: formattedProductName.slice(0, 100),
        description: `Pago Protegido EcoBanco: ${formattedProductName} (${
          sellerAccount?.store_name || product.seller_name
        })`,
        sellerStellarAddress: sellerAccount?.stellar_address || null,
        riderStellarAddress: null,
        buyerStellarAddress: activeBuyer.stellar_address || null,
        productNetAmountMotes: priceMotes,
        deliveryFeeNetAmountMotes: RIDER_DELIVERY_FEE_MOTES,
        subsidizedDelivery: usedFreeDelivery,
        preSignedDeployXdr,
      });
    } catch (err) {
      const errMsg =
        err instanceof Error
          ? err.message
          : "No se pudo desplegar o fondear el contrato Multi-Release en Stellar Testnet.";
      return {
        ok: false,
        error: errMsg,
      };
    }

    if (sellerAccount && sellerAccount.id === activeBuyer.id) {
      await supabaseTables.updateUser(activeBuyer.id, {
        motes_balance: nextBuyerMotes,
        ...(usedFreeDelivery
          ? {
              free_deliveries_remaining: Math.max(0, sellerFreeDeliveries - 1),
            }
          : {}),
      });
    } else {
      await supabaseTables.updateUser(activeBuyer.id, {
        motes_balance: nextBuyerMotes,
        fiat_balance_bs: nextBuyerFiat,
        ...(buyerSponsorsDelivery
          ? {
              free_deliveries_remaining: Math.max(0, buyerFreeDeliveries - 1),
            }
          : {}),
      });
      if (sellerAccount && sellerSponsorsDelivery) {
        await supabaseTables.updateUser(sellerAccount.id, {
          free_deliveries_remaining: Math.max(0, sellerFreeDeliveries - 1),
        });
      }
    }

    const orderRow: Order = {
      id: orderId,
      contract_id: onchainEscrow.contractId,
      engagement_id: onchainEscrow.engagementId,
      fund_tx_hash: onchainEscrow.fundTxHash,
      release_tx_hash: null,
      product_id: product.id,
      product_name: formattedProductName,
      quantity,
      special_notes: specialNotes || null,
      seller_id: sellerAccount?.id || product.seller_id || null,
      seller_name: sellerAccount?.store_name || product.seller_name,
      buyer_id: activeBuyer.id,
      buyer_type: buyerType,
      amount_motes: priceMotes,
      status: "LOCKED_IN_ESCROW",
      created_at: nowIso,
    };

    const insertedOrder = await supabaseTables.insertOrder(orderRow);

    const pickupPin = generateFourDigitPin();
    const deliveryPin = generateFourDigitPin(pickupPin);

    const deliveryRow: Delivery = {
      id: `del-${ts}`,
      order_id: insertedOrder.id,
      contract_id: onchainEscrow.contractId,
      engagement_id: onchainEscrow.engagementId,
      fund_tx_hash: onchainEscrow.fundTxHash,
      release_tx_hash: null,
      product_name: formattedProductName,
      quantity,
      special_notes: specialNotes || null,
      amount_motes: priceMotes,
      buyer_id: activeBuyer.id,
      buyer_name: activeBuyer.store_name || activeBuyer.name || "Vecino",
      delivery_address: buyerDeliveryAddress || "Entrega en comunidad · La Paz",
      seller_id: sellerAccount?.id || product.seller_id || null,
      seller_name: sellerAccount?.store_name || product.seller_name,
      seller_phone: sellerAccount?.phone || product.seller_phone || null,
      pickup_address:
        sellerAccount?.address || product.seller_address || "Puesto de Caserita",
      delivery_status: "pending",
      used_free_delivery: usedFreeDelivery,
      subsidized_by_reserve: usedFreeDelivery,
      vehicle_type: "EcoDohmi Eléctrico",
      pickup_pin: pickupPin,
      delivery_pin: deliveryPin,
      delivery_fee_motes: RIDER_DELIVERY_FEE_MOTES,
      delivery_fee_usdc: RIDER_DELIVERY_FEE_USDC,
      rider_id: null,
      rider_name: null,
      rider_phone: null,
      picked_up_at: null,
      delivered_at: null,
      created_at: nowIso,
    };

    const insertedDelivery = await supabaseTables.insertDelivery(deliveryRow);

    return {
      ok: true,
      receipt: mapOrderToTransaction(
        insertedOrder,
        insertedDelivery,
        activeBuyer.store_name || activeBuyer.name
      ),
      order: insertedOrder,
      delivery: {
        ...insertedDelivery,
        product_name: product.name,
        quantity,
        special_notes: specialNotes || null,
      },
    };
  }

  // ============================================================================
  // Verificación de Confianza y Flujo de Repartidores (100% PostgreSQL remoto)
  // ============================================================================
  public async getDeliveriesState(session: EcoBancoSession): Promise<{
    authorized: boolean;
    rider: Rider | null;
    deliveries: Delivery[];
    orders: Order[];
  }> {
    if (!session.riderId && !session.merchantId) {
      return {
        authorized: false,
        rider: null,
        deliveries: [],
        orders: [],
      };
    }

    const [rawDeliveries, orders, users] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
      supabaseTables.listUsers(),
    ]);

    const riderRow = session.riderId
      ? users.find(
          (u) =>
            isRiderUserRow(u) &&
            u.id === session.riderId &&
            u.rider_verified === true
        ) || null
      : null;

    const merchantRow = session.merchantId
      ? users.find(
          (u) => u.role === "merchant" && u.id === session.merchantId
        ) || null
      : null;

    if (!riderRow && !merchantRow) {
      return {
        authorized: false,
        rider: null,
        deliveries: [],
        orders: [],
      };
    }

    const enriched = enrichDeliveriesWithContext(rawDeliveries, orders, users);
    const merchantStoreLower = (merchantRow?.store_name || "").toLowerCase();

    const filteredDeliveries = enriched.filter((d) => {
      const allowedForRider = Boolean(
        riderRow &&
          ((normalizeDeliveryStatus(d.delivery_status) === "pending" &&
            !d.rider_id) ||
            d.rider_id === riderRow.id)
      );
      const allowedForMerchant = Boolean(
        merchantRow &&
          (d.seller_id === merchantRow.id ||
            (merchantStoreLower &&
              (d.seller_name || "").toLowerCase() === merchantStoreLower))
      );
      return allowedForRider || allowedForMerchant;
    });

    const allowedOrderIds = new Set(
      filteredDeliveries.map((d) => d.order_id).filter(Boolean)
    );
    const filteredOrders = orders.filter((o) => allowedOrderIds.has(o.id));

    return {
      authorized: true,
      rider: riderRow ? mapRiderRow(riderRow, true) : null,
      deliveries: filteredDeliveries,
      orders: filteredOrders,
    };
  }

  public async loginRider(
    identifier: string,
    secret: string
  ): Promise<{ ok: boolean; error?: string; rider?: Rider }> {
    const normalize = (str: string) =>
      str
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();

    const cleanId = normalize(identifier || "");
    const cleanPhone =
      normalizeBolivianPhone(identifier) ??
      (identifier || "").replace(/\s+/g, "").trim();
    const cleanCode = (identifier || "").trim().toUpperCase();
    const cleanSecret = (secret || "").trim();

    if (!cleanId) {
      return {
        ok: false,
        error: "Ingresa tu número de WhatsApp o credencial ECO-R-XXXX.",
      };
    }

    if (!cleanSecret) {
      return {
        ok: false,
        error: "Ingresa tu clave secreta de 4 números (PIN) o tu número de CI.",
      };
    }

    const users = await supabaseTables.listUsers();
    const found = users.find(
      (u) =>
        isRiderUserRow(u) &&
        ((cleanPhone && areSameBolivianPhone(u.phone, cleanPhone)) ||
          (cleanCode &&
            (u.rider_invite_code || "").toUpperCase() === cleanCode) ||
          (cleanId && normalize(u.name) === cleanId))
    );

    if (!found) {
      return {
        ok: false,
        error:
          "No encontramos una cuenta de repartidor con ese WhatsApp o credencial.",
      };
    }

    if (!found.rider_verified) {
      return {
        ok: false,
        error: "Tu cuenta de repartidor aún no está verificada.",
      };
    }

    const storedPassword = (found.password || "").trim();
    if (storedPassword) {
      if (cleanSecret !== storedPassword) {
        return { ok: false, error: "Clave PIN o CI incorrecto." };
      }
    } else {
      const normSecret = cleanSecret.replace(/\s+/g, "").toUpperCase();
      const normCi = (found.ci_number || "").replace(/\s+/g, "").toUpperCase();
      if (!normCi || normSecret !== normCi) {
        return { ok: false, error: "Clave PIN o CI incorrecto." };
      }
    }

    return {
      ok: true,
      rider: mapRiderRow(found, true),
    };
  }

  public async registerOrUpdateRider(input: {
    name: string;
    phone: string;
    vehicleType: RiderVehicleType;
    address: string;
    ciNumber: string;
    password?: string;
    selfieUrl: string;
    ciPhotoUrl: string;
    pollarUserId?: string;
    stellarAddress?: string;
  }): Promise<{ ok: boolean; error?: string; rider?: Rider }> {
    const cleanName = (input.name || "").trim();
    const cleanPhone =
      normalizeBolivianPhone(input.phone) ??
      (input.phone || "").replace(/\s+/g, "").trim();
    const vehicleType: RiderVehicleType =
      input.vehicleType === "moto_electrica" ? "moto_electrica" : "bicicleta";
    const cleanAddress = (input.address || "").trim();
    const cleanCi = (input.ciNumber || "").trim();
    const cleanPin = (input.password || "").replace(/\D/g, "").slice(0, 4);
    const cleanSelfie = (input.selfieUrl || "").trim();
    const cleanCiPhoto = (input.ciPhotoUrl || "").trim();
    const cleanPollarUserId = input.pollarUserId?.trim() || null;
    const cleanStellarAddress =
      input.stellarAddress &&
      STELLAR_CLASSIC_ACCOUNT_REGEX.test(input.stellarAddress.trim())
        ? input.stellarAddress.trim()
        : null;

    if (
      !cleanName ||
      !cleanPhone ||
      !cleanAddress ||
      !cleanCi ||
      !cleanSelfie ||
      !cleanCiPhoto
    ) {
      return {
        ok: false,
        error:
          "Debes completar toda la Ficha de Confianza: nombre, WhatsApp, vehículo, dirección de domicilio, número de CI, selfie frontal del rostro descubierto y foto del Carnet de Identidad (CI).",
      };
    }

    if (cleanPin.length !== 4) {
      return {
        ok: false,
        error:
          "Crea tu clave secreta de 4 números (PIN) para proteger tu cuenta de repartidor.",
      };
    }

    const users = await supabaseTables.listUsers();

    const phoneConflict = users.find(
      (u) => areSameBolivianPhone(u.phone, cleanPhone) && !isRiderUserRow(u)
    );
    if (phoneConflict) {
      return {
        ok: false,
        error:
          "Ese número de WhatsApp ya está registrado en una cuenta de caserita o vecino.",
      };
    }

    const existingDbRider = users.find(
      (u) => isRiderUserRow(u) && areSameBolivianPhone(u.phone, cleanPhone)
    );
    if (existingDbRider) {
      return {
        ok: false,
        error:
          "Ya existe un repartidor registrado con ese número de WhatsApp. Ingresa desde la pestaña Ingresar.",
      };
    }

    const riderId = `rid-${Date.now()}`;

    const resolvedSelfieUrl = cleanSelfie.startsWith("data:")
      ? (
          await uploadImageToStorage(
            SUPABASE_BUCKETS.RIDER_VERIFICATIONS,
            cleanSelfie,
            `${riderId}-selfie`
          )
        ).publicUrl
      : cleanSelfie;

    const resolvedCiPhotoUrl = cleanCiPhoto.startsWith("data:")
      ? (
          await uploadImageToStorage(
            SUPABASE_BUCKETS.RIDER_VERIFICATIONS,
            cleanCiPhoto,
            `${riderId}-ci`
          )
        ).publicUrl
      : cleanCiPhoto;

    const riderInviteCode = generateUniqueRiderInviteCode(users);

    const newRiderRow: SupabaseUserRow = {
      id: riderId,
      role: "rider",
      name: cleanName,
      store_name: vehicleType,
      store_description: "Repartidor EcoDohmi",
      address: cleanAddress,
      delivery_address: cleanAddress,
      schedule: "",
      avatar_url: resolvedSelfieUrl,
      profile_completed: true,
      phone: cleanPhone,
      password: cleanPin,
      bank_qr_url: "",
      email: null,
      is_prosumer: false,
      is_premium: false,
      // AMBAS billeteras (MOTES y FIAT/USDC) activas desde el principio
      fiat_wallet_enabled: true,
      motes_enabled: true,
      qr_enabled: false,
      motes_balance: 0,
      fiat_balance_bs: 0,
      free_deliveries_remaining: 0,
      sales_count: 0,
      referral_code: riderInviteCode,
      invited_count: 0,
      motes_earned: 0,
      free_deliveries_earned: 0,
      ci_number: cleanCi,
      selfie_url: resolvedSelfieUrl,
      ci_photo_url: resolvedCiPhotoUrl,
      rider_verified: true,
      rider_invite_code: riderInviteCode,
      pollar_user_id: cleanPollarUserId,
      stellar_address: cleanStellarAddress,
      created_at: new Date().toISOString(),
    };

    const created = await supabaseTables.insertUser(newRiderRow);
    return {
      ok: true,
      rider: mapRiderRow(created, true),
    };
  }

  public async acceptDelivery(
    session: EcoBancoSession,
    deliveryId: string
  ): Promise<{
    ok: boolean;
    error?: string;
    delivery?: Delivery;
    rider?: Rider | null;
  }> {
    const [deliveries, orders, users] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
      supabaseTables.listUsers(),
    ]);

    const riderRow = session.riderId
      ? users.find((u) => isRiderUserRow(u) && u.id === session.riderId) || null
      : null;

    if (!riderRow || riderRow.rider_verified !== true) {
      return {
        ok: false,
        error:
          "Debes completar y aprobar tu Ficha de Confianza (rider_verified) antes de aceptar pedidos.",
      };
    }

    const rider = mapRiderRow(riderRow, true);
    const target = deliveries.find((d) => d.id === deliveryId);
    if (!target) {
      return { ok: false, error: "Pedido de envío no encontrado." };
    }

    const currentStatus = normalizeDeliveryStatus(target.delivery_status);
    if (currentStatus !== "pending") {
      return {
        ok: false,
        error: "Este pedido ya no está disponible para tomar.",
      };
    }

    const vehicleLabel =
      rider.vehicleType === "moto_electrica"
        ? "Moto Eléctrica EcoDohmi"
        : "Bicicleta EcoDohmi";

    const updated = await supabaseTables.updateDelivery(target.id, {
      rider_id: rider.id,
      rider_name: rider.name,
      rider_phone: rider.phone,
      vehicle_type: vehicleLabel,
    });

    const enriched = updated
      ? enrichDeliveriesWithContext([updated], orders, users)[0]
      : undefined;

    return { ok: true, delivery: enriched, rider };
  }

  public async validatePickupPin(
    session: EcoBancoSession,
    deliveryId: string,
    pin: string
  ): Promise<{
    ok: boolean;
    error?: string;
    delivery?: Delivery;
    rider?: Rider | null;
  }> {
    const [deliveries, orders, users] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
      supabaseTables.listUsers(),
    ]);

    const riderRow = session.riderId
      ? users.find((u) => isRiderUserRow(u) && u.id === session.riderId) || null
      : null;

    if (!riderRow || riderRow.rider_verified !== true) {
      return {
        ok: false,
        error:
          "Debes completar tu Ficha de Confianza (rider_verified) para validar pedidos.",
      };
    }

    const rider = mapRiderRow(riderRow, true);
    const target = deliveries.find((d) => d.id === deliveryId);
    if (!target) {
      return { ok: false, error: "Pedido de entrega no encontrado." };
    }

    const currentStatus = normalizeDeliveryStatus(target.delivery_status);
    if (currentStatus === "delivered") {
      return { ok: false, error: "Este envío ya fue entregado." };
    }
    if (currentStatus === "in_transit") {
      return { ok: false, error: "Este pedido ya está en tránsito." };
    }

    const cleanPin = pin.trim();
    if (!cleanPin || cleanPin !== target.pickup_pin) {
      return {
        ok: false,
        error:
          "PIN de recojo (pickup_pin) incorrecto. Pídele el código de 4 dígitos a la caserita.",
      };
    }

    const vehicleLabel =
      rider.vehicleType === "moto_electrica"
        ? "Moto Eléctrica EcoDohmi"
        : "Bicicleta EcoDohmi";

    const updated = await supabaseTables.updateDelivery(target.id, {
      delivery_status: "in_transit",
      rider_id: rider.id,
      rider_name: rider.name,
      rider_phone: rider.phone,
      vehicle_type: vehicleLabel,
      picked_up_at: new Date().toISOString(),
    });

    const enriched = updated
      ? enrichDeliveriesWithContext([updated], orders, users)[0]
      : undefined;

    return { ok: true, delivery: enriched, rider };
  }

  public async releaseEscrow(
    session: EcoBancoSession,
    input: {
      deliveryId?: string;
      orderId?: string;
      deliveryPin: string;
    }
  ): Promise<{
    ok: boolean;
    error?: string;
    delivery?: Delivery;
    order?: Order;
    rider?: Rider | null;
  }> {
    const [deliveries, orders, users] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
      supabaseTables.listUsers(),
    ]);

    const riderRow = session.riderId
      ? users.find((u) => isRiderUserRow(u) && u.id === session.riderId) || null
      : null;

    if (!riderRow || riderRow.rider_verified !== true) {
      return {
        ok: false,
        error:
          "Debes estar verificado (rider_verified) para completar la entrega y liberar el Escrow.",
      };
    }

    const target = deliveries.find(
      (d) =>
        (input.deliveryId && d.id === input.deliveryId) ||
        (input.orderId && d.order_id === input.orderId)
    );

    if (!target) {
      return { ok: false, error: "Envío no encontrado." };
    }

    const currentStatus = normalizeDeliveryStatus(target.delivery_status);
    if (currentStatus === "delivered") {
      return {
        ok: false,
        error: "Este pedido ya fue entregado y el Escrow ya fue liberado.",
      };
    }
    if (currentStatus !== "in_transit") {
      return {
        ok: false,
        error:
          "Primero debes validar el PIN de recojo (pickup_pin) con la caserita para pasar a tránsito.",
      };
    }

    const cleanPin = (input.deliveryPin || "").trim();
    if (!cleanPin || cleanPin !== target.delivery_pin) {
      return {
        ok: false,
        error:
          "PIN de entrega (delivery_pin) incorrecto. Pídele el código de 4 dígitos al vecino comprador.",
      };
    }

    const order = orders.find((o) => o.id === target.order_id);
    const resolvedContractId = (
      order?.contract_id ||
      target.contract_id ||
      ""
    ).trim();

    let releaseTxHash: string | null =
      order?.release_tx_hash || target.release_tx_hash || null;

    if (isValidSorobanContractId(resolvedContractId)) {
      try {
        const releasedOnChain = await approveAndReleaseMultiReleaseOrder({
          contractId: resolvedContractId,
          deliveryPin: cleanPin,
          orderId: order?.id || target.order_id,
          deliveryId: target.id,
        });
        releaseTxHash = releasedOnChain.releaseTxHash;
      } catch (err) {
        const errMsg =
          err instanceof Error
            ? err.message
            : "No se pudieron aprobar y liberar los hitos del contrato Multi-Release en Stellar Testnet.";
        return {
          ok: false,
          error: errMsg,
        };
      }
    }

    let updatedOrder: Order | undefined = order;

    if (order && order.status !== "RELEASED") {
      const patchedOrder = await supabaseTables.updateOrder(order.id, {
        status: "RELEASED",
        release_tx_hash: releaseTxHash,
      });
      updatedOrder = patchedOrder || {
        ...order,
        status: "RELEASED",
        release_tx_hash: releaseTxHash,
      };

      const sellerAccount = users.find(
        (u) =>
          u.role === "merchant" &&
          (u.id === (order.seller_id || target.seller_id) ||
            u.store_name?.toLowerCase() === order.seller_name.toLowerCase())
      );

      if (sellerAccount) {
        await supabaseTables.updateUser(sellerAccount.id, {
          motes_balance:
            Number(sellerAccount.motes_balance ?? 0) +
            Number(order.amount_motes),
          sales_count: Number(sellerAccount.sales_count ?? 0) + 1,
        });
      }
    }

    const updatedDelivery = await supabaseTables.updateDelivery(target.id, {
      delivery_status: "delivered",
      delivered_at: new Date().toISOString(),
      rider_id: riderRow.id,
      rider_name: riderRow.name,
      rider_phone: riderRow.phone,
      release_tx_hash: releaseTxHash,
    });

    const feeMotes = Number(
      target.delivery_fee_motes ?? RIDER_DELIVERY_FEE_MOTES
    );
    const updatedRiderRow = await supabaseTables.updateUser(riderRow.id, {
      motes_balance: Number(riderRow.motes_balance ?? 0) + feeMotes,
      motes_earned: Number(riderRow.motes_earned ?? 0) + feeMotes,
      sales_count: Number(riderRow.sales_count ?? 0) + 1,
      motes_enabled: true,
      fiat_wallet_enabled: true,
    });

    const updatedRider = mapRiderRow(updatedRiderRow || riderRow, true);
    const nextOrders = updatedOrder
      ? orders.map((o) => (o.id === updatedOrder?.id ? updatedOrder : o))
      : orders;
    const enrichedDelivery = updatedDelivery
      ? enrichDeliveriesWithContext([updatedDelivery], nextOrders, users)[0]
      : undefined;

    return {
      ok: true,
      delivery: enrichedDelivery,
      order: updatedOrder,
      rider: updatedRider,
    };
  }

  public async validateDeliveryPin(
    session: EcoBancoSession,
    deliveryId: string,
    pin: string
  ): Promise<{
    ok: boolean;
    error?: string;
    delivery?: Delivery;
    order?: Order;
    rider?: Rider | null;
  }> {
    return this.releaseEscrow(session, { deliveryId, deliveryPin: pin });
  }

  public async lookupUserByPollarSession(input: {
    role: "buyer" | "merchant" | "rider";
    pollarUserId?: string;
    stellarAddress?: string;
    email?: string;
  }): Promise<{ ok: boolean; userRow?: SupabaseUserRow }> {
    const cleanPollarUserId = input.pollarUserId?.trim() || "";
    const cleanStellarAddress =
      input.stellarAddress &&
      STELLAR_CLASSIC_ACCOUNT_REGEX.test(input.stellarAddress.trim())
        ? input.stellarAddress.trim()
        : "";
    const cleanEmail = input.email?.trim().toLowerCase() || "";

    if (!cleanPollarUserId && !cleanStellarAddress && !cleanEmail) {
      return { ok: false };
    }

    const users = await supabaseTables.listUsers();
    const roleMatches = (u: SupabaseUserRow) => {
      if (input.role === "merchant") return u.role === "merchant";
      if (input.role === "rider") return isRiderUserRow(u);
      return u.role === "buyer" && !isRiderUserRow(u);
    };

    const roleUsers = users.filter(roleMatches);
    const matched =
      (cleanPollarUserId
        ? roleUsers.find((u) => u.pollar_user_id === cleanPollarUserId)
        : undefined) ||
      (cleanStellarAddress
        ? roleUsers.find((u) => u.stellar_address === cleanStellarAddress)
        : undefined) ||
      (cleanEmail
        ? roleUsers.find((u) => (u.email || "").toLowerCase() === cleanEmail)
        : undefined);

    if (!matched) {
      return { ok: false };
    }

    const patch: Partial<SupabaseUserRow> = {};
    if (cleanPollarUserId && !matched.pollar_user_id) {
      patch.pollar_user_id = cleanPollarUserId;
    }
    if (cleanStellarAddress && !matched.stellar_address) {
      patch.stellar_address = cleanStellarAddress;
    }
    if (Object.keys(patch).length > 0) {
      const updated = await supabaseTables.updateUser(matched.id, patch);
      return { ok: true, userRow: updated || { ...matched, ...patch } };
    }

    return { ok: true, userRow: matched };
  }

  public async syncPollarWallet(
    session: EcoBancoSession,
    input: {
      userId?: string;
      role?: "buyer" | "merchant" | "rider";
      pollarUserId?: string | null;
      stellarAddress?: string | null;
    }
  ): Promise<{
    ok: boolean;
    error?: string;
    buyer?: User;
    merchant?: User | null;
    rider?: Rider | null;
  }> {
    const cleanPollarUserId = input.pollarUserId?.trim() || null;
    const cleanStellarAddress = input.stellarAddress?.trim() || null;

    if (!cleanPollarUserId && !cleanStellarAddress) {
      return {
        ok: false,
        error:
          "Se requiere pollar_user_id o stellar_address para sincronizar.",
      };
    }

    if (
      cleanStellarAddress &&
      !STELLAR_CLASSIC_ACCOUNT_REGEX.test(cleanStellarAddress)
    ) {
      return {
        ok: false,
        error:
          "La dirección Stellar debe ser una cuenta clásica válida (G...).",
      };
    }

    let targetId = "";
    if (input.role === "merchant") {
      targetId = session.merchantId || "";
    } else if (input.role === "rider") {
      targetId = session.riderId || "";
    } else if (input.role === "buyer") {
      targetId = session.buyerId || "";
    } else {
      targetId =
        session.buyerId || session.merchantId || session.riderId || "";
    }

    if (
      input.userId &&
      (input.userId === session.buyerId ||
        input.userId === session.merchantId ||
        input.userId === session.riderId)
    ) {
      targetId = input.userId;
    }

    if (!targetId) {
      return {
        ok: false,
        error:
          "No se encontró una sesión activa para vincular la billetera Stellar.",
      };
    }

    const patch: Partial<SupabaseUserRow> = {};
    if (cleanPollarUserId) patch.pollar_user_id = cleanPollarUserId;
    if (cleanStellarAddress) patch.stellar_address = cleanStellarAddress;

    await supabaseTables.updateUser(targetId, patch);

    const state = await this.getSessionUsers(session);
    return {
      ok: true,
      buyer: state.buyer,
      merchant: state.merchant,
      rider: state.rider,
    };
  }
}

const globalStore = globalThis as unknown as {
  ecoBancoSupabaseRepo?: SupabaseEcoBancoRepository;
};

export const db =
  globalStore.ecoBancoSupabaseRepo ?? new SupabaseEcoBancoRepository();

if (process.env.NODE_ENV !== "production") {
  globalStore.ecoBancoSupabaseRepo = db;
}
