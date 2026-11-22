import { Delivery, Order, StorageBucket } from "../types/ecobanco";

export const SUPABASE_BUCKETS = {
  AVATARS: "avatars",
  PRODUCT_IMAGES: "product-images",
  QR_BANCARIOS: "qr-bancarios",
  RIDER_VERIFICATIONS: "rider-verifications",
} as const satisfies Record<string, StorageBucket>;

export const VALID_BUCKETS: ReadonlyArray<StorageBucket> = [
  SUPABASE_BUCKETS.AVATARS,
  SUPABASE_BUCKETS.PRODUCT_IMAGES,
  SUPABASE_BUCKETS.QR_BANCARIOS,
  SUPABASE_BUCKETS.RIDER_VERIFICATIONS,
];

export interface SupabaseUserRow {
  id: string;
  role: "buyer" | "merchant" | "rider";
  name: string;
  store_name: string | null;
  store_description: string;
  address: string;
  schedule: string;
  avatar_url: string;
  profile_completed: boolean;
  phone: string | null;
  password: string | null;
  bank_qr_url: string;
  email: string | null;
  is_open?: boolean;
  is_prosumer: boolean;
  is_premium?: boolean;
  fiat_wallet_enabled: boolean;
  qr_enabled: boolean;
  motes_enabled?: boolean;
  motes_balance: number;
  fiat_balance_bs: number;
  free_deliveries_remaining: number;
  sales_count: number;
  referral_code: string | null;
  invited_count: number;
  motes_earned: number;
  free_deliveries_earned: number;
  delivery_address?: string;
  ci_number?: string;
  selfie_url?: string;
  ci_photo_url?: string;
  rider_verified?: boolean;
  rider_invite_code?: string | null;
  pollar_user_id?: string | null;
  stellar_address?: string | null;
  created_at: string;
}

export function isRiderUserRow(row: SupabaseUserRow): boolean {
  return (
    row.role === "rider" ||
    row.id.startsWith("rid-") ||
    Boolean(row.rider_invite_code)
  );
}

export interface SupabaseProductRow {
  id: string;
  seller_id: string | null;
  seller_name: string;
  seller_phone: string | null;
  seller_avatar_url: string;
  seller_address: string;
  seller_schedule: string;
  name: string;
  category: string | null;
  price_motes: number;
  image_url: string;
  description: string;
  active: boolean;
  created_at: string;
}

export interface SupabaseDeliveryRow {
  id: string;
  order_id: string;
  contract_id?: string | null;
  engagement_id?: string | null;
  fund_tx_hash?: string | null;
  buyer_id: string | null;
  seller_id: string | null;
  pickup_address: string;
  delivery_status: string;
  used_free_delivery: boolean;
  subsidized_by_reserve?: boolean;
  vehicle_type: string;
  pickup_pin?: string | null;
  delivery_pin?: string | null;
  delivery_fee_motes?: number;
  delivery_fee_usdc?: number;
  rider_id?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  release_tx_hash?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
  quantity?: number;
  special_notes?: string | null;
  created_at: string;
}

export interface SupabaseRampTransactionRow {
  id: string;
  pollar_order_id: string;
  onchain_tx_hash: string | null;
  user_id: string;
  role: "buyer" | "merchant" | "rider";
  purpose: "fiat_topup" | "prosumer_subscription" | "merchant_premium";
  amount_bs: number;
  fiat_currency: string;
  asset_code: string;
  crypto_amount: number | null;
  pollar_user_id: string | null;
  stellar_address: string | null;
  status: string;
  created_at: string;
}

// Precarga únicamente la cuenta real de Eliana Rivero Espinoza
export const ELIANA_SEED_ROW: SupabaseUserRow = {
  id: "mer-eliana-01",
  role: "merchant",
  name: "Eliana Rivero Espinoza",
  store_name: "Doña Eliana",
  store_description: "",
  address: "",
  schedule: "",
  avatar_url: "",
  profile_completed: false,
  phone: "+59173540555",
  password: "73540555",
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
  referral_code: "ECO-DONAEL55",
  invited_count: 0,
  motes_earned: 0,
  free_deliveries_earned: 0,
  delivery_address: "",
  ci_number: "",
  selfie_url: "",
  ci_photo_url: "",
  rider_verified: false,
  rider_invite_code: null,
  pollar_user_id: null,
  stellar_address: null,
  created_at: "2026-01-01T00:00:00.000Z",
};

