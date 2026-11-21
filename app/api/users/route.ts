import { NextRequest, NextResponse } from "next/server";
import { applySessionCookie, readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";
import { RiderVehicleType } from "@/app/types/ecobanco";

export async function GET(request: NextRequest) {
  try {
    const session = readSession(request);
    const state = await db.getState(session);
    return NextResponse.json({
      buyer: state.buyer,
      merchant: state.merchant,
      rider: state.rider,
      activeBuyerType: state.activeBuyerType,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los usuarios desde Supabase." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    const body = await request.json();
    const {
      action,
      name,
      email,
      storeName,
      ownerName,
      phone,
      deliveryAddress,
      delivery_address,
      referralCode,
      referral_code,
      identifier,
      password,
      storeDescription,
      address,
      schedule,
      avatarUrl,
      bankQrUrl,
      paymentMethod,
      amountBs,
      buyerType,
      vehicleType,
      ciNumber,
      selfieUrl,
      ciPhotoUrl,
      ci_photo_url,
      userId,
      role,
      purpose,
      pollar_order_id,
      pollarOrderId,
      direction,
      order_state,
      orderState,
      fiat_currency,
      fiatCurrency,
      asset_code,
      assetCode,
      crypto_amount,
      cryptoAmount,
      onchain_tx_hash,
      onchainTxHash,
      pollar_user_id,
      stellar_address,
      pollarUserId,
      stellarAddress,
    } = body;

    const resolvedPollarUserId =
      pollar_user_id !== undefined
        ? String(pollar_user_id || "")
        : pollarUserId !== undefined
        ? String(pollarUserId || "")
        : undefined;
    const resolvedStellarAddress =
      stellar_address !== undefined
        ? String(stellar_address || "")
        : stellarAddress !== undefined
        ? String(stellarAddress || "")
        : undefined;

    if (action === "merchant_register") {
      const result = await db.registerMerchant(
        String(ownerName || ""),
        String(storeName || ""),
        String(phone || ""),
        {
          pollarUserId: resolvedPollarUserId,
          stellarAddress: resolvedStellarAddress,
        }
      );

      if (!result.ok || !result.merchant) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const nextSession = { ...session, merchantId: result.merchant.id };
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: result.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "merchant_login") {
      const result = await db.loginMerchant(
        String(identifier || ""),
        String(password || "")
      );

      if (!result.ok || !result.merchant) {
        return NextResponse.json({ error: result.error }, { status: 401 });
      }

      const nextSession = { ...session, merchantId: result.merchant.id };
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: result.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "merchant_update_settings") {
      const result = await db.updateMerchantSettings(session, {
        storeName,
        password,
        storeDescription,
        address,
        schedule,
        avatarUrl,
        bankQrUrl,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const state = await db.getState(session);
      return NextResponse.json({
        message: "Perfil actualizado correctamente.",
        buyer: state.buyer,
        merchant: result.merchant,
        products: state.products,
        activeBuyerType: state.activeBuyerType,
      });
    }

    if (action === "merchant_upgrade_subscription") {
      const method: "motes" | "fiat" =
        paymentMethod === "motes" ? "motes" : "fiat";
      const result = await db.upgradeMerchantSubscription(session, method);

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const state = await db.getState(session);
      return NextResponse.json({
        message:
          method === "motes"
            ? "¡Caserita Aliada activada con tus 100 MOTES de ventas! Tu cobro por QR bancario y 5 envíos ecológicos incluidos ya están activos."
            : "¡Caserita Aliada activada con 100 Bs! Conservas todos tus MOTES y ya tienes activos tu cobro por QR bancario y 5 envíos ecológicos incluidos.",
        buyer: state.buyer,
        merchant: result.merchant,
        activeBuyerType: state.activeBuyerType,
      });
    }

    if (action === "merchant_logout") {
      const nextSession = { ...session };
      delete nextSession.merchantId;
      if (nextSession.activeBuyerType === "merchant") {
        nextSession.activeBuyerType = "buyer";
      }
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "lazy_login") {
      const resolvedAddress = String(deliveryAddress || delivery_address || "");
      const resolvedRef = String(referralCode || referral_code || "");
      const result = await db.registerOrLoginBuyer({
        name: String(name || ""),
        email: String(email || ""),
        phone: String(phone || ""),
        deliveryAddress: resolvedAddress,
        referralCode: resolvedRef || undefined,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
      });
      if (!result.ok || !result.buyer) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const nextSession = {
        ...session,
        buyerId: result.buyer.id,
        activeBuyerType: "buyer" as const,
      };
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: result.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "buyer_logout") {
      const nextSession = { ...session };
      delete nextSession.buyerId;
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "buyer_update_profile") {
      const resolvedAddress = String(deliveryAddress || delivery_address || "");
      const result = await db.updateBuyerProfile(session, {
        name: name !== undefined ? String(name) : undefined,
        email: email !== undefined ? String(email) : undefined,
        phone: String(phone || ""),
        deliveryAddress: resolvedAddress,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const state = await db.getState(session);
      return NextResponse.json({
        message: "Datos de contacto y entrega actualizados.",
        buyer: result.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
    }

    if (action === "confirm_fiat_topup") {
      const result = await db.confirmFiatTopup();
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    if (action === "confirm_ramp_topup") {
      const targetRole: "buyer" | "merchant" =
        role === "merchant" ? "merchant" : "buyer";
      const resolvedPurpose =
        purpose === "prosumer_subscription"
          ? "prosumer_subscription"
          : purpose === "merchant_premium"
          ? "merchant_premium"
          : "fiat_topup";
      const resolvedOrderId = String(pollar_order_id || pollarOrderId || "");
      const resolvedOrderState = String(order_state || orderState || "");
      const resolvedFiat = String(fiat_currency || fiatCurrency || "BOB");
      const resolvedAsset = String(asset_code || assetCode || "USDC");
      const resolvedCryptoRaw =
        crypto_amount !== undefined ? crypto_amount : cryptoAmount;
      const resolvedCrypto =
        resolvedCryptoRaw !== undefined && resolvedCryptoRaw !== null
          ? Number(resolvedCryptoRaw)
          : null;
      const resolvedTxHash = String(
        onchain_tx_hash || onchainTxHash || ""
      ).trim();

      const result = await db.confirmRampTopup(session, {
        role: targetRole,
        purpose: resolvedPurpose,
        pollarOrderId: resolvedOrderId,
        direction: String(direction || ""),
        orderState: resolvedOrderState,
        amountBs: Number(amountBs),
        fiatCurrency: resolvedFiat,
        assetCode: resolvedAsset,
        cryptoAmount: resolvedCrypto,
        onchainTxHash: resolvedTxHash || null,
        pollarUserId: resolvedPollarUserId || null,
        stellarAddress: resolvedStellarAddress || null,
      });

      if (!result.ok) {
        return NextResponse.json(
          { error: result.error, duplicate: Boolean(result.duplicate) },
          { status: result.duplicate ? 409 : 400 }
        );
      }

      const state = await db.getState(session);
      const creditedRounded = Math.round(result.creditedBs ?? Number(amountBs));
      const successMessage =
        resolvedPurpose === "prosumer_subscription"
          ? `¡Club Vecino activado con orden Pollar ${result.pollarOrderId}! Se acreditaron +50 MOTES y 5 envíos ecológicos incluidos.`
          : resolvedPurpose === "merchant_premium"
          ? `¡Caserita Aliada activada con orden Pollar ${result.pollarOrderId}! Tu cobro directo a QR bancario y 5 envíos ecológicos están listos.`
          : `¡Recarga real de ${creditedRounded} Bs acreditada (Orden Pollar ${result.pollarOrderId})!`;

      return NextResponse.json({
        message: successMessage,
        creditedBs: result.creditedBs,
        pollarOrderId: result.pollarOrderId,
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
    }

    if (action === "pollar_login") {
      const targetRole: "buyer" | "merchant" | "rider" =
        role === "merchant"
          ? "merchant"
          : role === "rider"
          ? "rider"
          : "buyer";

      const lookup = await db.lookupUserByPollarSession({
        role: targetRole,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
        email: email ? String(email) : undefined,
      });

      if (!lookup.ok || !lookup.userRow) {
        return NextResponse.json({ matched: false }, { status: 200 });
      }

      const nextSession = { ...session };
      if (targetRole === "merchant") {
        nextSession.merchantId = lookup.userRow.id;
      } else if (targetRole === "rider") {
        nextSession.riderId = lookup.userRow.id;
      } else {
        nextSession.buyerId = lookup.userRow.id;
        nextSession.activeBuyerType = "buyer";
      }

      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        matched: true,
        buyer: state.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_onboarding" || action === "rider_verify") {
      const resolvedVehicle: RiderVehicleType =
        vehicleType === "moto_electrica" ? "moto_electrica" : "bicicleta";
      const resolvedCiPhoto = String(ciPhotoUrl || ci_photo_url || "");
      const result = await db.registerOrUpdateRider({
        name: String(name || ""),
        phone: String(phone || ""),
        vehicleType: resolvedVehicle,
        address: String(address || ""),
        ciNumber: String(ciNumber || ""),
        selfieUrl: String(selfieUrl || ""),
        ciPhotoUrl: resolvedCiPhoto,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
      });
      if (!result.ok || !result.rider) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const nextSession = { ...session, riderId: result.rider.id };
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        rider: result.rider,
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_logout") {
      const nextSession = { ...session };
      delete nextSession.riderId;
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        rider: state.rider,
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "upgrade_prosumer") {
      const result = await db.upgradeBuyerProsumer(session);
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      const state = await db.getState(session);
      return NextResponse.json({
        buyer: result.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
    }

    if (action === "referral_reward") {
      return NextResponse.json(
        {
          error:
            "Los bonos de referido solo se acreditan automáticamente cuando un usuario nuevo real se registra usando tu código de referido.",
        },
        { status: 400 }
      );
    }

    if (action === "set_buyer_type") {
      const nextType: "buyer" | "merchant" =
        buyerType === "merchant" ? "merchant" : "buyer";
      const nextSession = { ...session, activeBuyerType: nextType };
      const state = await db.getState(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "sync_pollar_wallet") {
      const resolvedRole =
        role === "merchant" || role === "rider" || role === "buyer"
          ? role
          : undefined;
      const result = await db.syncPollarWallet(session, {
        userId: userId ? String(userId) : undefined,
        role: resolvedRole,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
      });

      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const state = await db.getState(session);
      return NextResponse.json({
        buyer: state.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Error procesando la solicitud." },
      { status: 500 }
    );
  }
}
