import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

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

export function serializeSession(session: EcoBancoSession): string {
  const clean: EcoBancoSession = {};
  if (session.buyerId) clean.buyerId = session.buyerId;
  if (session.merchantId) clean.merchantId = session.merchantId;
  if (session.riderId) clean.riderId = session.riderId;
  if (session.activeBuyerType === "merchant" || session.activeBuyerType === "buyer") {
    clean.activeBuyerType = session.activeBuyerType;
  }

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
    return session;
  } catch {
    return {};
  }
}

export function readSession(request: NextRequest): EcoBancoSession {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  return parseSessionToken(token);
}

export function applySessionCookie<T>(
  response: NextResponse<T>,
  session: EcoBancoSession
): NextResponse<T> {
  const isEmpty =
    !session.buyerId &&
    !session.merchantId &&
    !session.riderId &&
    !session.activeBuyerType;

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

  response.cookies.set(SESSION_COOKIE_NAME, serializeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}