function getSupabaseCredentials(): { url: string; key: string } {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "")
    .trim()
    .replace(/\/+$/, "");
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (
    !url ||
    !key ||
    url.includes("tu-proyecto.supabase.co") ||
    key === "tu-anon-key" ||
    key === "tu-service-role-key"
  ) {
    throw new Error(
      "Supabase no está configurado. Define NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return { url, key };
}

export function isSupabaseConfigured(): boolean {
  try {
    getSupabaseCredentials();
    return true;
  } catch {
    return false;
  }
}

// ============================================================================
// Cliente PostgREST de Supabase (100% remoto, sin escritura en disco local)
// ============================================================================

type SupabaseTable =
  | "users"
  | "products"
  | "orders"
  | "deliveries"
  | "ramp_transactions";

async function restRequest<T>(
  table: SupabaseTable,
  options: {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    query?: string;
    body?: unknown;
    prefer?: string;
  } = {}
): Promise<T> {
  const creds = getSupabaseCredentials();
  const queryPart = options.query ? `?${options.query}` : "";
  const headers: Record<string, string> = {
    apikey: creds.key,
    Authorization: `Bearer ${creds.key}`,
    "Content-Type": "application/json",
  };

  if (options.prefer) {
    headers["Prefer"] = options.prefer;
  }

  const res = await fetch(`${creds.url}/rest/v1/${table}${queryPart}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Supabase ${table} error (${res.status}): ${errText}`);
  }

  if (res.status === 204) {
    return [] as unknown as T;
  }

  return (await res.json()) as T;
}

// Helper resiliente para columnas recién agregadas al schema SQL antes de ejecutar ALTER TABLE
async function restWriteWithSchemaFallback<T>(
  table: SupabaseTable,
  method: "POST" | "PATCH",
  payload: Record<string, unknown>,
  query?: string,
  prefer = "return=representation"
): Promise<T> {
  const mutable: Record<string, unknown> = { ...payload };
  for (let attempt = 0; attempt < 15; attempt++) {
    try {
      return await restRequest<T>(table, {
        method,
        query,
        body: mutable,
        prefer,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      const missingColMatch =
        msg.match(/Could not find the '([^']+)' column/) ||
        msg.match(/column "([^"]+)" of relation/);
      if (missingColMatch && missingColMatch[1] in mutable) {
        delete mutable[missingColMatch[1]];
        if (Object.keys(mutable).length === 0 && method === "PATCH") {
          return [] as unknown as T;
        }
        continue;
      }
      throw err;
    }
  }
  return restRequest<T>(table, {
    method,
    query,
    body: mutable,
    prefer,
  });
}

function deriveDeterministicPin(seed: string, salt: number): string {
  let hash = 2166136261 ^ salt;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const num = (Math.abs(hash) % 9000) + 1000;
  return String(num);
}

function normalizeDeliveryRow(raw: SupabaseDeliveryRow): Delivery {
  const pickupPin =
    raw.pickup_pin || deriveDeterministicPin(raw.id || "del", 17);
  let deliveryPin =
    raw.delivery_pin || deriveDeterministicPin(raw.id || "del", 83);
  if (deliveryPin === pickupPin) {
    const shifted = ((Number(deliveryPin) - 1000 + 1) % 9000) + 1000;
    deliveryPin = String(shifted);
  }

  return {
    id: raw.id,
    order_id: raw.order_id,
    contract_id: raw.contract_id ?? null,
    engagement_id: raw.engagement_id ?? null,
    fund_tx_hash: raw.fund_tx_hash ?? null,
    buyer_id: raw.buyer_id ?? null,
    seller_id: raw.seller_id ?? null,
    pickup_address: raw.pickup_address ?? "",
    delivery_status: raw.delivery_status || "pending",
    used_free_delivery: Boolean(raw.used_free_delivery),
    subsidized_by_reserve:
      raw.subsidized_by_reserve !== undefined
        ? Boolean(raw.subsidized_by_reserve)
        : Boolean(raw.used_free_delivery),
    vehicle_type: raw.vehicle_type || "EcoDohmi Eléctrico",
    pickup_pin: pickupPin,
    delivery_pin: deliveryPin,
    delivery_fee_motes: Number(raw.delivery_fee_motes ?? 5),
    delivery_fee_usdc: Number(raw.delivery_fee_usdc ?? 0.5),
    rider_id: raw.rider_id ?? null,
    rider_name: raw.rider_name ?? null,
    rider_phone: raw.rider_phone ?? null,
    release_tx_hash: raw.release_tx_hash ?? null,
    picked_up_at: raw.picked_up_at ?? null,
    delivered_at: raw.delivered_at ?? null,
    quantity: raw.quantity !== undefined ? Number(raw.quantity) : undefined,
    special_notes: raw.special_notes ?? null,
    created_at: raw.created_at || new Date().toISOString(),
  };
}

