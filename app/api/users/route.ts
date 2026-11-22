import { NextRequest, NextResponse } from "next/server";
import {
  applyNoStoreHeaders,
  applySessionCookie,
  createEmptySession,
  createExclusiveBuyerSession,
  createExclusiveMerchantSession,
  createExclusiveRiderSession,
  normalizeBolivianPhone,
  readSession,
} from "@/app/lib/session";
import { clearMerchantRuntimeCache, createEmptyBuyer, db } from "@/app/lib/store";
import { sanitizeUserError } from "@/app/lib/friendlyCopy";
import { RiderVehicleType } from "@/app/types/ecobanco";

export async function GET(request: NextRequest) {
  try {
    const session = readSession(request);
    const state = await db.getSessionUsers(session);
    return applyNoStoreHeaders(
      NextResponse.json({
        buyer: state.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      })
    );
  } catch (err) {
    console.error(
      "[EcoBanco Users API][GET]",
      err instanceof Error ? err.message : "unknown_error"
    );
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "No se pudieron cargar los usuarios desde Supabase." },
        { status: 500 }
      )
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
      pin,
      storeDescription,
      address,
      schedule,
      avatarUrl,
      bankQrUrl,
      isOpen,
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
      orderRef,
      order_ref,
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

    if (
      action === "logout_all" ||
      action === "merchant_logout" ||
      action === "buyer_logout" ||
      action === "rider_logout"
    ) {
      clearMerchantRuntimeCache(session.merchantId);
      const res = NextResponse.json({
        buyer: createEmptyBuyer(),
        merchant: null,
        rider: null,
        activeBuyerType: "buyer" as const,
      });
      return applySessionCookie(res, createEmptySession());
    }

    if (action === "merchant_toggle_open") {
      if (!session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "No hay sesión activa de comerciante." },
            { status: session.buyerId || session.riderId ? 403 : 401 }
          )
        );
      }
      const result = await db.toggleMerchantOpen(session, Boolean(isOpen));
      if (!result.ok || !result.merchant) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }
      const [state, merchantProducts] = await Promise.all([
        db.getSessionUsers(session),
        db.getProducts({ includeClosed: true, merchantId: session.merchantId }),
      ]);
      return applyNoStoreHeaders(
        NextResponse.json({
          message: result.merchant.isOpen
            ? "Tu puesto ahora está ABIERTO y visible en el Mercado del Barrio."
            : "Tu puesto ahora está CERRADO y oculto temporalmente en el Mercado del Barrio.",
          buyer: state.buyer,
          merchant: result.merchant,
          products: merchantProducts,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "buyer_phone_login") {
      const normalizedPhone = normalizeBolivianPhone(String(phone || ""));
      if (!normalizedPhone) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Ingresa tu número de WhatsApp de Bolivia (8 dígitos, ej. 76543210).",
            },
            { status: 400 }
          )
        );
      }
      const resolvedPin = String(pin ?? password ?? "");
      const result = await db.loginBuyerByPhone(normalizedPhone, resolvedPin);
      if (!result.ok || !result.buyer) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: result.error },
            { status: result.unauthorized ? 401 : 404 }
          )
        );
      }
      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveBuyerSession(result.buyer.id);
      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        buyer: result.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "merchant_register") {
      const normalizedPhone = normalizeBolivianPhone(String(phone || ""));
      if (!normalizedPhone) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Ingresa un número de WhatsApp de Bolivia válido (8 dígitos, ej. 76543210).",
            },
            { status: 400 }
          )
        );
      }
      const result = await db.registerMerchant(
        String(ownerName || ""),
        String(storeName || ""),
        normalizedPhone,
        {
          pollarUserId: resolvedPollarUserId,
          stellarAddress: resolvedStellarAddress,
        },
        password !== undefined ? String(password) : undefined
      );

      if (!result.ok || !result.merchant) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }

      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveMerchantSession(result.merchant.id);
      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: result.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "merchant_login") {
      const result = await db.loginMerchant(
        String(identifier || ""),
        String(password || ""),
        phone ? String(phone) : undefined
      );

      if (!result.ok || !result.merchant) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 401 })
        );
      }

      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveMerchantSession(result.merchant.id);
      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        buyer: state.buyer,
        merchant: result.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "merchant_update_settings") {
      if (!session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "No hay sesión activa de comerciante." },
            { status: session.buyerId || session.riderId ? 403 : 401 }
          )
        );
      }
      const result = await db.updateMerchantSettings(session, {
        storeName,
        password,
        storeDescription,
        address,
        schedule,
        avatarUrl,
        bankQrUrl,
        ...(typeof isOpen === "boolean" ? { isOpen } : {}),
      });

      if (!result.ok) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }

      const [state, merchantProducts] = await Promise.all([
        db.getSessionUsers(session),
        db.getProducts({ includeClosed: true, merchantId: session.merchantId }),
      ]);
      return applyNoStoreHeaders(
        NextResponse.json({
          message: "Perfil actualizado correctamente.",
          buyer: state.buyer,
          merchant: result.merchant,
          products: merchantProducts,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "merchant_upgrade_subscription") {
      if (!session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "No hay sesión activa de comerciante." },
            { status: session.buyerId || session.riderId ? 403 : 401 }
          )
        );
      }
      const method: "motes" | "fiat" =
        paymentMethod === "motes" ? "motes" : "fiat";
      const result = await db.upgradeMerchantSubscription(session, method);

      if (!result.ok) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }

      const state = await db.getSessionUsers(session);
      return applyNoStoreHeaders(
        NextResponse.json({
          message:
            method === "motes"
              ? "¡Caserita Aliada activada con tus 100 MOTES de ventas! Tu cobro por QR bancario y 5 envíos ecológicos incluidos ya están activos."
              : "¡Caserita Aliada activada con 100 Bs! Conservas todos tus MOTES y ya tienes activos tu cobro por QR bancario y 5 envíos ecológicos incluidos.",
          buyer: state.buyer,
          merchant: result.merchant,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "quick_neighbor_login" || action === "lazy_login") {
      const cleanName = String(name || "").trim();
      if (!cleanName) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "Escribe tu nombre o apodo para continuar." },
            { status: 400 }
          )
        );
      }

      const normalizedPhone = normalizeBolivianPhone(String(phone || ""));
      if (!normalizedPhone) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Ingresa tu número de WhatsApp de Bolivia (8 dígitos, ej. 76543210).",
            },
            { status: 400 }
          )
        );
      }

      const resolvedAddress = String(
        deliveryAddress || delivery_address || ""
      ).trim();
      const resolvedRef = String(referralCode || referral_code || "");
      const resolvedPin = String(pin ?? password ?? "");
      const result = await db.registerOrLoginBuyer({
        name: cleanName,
        email: String(email || ""),
        phone: normalizedPhone,
        pin: resolvedPin,
        deliveryAddress: resolvedAddress,
        referralCode: resolvedRef || undefined,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
      });
      if (!result.ok || !result.buyer) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: result.error },
            { status: result.unauthorized ? 401 : 400 }
          )
        );
      }
      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveBuyerSession(result.buyer.id);
      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        buyer: result.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "buyer_update_profile") {
      if (!session.buyerId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "No hay sesión activa de comprador." },
            { status: session.merchantId || session.riderId ? 403 : 401 }
          )
        );
      }

      const normalizedPhone = normalizeBolivianPhone(String(phone || ""));
      if (!normalizedPhone) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Ingresa tu número de WhatsApp de Bolivia (8 dígitos, ej. 76543210).",
            },
            { status: 400 }
          )
        );
      }

      const resolvedAddress = String(
        deliveryAddress || delivery_address || ""
      ).trim();
      const result = await db.updateBuyerProfile(session, {
        name: name !== undefined ? String(name) : undefined,
        email: email !== undefined ? String(email) : undefined,
        phone: normalizedPhone,
        deliveryAddress: resolvedAddress,
      });
      if (!result.ok) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }
      const state = await db.getSessionUsers(session);
      return applyNoStoreHeaders(
        NextResponse.json({
          message: "Datos de contacto y entrega actualizados.",
          buyer: result.buyer,
          merchant: state.merchant,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "confirm_fiat_topup") {
      const result = await db.confirmFiatTopup();
      return applyNoStoreHeaders(
        NextResponse.json({ error: result.error }, { status: 400 })
      );
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
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error: sanitizeUserError(result.error),
              duplicate: Boolean(result.duplicate),
            },
            { status: result.duplicate ? 409 : 400 }
          )
        );
      }

      const state = await db.getSessionUsers(session);
      const creditedRounded = Math.round(result.creditedBs ?? Number(amountBs));
      const successMessage =
        resolvedPurpose === "prosumer_subscription"
          ? "¡Club Vecino activado con éxito! Se acreditaron +50 MOTES y 5 envíos ecológicos incluidos."
          : resolvedPurpose === "merchant_premium"
          ? "¡Caserita Aliada activada con éxito! Tu cobro directo a QR bancario y 5 envíos ecológicos están listos."
          : `¡Recarga de ${creditedRounded} Bs acreditada en tu libreta comunitaria!`;

      return applyNoStoreHeaders(
        NextResponse.json({
          message: successMessage,
          creditedBs: result.creditedBs,
          pollarOrderId: result.pollarOrderId,
          buyer: state.buyer,
          merchant: state.merchant,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "testnet_qr_topup") {
      const resolvedPurpose =
        purpose === "prosumer_subscription"
          ? "prosumer_subscription"
          : purpose === "merchant_premium"
          ? "merchant_premium"
          : "fiat_topup";
      const targetRole: "buyer" | "merchant" =
        resolvedPurpose === "merchant_premium"
          ? "merchant"
          : resolvedPurpose === "prosumer_subscription"
          ? "buyer"
          : role === "merchant"
          ? "merchant"
          : "buyer";

      if (targetRole === "merchant" && !session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como caserita para completar esta recarga.",
            },
            { status: session.buyerId || session.riderId ? 403 : 401 }
          )
        );
      }
      if (targetRole === "buyer" && !session.buyerId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como vecino para completar esta recarga.",
            },
            { status: session.merchantId || session.riderId ? 403 : 401 }
          )
        );
      }

      const result = await db.executeTestnetQrTopup(session, {
        role: targetRole,
        purpose: resolvedPurpose,
        amountBs: Number(amountBs),
        orderRef: String(orderRef || order_ref || ""),
        pollarUserId: resolvedPollarUserId || null,
        stellarAddress: resolvedStellarAddress || null,
      });

      if (!result.ok) {
        const statusCode = result.duplicate
          ? 409
          : result.forbidden
          ? 403
          : result.unauthorized
          ? 401
          : 400;
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error: sanitizeUserError(result.error),
              duplicate: Boolean(result.duplicate),
            },
            { status: statusCode }
          )
        );
      }

      const state = await db.getSessionUsers(session);
      const creditedRounded = Math.round(result.creditedBs ?? Number(amountBs));
      const successMessage =
        resolvedPurpose === "prosumer_subscription"
          ? "¡Club Vecino activado con éxito! Se acreditaron +50 MOTES y 5 envíos ecológicos incluidos."
          : resolvedPurpose === "merchant_premium"
          ? "¡Caserita Aliada activada con éxito! Tu cobro directo a QR bancario y 5 envíos ecológicos están listos."
          : `¡Recarga de ${creditedRounded} Bs acreditada en tu libreta comunitaria!`;

      return applyNoStoreHeaders(
        NextResponse.json({
          message: successMessage,
          creditedBs: result.creditedBs,
          pollarOrderId: result.pollarOrderId,
          onchainTxHash: result.onchainTxHash,
          treasuryPublic: result.treasuryPublic,
          buyer: state.buyer,
          merchant: state.merchant,
          activeBuyerType: state.activeBuyerType,
        })
      );
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
        return applyNoStoreHeaders(
          NextResponse.json({ matched: false }, { status: 200 })
        );
      }

      clearMerchantRuntimeCache(session.merchantId);
      const nextSession =
        targetRole === "merchant"
          ? createExclusiveMerchantSession(lookup.userRow.id)
          : targetRole === "rider"
          ? createExclusiveRiderSession(lookup.userRow.id)
          : createExclusiveBuyerSession(lookup.userRow.id);

      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        matched: true,
        buyer: state.buyer,
        merchant: state.merchant,
        rider: state.rider,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_login") {
      const result = await db.loginRider(
        String(identifier || phone || ""),
        String(password || body.pin || body.secret || "")
      );
      if (!result.ok || !result.rider) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 401 })
        );
      }
      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveRiderSession(result.rider.id);
      const res = NextResponse.json({
        rider: result.rider,
        buyer: createEmptyBuyer(),
        merchant: null,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_onboarding" || action === "rider_verify") {
      const normalizedPhone = normalizeBolivianPhone(String(phone || ""));
      if (!normalizedPhone) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Ingresa un número de WhatsApp de Bolivia válido (8 dígitos, ej. 76543210).",
            },
            { status: 400 }
          )
        );
      }
      const resolvedVehicle: RiderVehicleType =
        vehicleType === "moto_electrica" ? "moto_electrica" : "bicicleta";
      const resolvedCiPhoto = String(ciPhotoUrl || ci_photo_url || "");
      const result = await db.registerOrUpdateRider({
        name: String(name || ""),
        phone: normalizedPhone,
        vehicleType: resolvedVehicle,
        address: String(address || ""),
        ciNumber: String(ciNumber || ""),
        password: String(password || body.pin || ""),
        selfieUrl: String(selfieUrl || ""),
        ciPhotoUrl: resolvedCiPhoto,
        pollarUserId: resolvedPollarUserId,
        stellarAddress: resolvedStellarAddress,
      });
      if (!result.ok || !result.rider) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }
      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveRiderSession(result.rider.id);
      const state = await db.getSessionUsers(nextSession);
      const res = NextResponse.json({
        rider: result.rider,
        buyer: state.buyer,
        merchant: state.merchant,
        activeBuyerType: state.activeBuyerType,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "upgrade_prosumer") {
      if (!session.buyerId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "Debes iniciar sesión como vecino para activar el Club Vecino." },
            { status: session.merchantId || session.riderId ? 403 : 401 }
          )
        );
      }
      const result = await db.upgradeBuyerProsumer(session);
      if (!result.ok) {
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }
      const state = await db.getSessionUsers(session);
      return applyNoStoreHeaders(
        NextResponse.json({
          buyer: result.buyer,
          merchant: state.merchant,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    if (action === "referral_reward") {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Los bonos de referido solo se acreditan automáticamente cuando un usuario nuevo real se registra usando tu código de referido.",
          },
          { status: 400 }
        )
      );
    }

    if (action === "set_buyer_type") {
      const nextType: "buyer" | "merchant" =
        buyerType === "merchant" ? "merchant" : "buyer";
      if (nextType === "merchant" && !session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "Solo una caserita autenticada puede cambiar al modo comerciante." },
            { status: 403 }
          )
        );
      }
      const nextSession =
        nextType === "merchant" && session.merchantId
          ? createExclusiveMerchantSession(session.merchantId)
          : session.buyerId
          ? createExclusiveBuyerSession(session.buyerId)
          : createEmptySession();
      const state = await db.getSessionUsers(nextSession);
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
        return applyNoStoreHeaders(
          NextResponse.json({ error: result.error }, { status: 400 })
        );
      }

      const state = await db.getSessionUsers(session);
      return applyNoStoreHeaders(
        NextResponse.json({
          buyer: state.buyer,
          merchant: state.merchant,
          rider: state.rider,
          activeBuyerType: state.activeBuyerType,
        })
      );
    }

    return applyNoStoreHeaders(
      NextResponse.json({ error: "Acción no válida." }, { status: 400 })
    );
  } catch (err) {
    console.error(
      "[EcoBanco Users API][POST]",
      err instanceof Error ? err.message : "unknown_error"
    );
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "Error procesando la solicitud." },
        { status: 500 }
      )
    );
  }
}
