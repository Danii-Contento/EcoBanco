import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

export {
  areSameBolivianPhone,
  extractBolivianLocalDigits,
  isValidBolivianPhone,
  normalizeBolivianPhone,
} from "./phone";

export const SESSION_COOKIE_NAME = "ecobanco_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 días

export interface EcoBancoSession {
  buyerId?: string;
  merchantId?: string;
  riderId?: string;
  activeBuyerType?: "buyer" | "merchant";
}

function getHmacSecret(): string {
  const secret = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
  ).trim();
  if (!secret) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY es obligatorio para firmar sesiones de EcoBanco."
    );
  }
  return secret;
}

function signPayload(payloadB64: string): string {
  return crypto
    .createHmac("sha256", getHmacSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createEmptySession(): EcoBancoSession {
  return {};
}

export function createExclusiveBuyerSession(buyerId: string): EcoBancoSession {
  const cleanId = String(buyerId || "").trim();
  return cleanId ? { buyerId: cleanId, activeBuyerType: "buyer" } : {};
}

export function createExclusiveMerchantSession(
  merchantId: string
): EcoBancoSession {
  const cleanId = String(merchantId || "").trim();
  return cleanId ? { merchantId: cleanId, activeBuyerType: "merchant" } : {};
}

export function createExclusiveRiderSession(riderId: string): EcoBancoSession {
  const cleanId = String(riderId || "").trim();
  return cleanId ? { riderId: cleanId } : {};
}

export function getActiveSessionRole(
  session: EcoBancoSession
): "buyer" | "merchant" | "rider" | null {
  if (session.riderId) return "rider";
  if (session.merchantId) return "merchant";
  if (session.buyerId) return "buyer";
  return null;
}

function normalizeExclusiveSession(raw: EcoBancoSession): EcoBancoSession {
  if (raw.activeBuyerType === "merchant" && raw.merchantId) {
    return createExclusiveMerchantSession(raw.merchantId);
  }
  if (raw.buyerId) {
    return createExclusiveBuyerSession(raw.buyerId);
  }
  if (raw.merchantId) {
    return createExclusiveMerchantSession(raw.merchantId);
  }
  if (raw.riderId) {
    return createExclusiveRiderSession(raw.riderId);
  }
  return {};
}

export function serializeSession(session: EcoBancoSession): string {
  const clean = normalizeExclusiveSession(session);

  const payloadB64 = Buffer.from(JSON.stringify(clean), "utf8").toString(
    "base64url"
  );
  const sig = signPayload(payloadB64);
  return `${payloadB64}.${sig}`;
}

export function parseSessionToken(token?: string | null): EcoBancoSession {
  if (!token || typeof token !== "string") {
    return {};
  }

  const dotIdx = token.indexOf(".");
  if (dotIdx <= 0) {
    return {};
  }

  const payloadB64 = token.slice(0, dotIdx);
  const providedSig = token.slice(dotIdx + 1);
  if (!payloadB64 || !providedSig) {
    return {};
  }

  try {
    const expectedSig = signPayload(payloadB64);
    const a = Buffer.from(providedSig, "utf8");
    const b = Buffer.from(expectedSig, "utf8");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return {};
    }

    const decoded = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    const session: EcoBancoSession = {};
    if (typeof decoded.buyerId === "string" && decoded.buyerId.trim()) {
      session.buyerId = decoded.buyerId.trim();
    }
    if (typeof decoded.merchantId === "string" && decoded.merchantId.trim()) {
      session.merchantId = decoded.merchantId.trim();
    }
    if (typeof decoded.riderId === "string" && decoded.riderId.trim()) {
      session.riderId = decoded.riderId.trim();
    }
    if (
      decoded.activeBuyerType === "merchant" ||
      decoded.activeBuyerType === "buyer"
    ) {
      session.activeBuyerType = decoded.activeBuyerType;
    }
    return normalizeExclusiveSession(session);
  } catch {
    return {};
  }
}

export function readSession(request: NextRequest): EcoBancoSession {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionToken(token);
}

export function applyNoStoreHeaders<T>(
  response: NextResponse<T>
): NextResponse<T> {
  response.headers.set(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private"
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

export function applySessionCookie<T>(
  response: NextResponse<T>,
  session: EcoBancoSession
): NextResponse<T> {
  const exclusive = normalizeExclusiveSession(session);
  const isEmpty =
    !exclusive.buyerId &&
    !exclusive.merchantId &&
    !exclusive.riderId;

  applyNoStoreHeaders(response);

  if (isEmpty) {
    response.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
    return response;
  }

  response.cookies.set(SESSION_COOKIE_NAME, serializeSession(exclusive), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

/**
 * Indica si existe una sesión de vecino comprador autenticada.
 */
export function hasBuyerSession(session: EcoBancoSession): boolean {
  return Boolean(session.buyerId);
}

/**
 * Indica si el visitante está explorando como invitado sin ninguna sesión activa.
 */
export function isGuestSession(session: EcoBancoSession): boolean {
  return !session.buyerId && !session.merchantId && !session.riderId;
}

/**
 * Inicia una sesión exclusiva para el vecino comprador, aislando cualquier perfil previo.
 */
export function withBuyerSession(
  _session: EcoBancoSession,
  buyerId: string
): EcoBancoSession {
  return createExclusiveBuyerSession(buyerId);
}

/**
 * Remueve la sesión del vecino comprador y limpia `activeBuyerType` si no quedan otros roles.
 */
export function clearBuyerSession(session: EcoBancoSession): EcoBancoSession {
  const next: EcoBancoSession = { ...session };
  delete next.buyerId;
  if (!next.merchantId && !next.riderId) {
    return {};
  }
  if (next.activeBuyerType === "buyer") {
    delete next.activeBuyerType;
  }
  return normalizeExclusiveSession(next);
}
