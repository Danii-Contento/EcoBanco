import { formatBs, formatOrderCode } from "./friendlyCopy";
import { toWhatsAppDigits } from "./phone";
import { supabaseTables } from "./supabase";

export interface WhatsAppSendResult {
  ok: boolean;
  mode: "dry-run" | "live" | "skipped";
  error?: string;
}

/**
 * Indica si las credenciales reales de WhatsApp Cloud API (Meta) están configuradas.
 * Si falta token o ID de número, el puente opera en modo `dry-run` sin bloquear flujos.
 */
export function isWhatsAppCloudConfigured(): boolean {
  const token = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  return Boolean(token && phoneNumberId);
}

/**
 * Resuelve el número WhatsApp de un usuario respetando su preferencia `whatsapp_opt_in`.
 */
export async function resolveUserWhatsAppPhone(
  userId?: string | null,
  fallbackPhone?: string | null
): Promise<string | null> {
  if (userId) {
    try {
      const user = await supabaseTables.getUserById(userId);
      if (user) {
        if (user.whatsapp_opt_in === false) {
          return null;
        }
        const preferred = user.phone_whatsapp || user.phone || fallbackPhone;
        return preferred ? preferred.trim() : null;
      }
    } catch {
      // Si Supabase falla temporalmente, continuamos con el teléfono de respaldo
    }
  }
  return fallbackPhone ? fallbackPhone.trim() : null;
}

/**
 * Envía un mensaje de texto por WhatsApp Cloud API sin lanzar excepciones ni bloquear la app.
 * En desarrollo o sin credenciales de Meta, registra la salida simulada (`dry-run`).
 */