function toDeliveryDbRow(d: Delivery): SupabaseDeliveryRow {
  return {
    id: d.id,
    order_id: d.order_id,
    contract_id: d.contract_id ?? null,
    engagement_id: d.engagement_id ?? null,
    fund_tx_hash: d.fund_tx_hash ?? null,
    buyer_id: d.buyer_id ?? null,
    seller_id: d.seller_id ?? null,
    pickup_address: d.pickup_address ?? "",
    delivery_status: d.delivery_status || "pending",
    used_free_delivery: Boolean(d.used_free_delivery),
    subsidized_by_reserve:
      d.subsidized_by_reserve !== undefined
        ? Boolean(d.subsidized_by_reserve)
        : Boolean(d.used_free_delivery),
    vehicle_type: d.vehicle_type || "EcoDohmi Eléctrico",
    pickup_pin: d.pickup_pin,
    delivery_pin: d.delivery_pin,
    delivery_fee_motes: Number(d.delivery_fee_motes ?? 5),
    delivery_fee_usdc: Number(d.delivery_fee_usdc ?? 0.5),
    rider_id: d.rider_id ?? null,
    rider_name: d.rider_name ?? null,
    rider_phone: d.rider_phone ?? null,
    release_tx_hash: d.release_tx_hash ?? null,
    picked_up_at: d.picked_up_at ?? null,
    delivered_at: d.delivered_at ?? null,
    quantity: d.quantity,
    special_notes: d.special_notes ?? null,
    created_at: d.created_at || new Date().toISOString(),
  };
}

function toDeliveryDbPatch(
  patch: Partial<Delivery>
): Partial<SupabaseDeliveryRow> {
  const out: Partial<SupabaseDeliveryRow> = {};
  if (patch.order_id !== undefined) out.order_id = patch.order_id;
  if (patch.contract_id !== undefined) out.contract_id = patch.contract_id;
  if (patch.engagement_id !== undefined) out.engagement_id = patch.engagement_id;
  if (patch.fund_tx_hash !== undefined) out.fund_tx_hash = patch.fund_tx_hash;
  if (patch.buyer_id !== undefined) out.buyer_id = patch.buyer_id;
  if (patch.seller_id !== undefined) out.seller_id = patch.seller_id;
  if (patch.pickup_address !== undefined)
    out.pickup_address = patch.pickup_address;
  if (patch.delivery_status !== undefined)
    out.delivery_status = patch.delivery_status;
  if (patch.used_free_delivery !== undefined)
    out.used_free_delivery = patch.used_free_delivery;
  if (patch.subsidized_by_reserve !== undefined)
    out.subsidized_by_reserve = patch.subsidized_by_reserve;
  if (patch.vehicle_type !== undefined) out.vehicle_type = patch.vehicle_type;
  if (patch.pickup_pin !== undefined) out.pickup_pin = patch.pickup_pin;
  if (patch.delivery_pin !== undefined) out.delivery_pin = patch.delivery_pin;
  if (patch.delivery_fee_motes !== undefined)
    out.delivery_fee_motes = patch.delivery_fee_motes;
  if (patch.delivery_fee_usdc !== undefined)
    out.delivery_fee_usdc = patch.delivery_fee_usdc;
  if (patch.rider_id !== undefined) out.rider_id = patch.rider_id;
  if (patch.rider_name !== undefined) out.rider_name = patch.rider_name;
  if (patch.rider_phone !== undefined) out.rider_phone = patch.rider_phone;
  if (patch.release_tx_hash !== undefined)
    out.release_tx_hash = patch.release_tx_hash;
  if (patch.picked_up_at !== undefined) out.picked_up_at = patch.picked_up_at;
  if (patch.delivered_at !== undefined) out.delivered_at = patch.delivered_at;
  return out;
}

