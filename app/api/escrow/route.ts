import { NextRequest, NextResponse } from "next/server";
import { applyNoStoreHeaders, readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";
import { sanitizeUserError } from "@/app/lib/friendlyCopy";
import {
  notifyEscrowReleased,
  notifyOrderCreated,
} from "@/app/lib/whatsappBridge";

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
      if (!session.buyerId && !session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Solo el comprador dueño del pedido puede liberar el Pago Protegido desde aquí.",
            },
            { status: session.riderId ? 403 : 401 }
          )
        );
      }

      const releaseResult = await db.releaseEscrowByBuyer(session, {
        deliveryId: deliveryId ? String(deliveryId) : undefined,
        orderId: orderId ? String(orderId) : undefined,
        deliveryPin: deliveryPin ? String(deliveryPin) : undefined,
      });

      if (!releaseResult.ok) {
        console.error("[EcoBanco Escrow Audit][RELEASE_ERROR]", {
          orderId: orderId ?? null,
          deliveryId: deliveryId ?? null,
          error: releaseResult.error,
        });
        const statusCode = releaseResult.forbidden ? 403 : 400;
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: sanitizeUserError(releaseResult.error) },
            { status: statusCode }
          )
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

      if (releaseResult.order || releaseResult.delivery) {
        const ord = releaseResult.order;
        const del = releaseResult.delivery;
        const buyerProfile = session.merchantId
          ? state.merchant
          : state.buyer;
        void notifyEscrowReleased({
          orderId: ord?.id || del?.order_id || String(orderId || ""),
          shortCode: ord?.short_code ?? del?.short_code ?? null,
          productName:
            ord?.product_name || del?.product_name || "Pedido comunitario",
          amountBs: Number(ord?.amount_motes ?? del?.amount_motes ?? 0),
          sellerId: ord?.seller_id ?? del?.seller_id ?? null,
          sellerPhone: del?.seller_phone ?? null,
          buyerId: ord?.buyer_id ?? del?.buyer_id ?? null,
          buyerPhone: buyerProfile?.phone ?? null,
          riderId: del?.rider_id ?? releaseResult.rider?.id ?? null,
          riderPhone:
            del?.rider_phone ?? releaseResult.rider?.phone ?? null,
          deliveryFeeBs: Number(del?.delivery_fee_motes ?? 5),
        }).catch(() => undefined);
      }

      return applyNoStoreHeaders(
        NextResponse.json(
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
        )
      );
    }

    const resolvedBuyerType: "buyer" | "merchant" =
      buyerType === "merchant" ? "merchant" : "buyer";

    if (resolvedBuyerType === "merchant" && !session.merchantId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "Debes iniciar sesión como caserita para usar tu saldo de puesto." },
          { status: session.buyerId || session.riderId ? 403 : 401 }
        )
      );
    }
    if (resolvedBuyerType === "buyer" && !session.buyerId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "Completa tus datos de entrega antes de confirmar tu pedido." },
          { status: session.merchantId || session.riderId ? 403 : 401 }
        )
      );
    }

    const products = await db.getProducts({ includeClosed: true });
    const product = products.find((p) => p.id === productId);
    if (!product) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "El producto seleccionado no existe." },
          { status: 404 }
        )
      );
    }

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
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error: sanitizeUserError(result.error),
            buyer: state.buyer,
            merchant: state.merchant,
          },
          { status: 400 }
        )
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

    const rawPickupPin = result.delivery?.pickup_pin ?? null;
    const rawDeliveryPin = result.delivery?.delivery_pin ?? null;
    const buyerProfile =
      resolvedBuyerType === "merchant" ? state.merchant : state.buyer;

    if (result.order) {
      void notifyOrderCreated({
        orderId: result.order.id,
        shortCode: result.order.short_code ?? result.delivery?.short_code ?? null,
        productName: result.order.product_name,
        amountBs: Number(result.order.amount_motes ?? 0),
        sellerId: result.order.seller_id,
        sellerName: result.order.seller_name,
        sellerPhone: result.delivery?.seller_phone ?? product.sellerPhone ?? null,
        buyerId: result.order.buyer_id,
        buyerName:
          result.delivery?.buyer_name ||
          buyerProfile?.storeName ||
          buyerProfile?.name ||
          "Vecino",
        buyerPhone: buyerProfile?.phone ?? null,
        deliveryAddress: result.delivery?.delivery_address ?? null,
        pickupPin: rawPickupPin,
        deliveryPin: rawDeliveryPin,
      }).catch(() => undefined);
    }

    // Redactar el PIN secreto de recojo (solo para la caserita) de la respuesta del comprador
    const safeReceipt = result.receipt
      ? { ...result.receipt, pickupPin: undefined }
      : undefined;
    const safeDelivery = result.delivery
      ? { ...result.delivery, pickup_pin: "" }
      : undefined;

    return applyNoStoreHeaders(
      NextResponse.json(
        {
          receipt: safeReceipt,
          order: result.order,
          delivery: safeDelivery,
          buyer: state.buyer,
          merchant: state.merchant,
        },
        { status: 201 }
      )
    );
  } catch (err) {
    console.error("[EcoBanco Escrow Audit][UNHANDLED_ERROR]", err);
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: sanitizeUserError(err) },
        { status: 500 }
      )
    );
  }
}