export async function sendWhatsAppText(params: {
  to?: string | null;
  body: string;
  eventType: string;
  metadata?: Record<string, unknown>;
}): Promise<WhatsAppSendResult> {
  const cleanDigits = toWhatsAppDigits(params.to);
  if (!cleanDigits) {
    return {
      ok: false,
      mode: "skipped",
      error: "Número de WhatsApp no disponible o inválido.",
    };
  }

  if (!isWhatsAppCloudConfigured()) {
    console.info("[EcoBanco WhatsApp Bridge][DRY_RUN]", {
      eventType: params.eventType,
      to: cleanDigits,
      preview: params.body.slice(0, 140),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
    return {
      ok: true,
      mode: "dry-run",
    };
  }

  const token = (process.env.WHATSAPP_ACCESS_TOKEN || "").trim();
  const phoneNumberId = (process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim();
  const apiVersion = (process.env.WHATSAPP_API_VERSION || "v21.0").trim();
  const endpoint = `https://graph.facebook.com/${encodeURIComponent(
    apiVersion
  )}/${encodeURIComponent(phoneNumberId)}/messages`;

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: cleanDigits,
        type: "text",
        text: {
          preview_url: false,
          body: params.body,
        },
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.error("[EcoBanco WhatsApp Bridge][ERROR]", {
        eventType: params.eventType,
        to: cleanDigits,
        status: response.status,
        detail: errBody.slice(0, 200),
      });
      return {
        ok: false,
        mode: "live",
        error: `WhatsApp API HTTP ${response.status}`,
      };
    }

    console.info("[EcoBanco WhatsApp Bridge][SENT]", {
      eventType: params.eventType,
      to: cleanDigits,
    });
    return {
      ok: true,
      mode: "live",
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Error de red enviando WhatsApp.";
    console.error("[EcoBanco WhatsApp Bridge][ERROR]", {
      eventType: params.eventType,
      to: cleanDigits,
      error: message,
    });
    return {
      ok: false,
      mode: "live",
      error: message,
    };
  }
}

export async function notifyOrderCreated(params: {
  orderId: string;
  shortCode?: string | null;
  productName: string;
  amountBs: number;
  sellerId?: string | null;
  sellerName: string;
  sellerPhone?: string | null;
  buyerId?: string | null;
  buyerName: string;
  buyerPhone?: string | null;
  deliveryAddress?: string | null;
  pickupPin?: string | null;
  deliveryPin?: string | null;
}): Promise<void> {
  const code = params.shortCode || formatOrderCode(params.orderId);
  const priceText = formatBs(params.amountBs);

  const [sellerPhone, buyerPhone] = await Promise.all([
    resolveUserWhatsAppPhone(params.sellerId, params.sellerPhone),
    resolveUserWhatsAppPhone(params.buyerId, params.buyerPhone),
  ]);

  const tasks: Promise<WhatsAppSendResult>[] = [];

  if (sellerPhone) {
    const pickupLine = params.pickupPin
      ? `\n🔑 Código secreto de recojo (solo para darle al repartidor): ${params.pickupPin}`
      : "";
    tasks.push(
      sendWhatsAppText({
        to: sellerPhone,
        eventType: "order.created.caserita",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `¡Hola caserita ${params.sellerName}! 🌿 Tienes un nuevo pedido ${code}.\n` +
          `📦 ${params.productName} — ${priceText} (ya asegurado con Pago Protegido).\n` +
          `👤 Vecino: ${params.buyerName}${
            params.deliveryAddress ? ` (${params.deliveryAddress})` : ""
          }` +
          pickupLine +
          `\n\nCuando termines de alistarlo, responde aquí: LISTO ${code}`,
      })
    );
  }

  if (buyerPhone) {
    const deliveryLine = params.deliveryPin
      ? `\n🔐 Tu código de entrega es ${params.deliveryPin} — entrégalo al repartidor recién cuando recibas tu pedido.`
      : "";
    tasks.push(
      sendWhatsAppText({
        to: buyerPhone,
        eventType: "order.created.vecino",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `¡Listo vecino ${params.buyerName}! 🛡️ Tu pedido ${code} (${params.productName}) con ${params.sellerName} quedó guardado con Pago Protegido (${priceText}).\n` +
          `Tu dinero está seguro en EcoBanco hasta que recibas tu compra.` +
          deliveryLine,
      })
    );
  }

  await Promise.allSettled(tasks);
}

export async function notifyDeliveryAccepted(params: {
  orderId: string;
  shortCode?: string | null;
  productName: string;
  sellerId?: string | null;
  sellerPhone?: string | null;
  buyerId?: string | null;
  buyerPhone?: string | null;
  riderName: string;
  vehicleType?: string | null;
}): Promise<void> {
  const code = params.shortCode || formatOrderCode(params.orderId);
  const [sellerPhone, buyerPhone] = await Promise.all([
    resolveUserWhatsAppPhone(params.sellerId, params.sellerPhone),
    resolveUserWhatsAppPhone(params.buyerId, params.buyerPhone),
  ]);

  const tasks: Promise<WhatsAppSendResult>[] = [];
  const vehicle = params.vehicleType ? ` en ${params.vehicleType}` : "";

  if (sellerPhone) {
    tasks.push(
      sendWhatsAppText({
        to: sellerPhone,
        eventType: "delivery.accepted.caserita",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `🚲 ¡Buenas noticias caserita! El Eco-Rider ${params.riderName}${vehicle} aceptó el pedido ${code} (${params.productName}) y ya va en camino a recogerlo de tu puesto.`,
      })
    );
  }

  if (buyerPhone) {
    tasks.push(
      sendWhatsAppText({
        to: buyerPhone,
        eventType: "delivery.accepted.vecino",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `🚲 ¡Tu Eco-Rider ${params.riderName} ya tomó el pedido ${code} (${params.productName})! Ahora va hacia el puesto de la caserita para recogerlo.`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

export async function notifyDeliveryPickedUp(params: {
  orderId: string;
  shortCode?: string | null;
  productName: string;
  buyerId?: string | null;
  buyerPhone?: string | null;
  riderName: string;
  deliveryPin?: string | null;
}): Promise<void> {
  const code = params.shortCode || formatOrderCode(params.orderId);
  const buyerPhone = await resolveUserWhatsAppPhone(
    params.buyerId,
    params.buyerPhone
  );
  if (!buyerPhone) return;

  const pinText = params.deliveryPin
    ? `\n🔐 Recuerda darle el código de entrega ${params.deliveryPin} cuando tengas tu pedido en manos.`
    : "";

  await sendWhatsAppText({
    to: buyerPhone,
    eventType: "delivery.picked_up.vecino",
    metadata: { orderId: params.orderId, shortCode: code },
    body:
      `📦 ¡En camino! El Eco-Rider ${params.riderName} ya recogió tu pedido ${code} (${params.productName}) y se dirige hacia tu dirección.` +
      pinText,
  });
}

export async function notifyEscrowReleased(params: {
  orderId: string;
  shortCode?: string | null;
  productName: string;
  amountBs: number;
  sellerId?: string | null;
  sellerPhone?: string | null;
  buyerId?: string | null;
  buyerPhone?: string | null;
  riderId?: string | null;
  riderPhone?: string | null;
  deliveryFeeBs?: number;
}): Promise<void> {
  const code = params.shortCode || formatOrderCode(params.orderId);
  const [sellerPhone, buyerPhone, riderPhone] = await Promise.all([
    resolveUserWhatsAppPhone(params.sellerId, params.sellerPhone),
    resolveUserWhatsAppPhone(params.buyerId, params.buyerPhone),
    resolveUserWhatsAppPhone(params.riderId, params.riderPhone),
  ]);

  const tasks: Promise<WhatsAppSendResult>[] = [];

  if (sellerPhone) {
    tasks.push(
      sendWhatsAppText({
        to: sellerPhone,
        eventType: "escrow.released.caserita",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `✅ ¡Venta completada caserita! El pedido ${code} (${params.productName}) fue entregado.\n` +
          `💰 Se acreditaron ${formatBs(params.amountBs)} en tu Libreta Comunitaria EcoBanco.`,
      })
    );
  }

  if (buyerPhone) {
    tasks.push(
      sendWhatsAppText({
        to: buyerPhone,
        eventType: "escrow.released.vecino",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `🎉 ¡Gracias por tu compra comunitaria! Se confirmó la entrega de ${code} (${params.productName}) y tu Pago Protegido de ${formatBs(params.amountBs)} pasó completo a la caserita.`,
      })
    );
  }

  if (riderPhone) {
    const feeText = formatBs(params.deliveryFeeBs ?? 5);
    tasks.push(
      sendWhatsAppText({
        to: riderPhone,
        eventType: "escrow.released.rider",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `🚲 ¡Entrega ${code} completada! Se acreditaron ${feeText} en tu libreta EcoBanco por este envío. ¡Buen viaje!`,
      })
    );
  }

  await Promise.allSettled(tasks);
}

export async function notifyProductPublished(params: {
  event: "created" | "updated";
  sellerId?: string | null;
  sellerName: string;
  sellerPhone?: string | null;
  productName: string;
  priceBs: number;
}): Promise<void> {
  const sellerPhone = await resolveUserWhatsAppPhone(
    params.sellerId,
    params.sellerPhone
  );
  if (!sellerPhone) return;

  const actionWord =
    params.event === "updated" ? "actualizó" : "publicó";

  await sendWhatsAppText({
    to: sellerPhone,
    eventType: `product.${params.event}.caserita`,
    metadata: { productName: params.productName, priceBs: params.priceBs },
    body:
      `🛍️ ¡Tu puesto ${params.sellerName} ${actionWord} "${params.productName}" a ${formatBs(params.priceBs)} en el Mercado Comunitario EcoBanco!\n` +
      `Los vecinos del barrio ya pueden pedirlo con Pago Protegido.`,
  });
}

export async function notifyOrderReadyForPickup(params: {
  orderId: string;
  shortCode?: string | null;
  productName: string;
  sellerName: string;
  buyerId?: string | null;
  buyerPhone?: string | null;
  riderId?: string | null;
  riderPhone?: string | null;
}): Promise<void> {
  const code = params.shortCode || formatOrderCode(params.orderId);
  const [riderPhone, buyerPhone] = await Promise.all([
    resolveUserWhatsAppPhone(params.riderId, params.riderPhone),
    resolveUserWhatsAppPhone(params.buyerId, params.buyerPhone),
  ]);

  const tasks: Promise<WhatsAppSendResult>[] = [];

  if (riderPhone) {
    tasks.push(
      sendWhatsAppText({
        to: riderPhone,
        eventType: "order.ready.rider",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `📦 ¡Pedido listo! La caserita ${params.sellerName} ya tiene preparado ${code} (${params.productName}). Pasa por el puesto a recogerlo.`,
      })
    );
  }

  if (buyerPhone) {
    tasks.push(
      sendWhatsAppText({
        to: buyerPhone,
        eventType: "order.ready.vecino",
        metadata: { orderId: params.orderId, shortCode: code },
        body:
          `🌿 ¡Tu pedido ${code} (${params.productName}) ya está listo en el puesto de ${params.sellerName} esperando al repartidor!`,
      })
    );
  }

  await Promise.allSettled(tasks);
}
