import { NextRequest, NextResponse } from "next/server";
import { applySessionCookie, readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";
import { RiderVehicleType } from "@/app/types/ecobanco";

export async function GET(request: NextRequest) {
  try {
    const session = readSession(request);
    const state = await db.getDeliveriesState(session);
    return NextResponse.json({
      rider: state.rider,
      deliveries: state.deliveries,
      orders: state.orders,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron cargar los envíos desde Supabase." },
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
      phone,
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

    if (action === "rider_onboarding") {
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
        return NextResponse.json({ error: result.error }, { status: 400 });
      }

      const nextSession = { ...session, riderId: result.rider.id };
      const state = await db.getDeliveriesState(nextSession);
      const res = NextResponse.json({
        message:
          "¡Ficha de Confianza verificada! Tu código único EcoDohmi y tus billeteras MOTES y FIAT/USDC ya están activos.",
        rider: result.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "rider_logout") {
      const nextSession = { ...session };
      delete nextSession.riderId;
      const state = await db.getDeliveriesState(nextSession);
      const res = NextResponse.json({
        rider: state.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
      return applySessionCookie(res, nextSession);
    }

    if (action === "accept_delivery") {
      const result = await db.acceptDelivery(session, String(deliveryId || ""));
      if (!result.ok) {
        const statusCode = result.error?.includes("rider_verified") ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status: statusCode });
      }

      const state = await db.getDeliveriesState(session);
      return NextResponse.json({
        message:
          "Pedido asignado. Dirígete al puesto de la caserita y valida el PIN de recojo.",
        delivery: result.delivery,
        rider: state.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
    }

    if (action === "validate_pickup") {
      const result = await db.validatePickupPin(
        session,
        String(deliveryId || ""),
        String(pin || "")
      );
      if (!result.ok) {
        const statusCode = result.error?.includes("rider_verified") ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status: statusCode });
      }

      const state = await db.getDeliveriesState(session);
      return NextResponse.json({
        message:
          "¡Recojo validado! El pedido ahora está En Tránsito hacia el vecino.",
        delivery: result.delivery,
        rider: state.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
    }

    if (action === "validate_delivery") {
      const result = await db.validateDeliveryPin(
        session,
        String(deliveryId || ""),
        String(pin || "")
      );
      if (!result.ok) {
        const statusCode = result.error?.includes("rider_verified") ? 403 : 400;
        return NextResponse.json({ error: result.error }, { status: statusCode });
      }

      const state = await db.getDeliveriesState(session);
      return NextResponse.json({
        message:
          "¡Entrega confirmada! Escrow liberado a la caserita y tarifa acreditada a tu billetera EcoDohmi.",
        delivery: result.delivery,
        order: result.order,
        rider: state.rider,
        deliveries: state.deliveries,
        orders: state.orders,
      });
    }

    return NextResponse.json({ error: "Acción no válida." }, { status: 400 });
  } catch {
    return NextResponse.json(
      { error: "Error procesando la operación de EcoDohmi." },
      { status: 500 }
    );
  }
}