const globalSeedCache = globalThis as unknown as {
  ecoBancoElianaSeeded?: boolean;
  ecoBancoElianaSeedPromise?: Promise<void> | null;
};

export const supabaseTables = {
  async ensureElianaSeeded(): Promise<void> {
    if (globalSeedCache.ecoBancoElianaSeeded) {
      return;
    }

    if (globalSeedCache.ecoBancoElianaSeedPromise) {
      return globalSeedCache.ecoBancoElianaSeedPromise;
    }

    const seedTask = (async () => {
      const existing = await restRequest<SupabaseUserRow[]>("users", {
        query: `id=eq.${encodeURIComponent(ELIANA_SEED_ROW.id)}&limit=1`,
      });

      if (existing.length === 0) {
        await restWriteWithSchemaFallback<SupabaseUserRow[]>(
          "users",
          "POST",
          ELIANA_SEED_ROW as unknown as Record<string, unknown>,
          undefined,
          "resolution=ignore-duplicates,return=representation"
        );
      }

      globalSeedCache.ecoBancoElianaSeeded = true;
    })().finally(() => {
      globalSeedCache.ecoBancoElianaSeedPromise = null;
    });

    globalSeedCache.ecoBancoElianaSeedPromise = seedTask;
    return seedTask;
  },

  async listUsers(): Promise<SupabaseUserRow[]> {
    await this.ensureElianaSeeded();
    return restRequest<SupabaseUserRow[]>("users", {
      query: "order=created_at.asc",
    });
  },

  async getUserById(id: string): Promise<SupabaseUserRow | null> {
    if (!id) return null;
    const rows = await restRequest<SupabaseUserRow[]>("users", {
      query: `id=eq.${encodeURIComponent(id)}&limit=1`,
    });
    return rows[0] ?? null;
  },

  async insertUser(row: SupabaseUserRow): Promise<SupabaseUserRow> {
    try {
      const created = await restWriteWithSchemaFallback<SupabaseUserRow[]>(
        "users",
        "POST",
        row as unknown as Record<string, unknown>
      );
      return created[0] ? { ...row, ...created[0] } : row;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (row.role === "rider" && msg.includes("users_role_check")) {
        const created = await restWriteWithSchemaFallback<SupabaseUserRow[]>(
          "users",
          "POST",
          { ...row, role: "buyer" } as unknown as Record<string, unknown>
        );
        return created[0] ? { ...row, ...created[0], role: "rider" } : row;
      }
      throw err;
    }
  },

  async updateUser(
    id: string,
    patch: Partial<SupabaseUserRow>
  ): Promise<SupabaseUserRow | null> {
    const rows = await restWriteWithSchemaFallback<SupabaseUserRow[]>(
      "users",
      "PATCH",
      patch as unknown as Record<string, unknown>,
      `id=eq.${encodeURIComponent(id)}`
    );
    if (rows[0]) {
      return { ...rows[0], ...patch };
    }
    const existing = await this.getUserById(id);
    return existing ? { ...existing, ...patch } : null;
  },

  async listProducts(): Promise<SupabaseProductRow[]> {
    return restRequest<SupabaseProductRow[]>("products", {
      query: "order=created_at.desc",
    });
  },

  async insertProduct(row: SupabaseProductRow): Promise<SupabaseProductRow> {
    const rows = await restRequest<SupabaseProductRow[]>("products", {
      method: "POST",
      body: row,
      prefer: "return=representation",
    });
    return rows[0] ?? row;
  },

  async updateProduct(
    id: string,
    patch: Partial<SupabaseProductRow>
  ): Promise<SupabaseProductRow | null> {
    const rows = await restRequest<SupabaseProductRow[]>("products", {
      method: "PATCH",
      query: `id=eq.${encodeURIComponent(id)}`,
      body: patch,
      prefer: "return=representation",
    });
    return rows[0] ?? null;
  },

  async updateProductsBySeller(
    sellerId: string,
    patch: Partial<SupabaseProductRow>
  ): Promise<void> {
    await restRequest<SupabaseProductRow[]>("products", {
      method: "PATCH",
      query: `seller_id=eq.${encodeURIComponent(sellerId)}`,
      body: patch,
    });
  },

  async deleteProduct(id: string): Promise<boolean> {
    const deleted = await restRequest<SupabaseProductRow[]>("products", {
      method: "DELETE",
      query: `id=eq.${encodeURIComponent(id)}`,
      prefer: "return=representation",
    });
    return deleted.length > 0;
  },

  async listOrders(): Promise<Order[]> {
    return restRequest<Order[]>("orders", {
      query: "order=created_at.desc",
    });
  },

  async insertOrder(order: Order): Promise<Order> {
    const rows = await restWriteWithSchemaFallback<Order[]>(
      "orders",
      "POST",
      order as unknown as Record<string, unknown>
    );
    return rows[0] ? { ...order, ...rows[0] } : order;
  },

  async updateOrder(
    id: string,
    patch: Partial<Order>
  ): Promise<Order | null> {
    const rows = await restWriteWithSchemaFallback<Order[]>(
      "orders",
      "PATCH",
      patch as unknown as Record<string, unknown>,
      `id=eq.${encodeURIComponent(id)}`
    );
    return rows[0] ? { ...rows[0], ...patch } : null;
  },

  async listDeliveries(): Promise<Delivery[]> {
    const remoteRows = await restRequest<SupabaseDeliveryRow[]>("deliveries", {
      query: "order=created_at.desc",
    });
    return remoteRows.map((row) => normalizeDeliveryRow(row));
  },

  async insertDelivery(delivery: Delivery): Promise<Delivery> {
    const dbRow = toDeliveryDbRow(delivery);
    const rows = await restWriteWithSchemaFallback<SupabaseDeliveryRow[]>(
      "deliveries",
      "POST",
      dbRow as unknown as Record<string, unknown>
    );
    const inserted = rows[0] ?? dbRow;
    return normalizeDeliveryRow({ ...dbRow, ...inserted });
  },

  async updateDelivery(
    id: string,
    patch: Partial<Delivery>
  ): Promise<Delivery | null> {
    const dbPatch = toDeliveryDbPatch(patch);
    const rows = await restWriteWithSchemaFallback<SupabaseDeliveryRow[]>(
      "deliveries",
      "PATCH",
      dbPatch as unknown as Record<string, unknown>,
      `id=eq.${encodeURIComponent(id)}`
    );
    if (rows[0]) {
      return normalizeDeliveryRow({ ...rows[0], ...dbPatch });
    }
    const existing = await restRequest<SupabaseDeliveryRow[]>("deliveries", {
      query: `id=eq.${encodeURIComponent(id)}&limit=1`,
    });
    return existing[0]
      ? normalizeDeliveryRow({ ...existing[0], ...dbPatch })
      : null;
  },

  async claimDeliveryAtomically(
    id: string,
    patch: Partial<Delivery>
  ): Promise<Delivery | null> {
    const dbPatch = toDeliveryDbPatch(patch);
    const rows = await restWriteWithSchemaFallback<SupabaseDeliveryRow[]>(
      "deliveries",
      "PATCH",
      dbPatch as unknown as Record<string, unknown>,
      `id=eq.${encodeURIComponent(id)}&delivery_status=eq.pending&rider_id=is.null`
    );
    if (!rows || rows.length === 0) {
      return null;
    }
    return normalizeDeliveryRow({ ...rows[0], ...dbPatch });
  },

  async updateDeliveryIfAssignedToRider(
    id: string,
    riderId: string,
    patch: Partial<Delivery>
  ): Promise<Delivery | null> {
    const dbPatch = toDeliveryDbPatch(patch);
    const rows = await restWriteWithSchemaFallback<SupabaseDeliveryRow[]>(
      "deliveries",
      "PATCH",
      dbPatch as unknown as Record<string, unknown>,
      `id=eq.${encodeURIComponent(id)}&rider_id=eq.${encodeURIComponent(riderId)}`
    );
    if (!rows || rows.length === 0) {
      return null;
    }
    return normalizeDeliveryRow({ ...rows[0], ...dbPatch });
  },

  async findRampTransactionByOrderOrHash(
    pollarOrderId: string,
    onchainTxHash?: string | null
  ): Promise<{
    tableAvailable: boolean;
    existing: SupabaseRampTransactionRow | null;
  }> {
    try {
      const byOrder = await restRequest<SupabaseRampTransactionRow[]>(
        "ramp_transactions",
        {
          query: `pollar_order_id=eq.${encodeURIComponent(pollarOrderId)}&limit=1`,
        }
      );
      if (byOrder[0]) {
        return { tableAvailable: true, existing: byOrder[0] };
      }

      if (onchainTxHash) {
        const byHash = await restRequest<SupabaseRampTransactionRow[]>(
          "ramp_transactions",
          {
            query: `onchain_tx_hash=eq.${encodeURIComponent(onchainTxHash)}&limit=1`,
          }
        );
        if (byHash[0]) {
          return { tableAvailable: true, existing: byHash[0] };
        }
      }

      return { tableAvailable: true, existing: null };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("404") ||
        msg.includes("PGRST205") ||
        msg.includes("42P01")
      ) {
        return { tableAvailable: false, existing: null };
      }
      throw err;
    }
  },

  async insertRampTransaction(row: SupabaseRampTransactionRow): Promise<{
    ok: boolean;
    duplicate?: boolean;
    tableAvailable: boolean;
    record?: SupabaseRampTransactionRow;
  }> {
    try {
      const rows = await restWriteWithSchemaFallback<
        SupabaseRampTransactionRow[]
      >("ramp_transactions", "POST", row as unknown as Record<string, unknown>);
      return {
        ok: true,
        tableAvailable: true,
        record: rows[0] ?? row,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("409") ||
        msg.includes("23505") ||
        msg.toLowerCase().includes("duplicate key")
      ) {
        return {
          ok: false,
          duplicate: true,
          tableAvailable: true,
        };
      }
      if (
        msg.includes("404") ||
        msg.includes("PGRST205") ||
        msg.includes("42P01")
      ) {
        return {
          ok: true,
          tableAvailable: false,
          record: row,
        };
      }
      throw err;
    }
  },
};

