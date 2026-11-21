import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";
import { sanitizeUserError } from "@/app/lib/friendlyCopy";

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
      quantity,
      specialNotes,
    } = body;

    if (action === "release") {
      const releaseResult = await db.releaseEscrow(session, {
        deliveryId: deliveryId ? String(deliveryId) : undefined,
        orderId: orderId ? String(orderId) : undefined,
        deliveryPin: String(deliveryPin || ""),
      });

      if (!releaseResult.ok) {
        console.error("[EcoBanco Escrow Audit][RELEASE_ERROR]", {
          orderId: orderId ?? null,
          deliveryId: deliveryId ?? null,
          error: releaseResult.error,
        });
        const statusCode = releaseResult.error?.includes("rider_verified")
          ? 403
          : 400;
        return NextResponse.json(
          { error: sanitizeUserError(releaseResult.error) },
          { status: statusCode }
        );
      }

      console.info("[EcoBanco Escrow Audit][RELEASE_OK]", {
        orderId: releaseResult.order?.id ?? orderId ?? null,
        deliveryId: releaseResult.delivery?.id ?? deliveryId ?? null,
        contractId:
          releaseResult.order?.contract_id ??
          releaseResult.delivery?.contract_id ??
          null,
        engagementId:
          releaseResult.order?.engagement_id ??
          releaseResult.delivery?.engagement_id ??
          null,
        fundTxHash:
          releaseResult.order?.fund_tx_hash ??
          releaseResult.delivery?.fund_tx_hash ??
          null,
        releaseTxHash:
          releaseResult.order?.release_tx_hash ??
          releaseResult.delivery?.release_tx_hash ??
          null,
      });

      const state = await db.getState(session);
      return NextResponse.json(
        {
          message:
            "Pago Protegido entregado con éxito. Fondos acreditados a la caserita y tarifa acreditada al repartidor.",
          delivery: releaseResult.delivery,
          order: releaseResult.order,
          rider: releaseResult.rider,
          buyer: state.buyer,
          merchant: state.merchant,
        },
        { status: 200 }
      );
    }

    const products = await db.getProducts({ includeClosed: true });
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
      preSignedDeployXdr ? String(preSignedDeployXdr) : null,
      {
        quantity: quantity !== undefined ? Number(quantity) : 1,
        specialNotes: specialNotes ? String(specialNotes) : undefined,
      }
    );
    const state = await db.getState(session);

    if (!result.ok) {
      console.error("[EcoBanco Escrow Audit][DEPLOY_ERROR]", {
        productId: product.id,
        buyerType: resolvedBuyerType,
        error: result.error,
      });
      return NextResponse.json(
        {
          error: sanitizeUserError(result.error),
          buyer: state.buyer,
          merchant: state.merchant,
        },
        { status: 400 }
      );
    }

    console.info("[EcoBanco Escrow Audit][DEPLOY_FUND_OK]", {
      orderId: result.order?.id ?? null,
      deliveryId: result.delivery?.id ?? null,
      contractId:
        result.order?.contract_id ?? result.receipt?.contractId ?? null,
      engagementId:
        result.order?.engagement_id ?? result.receipt?.engagementId ?? null,
      fundTxHash:
        result.order?.fund_tx_hash ?? result.receipt?.fundTxHash ?? null,
    });

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
  } catch (err) {
    console.error("[EcoBanco Escrow Audit][UNHANDLED_ERROR]", err);
    return NextResponse.json(
      { error: sanitizeUserError(err) },
      { status: 500 }
    );
  }
}
