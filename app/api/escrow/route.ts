import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    const body = await request.json();
    const {
      action,
      productId,
      buyerType,
      paymentMethod,
      deliveryId,
      orderId,
      deliveryPin,
      preSignedDeployXdr,
    } = body;

    if (action === "release") {
      const releaseResult = await db.releaseEscrow(session, {
        deliveryId: deliveryId ? String(deliveryId) : undefined,
        orderId: orderId ? String(orderId) : undefined,
        deliveryPin: String(deliveryPin || ""),
      });

      if (!releaseResult.ok) {
        const statusCode = releaseResult.error?.includes("rider_verified")
          ? 403
          : 400;
        return NextResponse.json(
          { error: releaseResult.error },
          { status: statusCode }
        );
      }

      const state = await db.getState(session);
      return NextResponse.json(
        {
          message:
            "Escrow liberado con éxito. Fondos acreditados a la caserita y tarifa acreditada al repartidor EcoDohmi.",
          delivery: releaseResult.delivery,
          order: releaseResult.order,
          rider: releaseResult.rider,
          buyer: state.buyer,
          merchant: state.merchant,
        },
        { status: 200 }
      );
    }

    const products = await db.getProducts();
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return NextResponse.json(
        { error: "El producto seleccionado no existe." },
        { status: 404 }
      );
    }

    const resolvedBuyerType: "buyer" | "merchant" =
      buyerType === "merchant" ? "merchant" : "buyer";
    const resolvedMethod: "fiat" | "motes" | undefined =
      paymentMethod === "fiat" || paymentMethod === "motes"
        ? paymentMethod
        : undefined;

    const result = await db.executeEscrow(
      session,
      product.id,
      resolvedBuyerType,
      resolvedMethod,
      preSignedDeployXdr ? String(preSignedDeployXdr) : null
    );
    const state = await db.getState(session);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: result.error,
          buyer: state.buyer,
          merchant: state.merchant,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        receipt: result.receipt,
        order: result.order,
        delivery: result.delivery,
        buyer: state.buyer,
        merchant: state.merchant,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo procesar la operación de Escrow." },
      { status: 500 }
    );
  }
}