// ============================================================================
// Supabase Storage (Buckets: avatars, product-images, qr-bancarios, rider-verifications)
// ============================================================================

const DATA_URL_REGEX =
  /^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/;

function mimeToExtension(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/svg+xml":
      return "svg";
    default:
      return "jpg";
  }
}

export function isValidBucket(value: string): value is StorageBucket {
  return (VALID_BUCKETS as ReadonlyArray<string>).includes(value);
}

export async function uploadImageToStorage(
  bucket: StorageBucket,
  dataUrlOrUrl: string,
  ownerId: string
): Promise<{ publicUrl: string; path: string }> {
  const trimmed = (dataUrlOrUrl || "").trim();
  if (!trimmed) {
    return { publicUrl: "", path: "" };
  }

  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/api/storage")
  ) {
    return { publicUrl: trimmed, path: trimmed };
  }

  const match = trimmed.match(DATA_URL_REGEX);
  if (!match) {
    throw new Error(
      "El archivo debe ser una imagen válida en formato Data URL."
    );
  }

  const contentType = match[1];
  const cleanBase64 = match[2].replace(/\s+/g, "");
  const ext = mimeToExtension(contentType);
  const safeOwner =
    (ownerId || "ecobanco").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) ||
    "ecobanco";
  const objectPath = `${safeOwner}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const creds = getSupabaseCredentials();
  const buffer = Buffer.from(cleanBase64, "base64");
  const uploadRes = await fetch(
    `${creds.url}/storage/v1/object/${bucket}/${objectPath}`,
    {
      method: "POST",
      headers: {
        apikey: creds.key,
        Authorization: `Bearer ${creds.key}`,
        "Content-Type": contentType,
        "x-upsert": "true",
      },
      body: new Uint8Array(buffer),
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`Error subiendo imagen al bucket ${bucket}: ${errText}`);
  }

  return {
    path: objectPath,
    publicUrl: `${creds.url}/storage/v1/object/public/${bucket}/${objectPath}`,
  };
}

export async function getStoredObject(
  bucket: StorageBucket,
  objectPath: string
): Promise<{ contentType: string; buffer: Buffer } | null> {
  if (!objectPath || objectPath.includes("..")) {
    return null;
  }

  const creds = getSupabaseCredentials();
  const res = await fetch(
    `${creds.url}/storage/v1/object/public/${bucket}/${objectPath}`,
    { cache: "no-store" }
  );
  if (!res.ok) return null;
  const arrayBuffer = await res.arrayBuffer();
  return {
    contentType: res.headers.get("content-type") || "image/jpeg",
    buffer: Buffer.from(arrayBuffer),
  };
}
