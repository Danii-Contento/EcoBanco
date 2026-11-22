import { NextRequest, NextResponse } from "next/server";
import {
  applyNoStoreHeaders,
  applySessionCookie,
  createEmptySession,
  createExclusiveRiderSession,
  normalizeBolivianPhone,
  readSession,
} from "@/app/lib/session";
import { clearMerchantRuntimeCache, db } from "@/app/lib/store";
import { sanitizeUserError } from "@/app/lib/friendlyCopy";
import { RiderVehicleType } from "@/app/types/ecobanco";

export async function GET(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.riderId && !session.merchantId) {
      const status = session.buyerId ? 403 : 401;
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Debes iniciar sesión para acceder a los pedidos y entregas.",
            rider: null,
            deliveries: [],
            orders: [],
          },
          { status }
        )
      );
    }

    const state = await db.getDeliveriesState(session);
    if (!state.authorized) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Debes iniciar sesión para acceder a los pedidos y entregas.",
            rider: null,
            deliveries: [],
            orders: [],
          },
          { status: 401 }
        )
      );
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        rider: state.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      })
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "No se pudieron cargar los envíos en este momento." },
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
      identifier,
      name,
      phone,
      password,
      vehicleType,
      address,
      ciNumber,
      selfieUrl,
      ciPhotoUrl,
      ci_photo_url,
      deliveryId,
      pin,
      pollar_user_id,
      pollarUserId,
      stellar_address,
      stellarAddress,
    } = body;

    if (action === "rider_login") {
      const result = await db.loginRider(
        String(identifier || phone || ""),
        String(password || pin || body.secret || "")
      );
      if (!result.ok || !result.rider) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(result.error) },
            { status: 401 }
          )
        );
      }
      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveRiderSession(result.rider.id);
      const state = await db.getDeliveriesState(nextSession);
      const res = NextResponse.json({
        rider: result.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_onboarding") {
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
        password: String(password || pin || ""),
        selfieUrl: String(selfieUrl || ""),
        ciPhotoUrl: resolvedCiPhoto,
        pollarUserId:
          pollar_user_id !== undefined
            ? String(pollar_user_id || "")
            : pollarUserId !== undefined
            ? String(pollarUserId || "")
            : undefined,
        stellarAddress:
          stellar_address !== undefined
            ? String(stellar_address || "")
            : stellarAddress !== undefined
            ? String(stellarAddress || "")
            : undefined,
      });

      if (!result.ok || !result.rider) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(result.error) },
            { status: 400 }
          )
        );
      }

      clearMerchantRuntimeCache(session.merchantId);
      const nextSession = createExclusiveRiderSession(result.rider.id);
      const state = await db.getDeliveriesState(nextSession);
      const res = NextResponse.json({
        message:
          "¡Ficha de Confianza verificada! Tu credencial oficial de repartidor ya está activa.",
        rider: result.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_logout") {
      clearMerchantRuntimeCache(session.merchantId);
      const res = NextResponse.json({
        rider: null,
        deliveries: [],
        orders: [],
      });
      return applySessionCookie(res, createEmptySession());
    }

    if (action === "accept_delivery") {
      if (!session.riderId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como repartidor para tomar pedidos.",
            },
            { status: session.buyerId || session.merchantId ? 403 : 401 }
          )
        );
      }
      const result = await db.acceptDelivery(session, String(deliveryId || ""));
      if (!result.ok) {
        const statusCode = result.conflict
          ? 409
          : result.forbidden
          ? 403
          : 400;
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(result.error) },
            { status: statusCode }
          )
        );
      }

      const state = await db.getDeliveriesState(session);

      return applyNoStoreHeaders(
        NextResponse.json({
          message:
            "Pedido asignado. Dirígete al puesto de la caserita y pídele el código de 4 números.",
          delivery: result.delivery,
          rider: state.rider,
          deliveries: state.deliveries,
          orders: state.orders,
        })
      );
    }

    if (action === "validate_pickup") {
      if (!session.riderId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como repartidor para validar recojos.",
            },
            { status: session.buyerId || session.merchantId ? 403 : 401 }
          )
        );
      }
      const result = await db.validatePickupPin(
        session,
        String(deliveryId || ""),
        String(pin || "")
      );
      if (!result.ok) {
        const statusCode = result.conflict
          ? 409
          : result.forbidden
          ? 403
          : 400;
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(result.error) },
            { status: statusCode }
          )
        );
      }

      const state = await db.getDeliveriesState(session);

      return applyNoStoreHeaders(
        NextResponse.json({
          message:
            "¡Recojo validado! El pedido ahora está en camino hacia el vecino.",
          delivery: result.delivery,
          rider: state.rider,
          deliveries: state.deliveries,
          orders: state.orders,
        })
      );
    }

    if (action === "validate_delivery") {
      if (!session.riderId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como repartidor para confirmar entregas.",
            },
            { status: session.buyerId || session.merchantId ? 403 : 401 }
          )
        );
      }
      const result = await db.validateDeliveryPin(
        session,
        String(deliveryId || ""),
        String(pin || "")
      );
      if (!result.ok) {
        const statusCode = result.forbidden ? 403 : 400;
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(result.error) },
            { status: statusCode }
          )
        );
      }

      const state = await db.getDeliveriesState(session);
      console.info("[EcoBanco Escrow Audit][RIDER_RELEASE_OK]", {
        orderId: result.order?.id ?? result.delivery?.order_id ?? null,
        deliveryId: result.delivery?.id ?? deliveryId ?? null,
        contractId:
          result.order?.contract_id ?? result.delivery?.contract_id ?? null,
        releaseTxHash:
          result.order?.release_tx_hash ??
          result.delivery?.release_tx_hash ??
          null,
      });

      return applyNoStoreHeaders(
        NextResponse.json({
          message:
            "¡Entrega confirmada! El pago pasó a la caserita y tu ganancia ya está en tu libreta.",
          delivery: result.delivery,
          order: result.order,
          rider: state.rider,
          deliveries: state.deliveries,
          orders: state.orders,
        })
      );
    }

    return applyNoStoreHeaders(
      NextResponse.json({ error: "Acción no válida." }, { status: 400 })
    );
  } catch (err) {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: sanitizeUserError(err) },
        { status: 500 }
      )
    );
  }
}
