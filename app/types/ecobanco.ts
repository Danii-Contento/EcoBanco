export type StorageBucket =
  | "avatars"
  | "product-images"
  | "qr-bancarios"
  | "rider-verifications";

export type RiderVehicleType = "bicicleta" | "moto_electrica";

export interface Rider {
  id: string;
  name: string;
  phone: string;
  vehicleType: RiderVehicleType;
  address: string;
  ciNumber: string;
  selfieUrl: string;
  ciPhotoUrl: string;
  riderVerified: boolean;
  riderInviteCode: string;
  isLoggedIn: boolean;
  motesEnabled: boolean;
  fiatWalletEnabled: boolean;
  motesEarned: number;
  fiatBs: number;
  usdcEarned: number;
  completedDeliveries: number;
  pollar_user_id?: string | null;
  stellar_address?: string | null;
  createdAt: string;
}

export interface Product {
  id: string;
  name: string;
  sellerId?: string;
  sellerName: string;
  sellerPhone?: string;
  sellerAvatarUrl?: string;
  sellerAddress?: string;
  sellerSchedule?: string;
  sellerDescription?: string;
  sellerFreeDeliveries?: number;
  sellerIsOpen?: boolean;
  category?: "Gastronomía" | "Panadería" | "Servicios" | "Agroecología";
  priceMotes: number;
  imageUrl: string;
  emoji?: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export interface ReferralStats {
  code: string;
  invitedCount: number;
  motesEarned: number;
  freeDeliveriesEarned: number;
}

export interface EscrowTransaction {
  contractId: string;
  engagementId?: string | null;
  fundTxHash?: string | null;
  releaseTxHash?: string | null;
  orderId?: string;
  productId: string;
  productName: string;
  quantity?: number;
  specialNotes?: string;
  sellerId?: string | null;
  sellerName: string;
  buyerId?: string | null;
  buyerName?: string;
  buyerType: "buyer" | "merchant";
  amountMotes: number;
  status: "LOCKED_IN_ESCROW" | "RELEASED";
  createdAt: string;
  deliveryId?: string;
  deliveryStatus?: string;
  pickupPin?: string;
  deliveryPin?: string;
  usedFreeDelivery?: boolean;
  subsidizedByReserve?: boolean;
  riderName?: string | null;
  vehicleType?: string;
}

export interface Order {
  id: string;
  contract_id: string;
  engagement_id?: string | null;
  fund_tx_hash?: string | null;
  release_tx_hash?: string | null;
  product_id: string | null;
  product_name: string;
  quantity?: number;
  special_notes?: string | null;
  seller_id: string | null;
  seller_name: string;
  buyer_id: string | null;
  buyer_type: "buyer" | "merchant";
  amount_motes: number;
  status: "LOCKED_IN_ESCROW" | "RELEASED" | string;
  created_at: string;
}

export interface Delivery {
  id: string;
  order_id: string;
  buyer_id: string | null;
  seller_id: string | null;
  pickup_address: string;
  delivery_status:
    | "pending"
    | "in_transit"
    | "delivered"
    | "PENDING_DISPATCH"
    | "IN_TRANSIT"
    | "DELIVERED"
    | string;
  used_free_delivery: boolean;
  vehicle_type: string;
  created_at: string;
  contract_id?: string | null;
  engagement_id?: string | null;
  fund_tx_hash?: string | null;
  release_tx_hash?: string | null;
  product_name?: string;
  quantity?: number;
  special_notes?: string | null;
  amount_motes?: number;
  buyer_name?: string;
  delivery_address?: string;
  seller_name?: string;
  seller_phone?: string | null;
  pickup_pin: string;
  delivery_pin: string;
  subsidized_by_reserve?: boolean;
  delivery_fee_motes: number;
  delivery_fee_usdc: number;
  rider_id?: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  picked_up_at?: string | null;
  delivered_at?: string | null;
}

export interface User {
  id: string;
  role: "buyer" | "merchant" | "rider";
  name: string;
  storeName?: string;
  storeDescription?: string;
  address?: string;
  deliveryAddress?: string;
  schedule?: string;
  avatarUrl?: string;
  profileCompleted?: boolean;
  phone?: string;
  hasFourDigitPin?: boolean;
  bankQrUrl?: string;
  email?: string;
  isLoggedIn: boolean;
  isOpen?: boolean;
  isProsumer: boolean;
  isPremium?: boolean;
  fiatWalletEnabled?: boolean;
  motesEnabled?: boolean;
  qrEnabled?: boolean;
  motes: number;
  fiatBs: number;
  freeDeliveries: number;
  free_deliveries_remaining?: number;
  salesCount?: number;
  ciNumber?: string;
  selfieUrl?: string;
  ciPhotoUrl?: string;
  riderVerified?: boolean;
  riderInviteCode?: string;
  pollar_user_id?: string | null;
  stellar_address?: string | null;
  referrals: ReferralStats;
  transactions: EscrowTransaction[];
}
