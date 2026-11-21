import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  formatBs,
  formatMotes,
  formatOrderCode,
  sanitizeUserError,
} from "@/app/lib/friendlyCopy";
import { areSameBolivianPhone, normalizeBolivianPhone } from "@/app/lib/phone";
import {
  applyNoStoreHeaders,
  createExclusiveBuyerSession,
  createExclusiveMerchantSession,
  createExclusiveRiderSession,
} from "@/app/lib/session";
import { db } from "@/app/lib/store";
import {
  isRiderUserRow,
  supabaseTables,
  SupabaseUserRow,
} from "@/app/lib/supabase";
import {
  notifyEscrowReleased,
  notifyOrderReadyForPickup,
  sendWhatsAppText,
} from "@/app/lib/whatsappBridge";
import { Delivery } from "@/app/types/ecobanco";

export const dynamic = "force-dynamic";

interface InboundWhatsAppMessage {
  from: string;
  text: string;
}

function constantTimeTokenMatch(expected: string, provided: string): boolean {
  const expectedDigest = crypto.createHash("sha256").update(expected).digest();
  const providedDigest = crypto.createHash("sha256").update(provided).digest();
  return crypto.timingSafeEqual(expectedDigest, providedDigest);
}

function verifyMetaSignature(
  rawBody: string,
  headerValue: string | null,
  appSecret: string
): boolean {
  if (!headerValue || !headerValue.startsWith("sha256=")) {
    return false;
  }
  const providedHex = headerValue.slice(7).trim();
  const expectedHex = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  const providedBuf = Buffer.from(providedHex, "utf8");
  const expectedBuf = Buffer.from(expectedHex, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}

function extractInboundMessages(payload: unknown): InboundWhatsAppMessage[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const messages: InboundWhatsAppMessage[] = [];

  // Formato directo para pruebas locales: { from: "+5917...", text: "SALDO" }
  if (
    typeof record.from === "string" &&
    (typeof record.text === "string" || typeof record.body === "string")
  ) {
    const text = String(record.text ?? record.body ?? "").trim();
    if (record.from.trim() && text) {
      messages.push({ from: record.from.trim(), text });
    }
    return messages;
  }

  // Formato oficial de Meta WhatsApp Cloud API Webhook
  const entries = Array.isArray(record.entry) ? record.entry : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const changes = Array.isArray((entry as Record<string, unknown>).changes)
      ? ((entry as Record<string, unknown>).changes as Array<unknown>)
      : [];
    for (const change of changes) {
      if (!change || typeof change !== "object") continue;
      const value = (change as Record<string, unknown>).value as
        | Record<string, unknown>
        | undefined;
      if (!value) continue;
      const rawMessages = Array.isArray(value.messages) ? value.messages : [];
      for (const msg of rawMessages) {
        if (!msg || typeof msg !== "object") continue;
        const msgObj = msg as Record<string, unknown>;
        const from = typeof msgObj.from === "string" ? msgObj.from.trim() : "";
        const type = typeof msgObj.type === "string" ? msgObj.type : "";
        const textObj =
          msgObj.text && typeof msgObj.text === "object"
            ? (msgObj.text as Record<string, unknown>)
            : null;
        const textBody =
          textObj && typeof textObj.body === "string"
            ? textObj.body.trim()
            : "";
        if (from && type === "text" && textBody) {
          messages.push({ from, text: textBody });
        }
      }
    }
  }

  return messages;
}

function normalizeShortCode(raw?: string | null): string {
  if (!raw) return "";
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.startsWith("ECO")) {
    return `#ECO-${cleaned.slice(3)}`;
  }
  return `#ECO-${cleaned}`;
}

function matchDeliveryByCode(
  deliveries: Delivery[],
  codeSuffix: string
): Delivery[] {
  const targetShort = normalizeShortCode(codeSuffix);
  const cleanDigits = codeSuffix.trim().toUpperCase();
  return deliveries.filter((d) => {
    const computed = normalizeShortCode(
      d.short_code || formatOrderCode(d.order_id)
    );
    return (
      computed === targetShort ||
      d.order_id.toUpperCase().endsWith(cleanDigits) ||
      d.id.toUpperCase().endsWith(cleanDigits)
    );
  });
}

function buildHelpReply(): string {
  return (
    "🌱 *EcoBanco Bolivia — Comandos por WhatsApp*\n\n" +
    "• *SALDO* — Consulta tus Bs y MOTES disponibles (1 MOTE = 1 Bs)\n" +
    "• *CATALOGO* — Mira productos frescos del barrio hoy\n" +
    "• *LISTO #ECO-XXXX* — Para caseritas: avisa que el pedido ya está listo para recojo\n" +
    "• *ENTREGADO #ECO-XXXX* — Para vecinos: confirma que recibiste tu pedido\n" +
    "• *ENTREGADO #ECO-XXXX PIN* — Para Eco-Riders: confirma entrega con código de 4 dígitos"
  );
}

async function handleInboundCommand(params: {
  from: string;
  text: string;
}): Promise<{
  to: string;
  command: string;
  reply: string;
  status: string;
}> {
  const normalizedPhone = normalizeBolivianPhone(params.from);
  const replyTarget = normalizedPhone || params.from;
  const cleanText = params.text.trim();
  const upperText = cleanText.toUpperCase();

  if (!normalizedPhone) {
    const reply =
      "Hola vecino 🌿 Para usar el asistente por WhatsApp, escríbenos desde un número celular boliviano de 8 dígitos (+591XXXXXXXX).";
    await sendWhatsAppText({
      to: replyTarget,
      body: reply,
      eventType: "whatsapp.inbound.invalid_phone",
    });
    return {
      to: replyTarget,
      command: "INVALID_PHONE",
      reply,
      status: "ignored_invalid_phone",
    };
  }

  const users = await supabaseTables.listUsers();
  const matchedUsers = users.filter((u) =>
    areSameBolivianPhone(u.phone_whatsapp || u.phone, normalizedPhone)
  );

  if (matchedUsers.length > 0) {
    const nowIso = new Date().toISOString();
    void Promise.allSettled(
      matchedUsers.map((u) =>
        supabaseTables.updateUser(u.id, {
          whatsapp_last_interaction_at: nowIso,
          ...(!u.phone_whatsapp ? { phone_whatsapp: normalizedPhone } : {}),
        })
      )
    ).catch(() => undefined);
  }

  // Comando SALDO
  if (/^SALDO\b/i.test(upperText)) {
    if (matchedUsers.length === 0) {
      const reply =
        "Aún no encontramos una Libreta EcoBanco asociada a este número 📱.\n" +
        "Regístrate en segundos desde la app EcoBanco con tu número para activar tu Libreta Comunitaria (1 MOTE = 1 Bs).";
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.saldo.unregistered",
      });
      return { to: normalizedPhone, command: "SALDO", reply, status: "unregistered" };
    }

    const lines = matchedUsers.map((u: SupabaseUserRow) => {
      const motes = Number(u.motes_balance ?? 0);
      const fiat = Number(u.fiat_balance_bs ?? 0);
      if (isRiderUserRow(u)) {
        return `• *Eco-Rider (${u.name})*: ${formatMotes(motes)} (${formatBs(motes)})`;
      }
      if (u.role === "merchant") {
        return `• *Caserita (${u.store_name || u.name})*: ${formatMotes(motes)} (${formatBs(motes)})`;
      }
      return `• *Vecino (${u.name})*: ${formatBs(fiat)} disponibles + ${formatMotes(motes)}`;
    });

    const reply =
      `📒 *Tu Libreta EcoBanco Bolivia*\n${lines.join("\n")}\n\n` +
      `Recuerda: *1 MOTE = 1 Bs* en todos los puestos del barrio.`;

    await sendWhatsAppText({
      to: normalizedPhone,
      body: reply,
      eventType: "whatsapp.cmd.saldo",
    });
    return { to: normalizedPhone, command: "SALDO", reply, status: "ok" };
  }

  // Comando CATALOGO / CATÁLOGO
  if (/^CAT[AÁ]LOGO\b/i.test(upperText)) {
    const products = await db.getProducts();
    const topProducts = products.slice(0, 6);
    if (topProducts.length === 0) {
      const reply =
        "Por el momento no hay puestos abiertos con productos cargados 🌿. Vuelve a intentar en unos minutos.";
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.catalogo.empty",
      });
      return { to: normalizedPhone, command: "CATALOGO", reply, status: "empty" };
    }

    const itemsText = topProducts
      .map(
        (p) =>
          `• *${p.name}* — ${formatBs(p.priceMotes)} (${p.sellerName || "Puesto del barrio"})`
      )
      .join("\n");

    const reply =
      `🛒 *Mercado Comunitario EcoBanco — Hoy en tu barrio:*\n${itemsText}\n\n` +
      `Compra con *Pago Protegido* desde tu celular: tu dinero queda seguro hasta que recibas tu pedido.`;

    await sendWhatsAppText({
      to: normalizedPhone,
      body: reply,
      eventType: "whatsapp.cmd.catalogo",
    });
    return { to: normalizedPhone, command: "CATALOGO", reply, status: "ok" };
  }

  // Comando LISTO #ECO-XXXX (solo Caserita dueña del pedido)
  const listoMatch = upperText.match(
    /^LISTO(?:\s+(?:#?ECO[-_\s]?)?([A-Z0-9]{4,}))?$/i
  );
  if (listoMatch) {
    const rawCode = listoMatch[1];
    if (!rawCode) {
      const reply =
        "Para avisar que tu pedido está listo, escribe el código completo, por ejemplo: *LISTO #ECO-1234*";
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.listo.usage",
      });
      return { to: normalizedPhone, command: "LISTO", reply, status: "missing_code" };
    }

    const merchantRow = matchedUsers.find(
      (u) => u.role === "merchant" && !isRiderUserRow(u)
    );
    if (!merchantRow) {
      const reply =
        "Este comando es solo para cuentas de caseritas con puesto registrado en EcoBanco.";
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.listo.forbidden",
      });
      return { to: normalizedPhone, command: "LISTO", reply, status: "forbidden" };
    }

    const [deliveries, orders] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
    ]);
    const matching = matchDeliveryByCode(deliveries, rawCode).find(
      (d) => d.seller_id === merchantRow.id
    );

    if (!matching) {
      const reply = `No encontramos ningún pedido ${normalizeShortCode(rawCode)} perteneciente a tu puesto.`;
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.listo.not_found",
      });
      return { to: normalizedPhone, command: "LISTO", reply, status: "not_found" };
    }

    const statusLower = (matching.delivery_status || "").toLowerCase();
    if (statusLower === "delivered") {
      const reply = `El pedido ${normalizeShortCode(rawCode)} ya fue entregado y cobrado ✅.`;
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.listo.already_delivered",
      });
      return { to: normalizedPhone, command: "LISTO", reply, status: "already_delivered" };
    }

    const nowIso = new Date().toISOString();
    const shortCode =
      matching.short_code || formatOrderCode(matching.order_id);
    const relatedOrder = orders.find((o) => o.id === matching.order_id);

    await Promise.all([
      supabaseTables.updateDelivery(matching.id, {
        short_code: shortCode,
        order_stage: "READY_FOR_PICKUP",
        ready_for_pickup_at: nowIso,
        whatsapp_notified_at: nowIso,
      }),
      supabaseTables.updateOrder(matching.order_id, {
        short_code: shortCode,
        order_stage: "READY_FOR_PICKUP",
      }),
    ]);

    void notifyOrderReadyForPickup({
      orderId: matching.order_id,
      shortCode,
      productName:
        relatedOrder?.product_name || matching.product_name || "Pedido comunitario",
      sellerName: merchantRow.store_name || merchantRow.name,
      buyerId: matching.buyer_id,
      riderId: matching.rider_id ?? null,
      riderPhone: matching.rider_phone ?? null,
    }).catch(() => undefined);

    const reply =
      `📦 ¡Listo caserita ${merchantRow.store_name || merchantRow.name}!\n` +
      `Marcamos el pedido *${shortCode}* como listo para recojo y avisamos al repartidor y al vecino.`;

    await sendWhatsAppText({
      to: normalizedPhone,
      body: reply,
      eventType: "whatsapp.cmd.listo.ok",
    });
    return { to: normalizedPhone, command: "LISTO", reply, status: "ok" };
  }

  // Comando ENTREGADO #ECO-XXXX [PIN]
  const entregadoMatch = upperText.match(
    /^ENTREGADO(?:\s+(?:#?ECO[-_\s]?)?([A-Z0-9]{4,}))?(?:\s+(\d{4}))?$/i
  );
  if (entregadoMatch) {
    const rawCode = entregadoMatch[1];
    const suppliedPin = entregadoMatch[2];
    if (!rawCode) {
      const reply =
        "Indica el código del pedido, por ejemplo: *ENTREGADO #ECO-1234* (si eres Eco-Rider añade tu PIN: *ENTREGADO #ECO-1234 5678*).";
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.entregado.usage",
      });
      return {
        to: normalizedPhone,
        command: "ENTREGADO",
        reply,
        status: "missing_code",
      };
    }

    const [deliveries, orders] = await Promise.all([
      supabaseTables.listDeliveries(),
      supabaseTables.listOrders(),
    ]);
    const candidates = matchDeliveryByCode(deliveries, rawCode);

    const riderMatch = suppliedPin
      ? candidates.find((d) =>
          matchedUsers.some(
            (u) =>
              isRiderUserRow(u) &&
              u.rider_verified === true &&
              d.rider_id === u.id
          )
        )
      : undefined;

    const buyerMatch = candidates.find((d) =>
      matchedUsers.some((u) => !isRiderUserRow(u) && d.buyer_id === u.id)
    );

    if (riderMatch && suppliedPin) {
      const riderUser = matchedUsers.find(
        (u) => isRiderUserRow(u) && u.id === riderMatch.rider_id
      )!;
      const releaseRes = await db.validateDeliveryPin(
        createExclusiveRiderSession(riderUser.id),
        riderMatch.id,
        suppliedPin
      );
      if (!releaseRes.ok) {
        const reply = sanitizeUserError(releaseRes.error);
        await sendWhatsAppText({
          to: normalizedPhone,
          body: reply,
          eventType: "whatsapp.cmd.entregado.rider_error",
        });
        return {
          to: normalizedPhone,
          command: "ENTREGADO",
          reply,
          status: "error",
        };
      }

      const ord = releaseRes.order;
      const del = releaseRes.delivery;
      void notifyEscrowReleased({
        orderId: ord?.id || del?.order_id || riderMatch.order_id,
        shortCode: ord?.short_code ?? del?.short_code ?? null,
        productName:
          ord?.product_name || del?.product_name || "Pedido comunitario",
        amountBs: Number(ord?.amount_motes ?? del?.amount_motes ?? 0),
        sellerId: ord?.seller_id ?? del?.seller_id ?? riderMatch.seller_id,
        sellerPhone: del?.seller_phone ?? riderMatch.seller_phone ?? null,
        buyerId: ord?.buyer_id ?? del?.buyer_id ?? riderMatch.buyer_id,
        riderId: riderUser.id,
        riderPhone: riderUser.phone,
        deliveryFeeBs: Number(del?.delivery_fee_motes ?? 5),
      }).catch(() => undefined);

      const reply = `✅ ¡Entrega confirmada ${normalizeShortCode(rawCode)}! Tu ganancia fue acreditada en tu libreta EcoBanco.`;
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.entregado.rider_ok",
      });
      return { to: normalizedPhone, command: "ENTREGADO", reply, status: "ok" };
    }

    if (buyerMatch) {
      const buyerUser = matchedUsers.find(
        (u) => !isRiderUserRow(u) && buyerMatch.buyer_id === u.id
      )!;
      const relatedOrder = orders.find((o) => o.id === buyerMatch.order_id);
      const session =
        buyerUser.role === "merchant"
          ? createExclusiveMerchantSession(buyerUser.id)
          : createExclusiveBuyerSession(buyerUser.id);

      const releaseRes = await db.releaseEscrowByBuyer(session, {
        orderId: relatedOrder?.id || buyerMatch.order_id,
        deliveryId: buyerMatch.id,
      });

      if (!releaseRes.ok) {
        const reply = sanitizeUserError(releaseRes.error);
        await sendWhatsAppText({
          to: normalizedPhone,
          body: reply,
          eventType: "whatsapp.cmd.entregado.buyer_error",
        });
        return {
          to: normalizedPhone,
          command: "ENTREGADO",
          reply,
          status: "error",
        };
      }

      const ord = releaseRes.order;
      const del = releaseRes.delivery;
      void notifyEscrowReleased({
        orderId: ord?.id || del?.order_id || buyerMatch.order_id,
        shortCode: ord?.short_code ?? del?.short_code ?? null,
        productName:
          ord?.product_name || del?.product_name || "Pedido comunitario",
        amountBs: Number(ord?.amount_motes ?? del?.amount_motes ?? 0),
        sellerId: ord?.seller_id ?? del?.seller_id ?? buyerMatch.seller_id,
        sellerPhone: del?.seller_phone ?? buyerMatch.seller_phone ?? null,
        buyerId: buyerUser.id,
        buyerPhone: buyerUser.phone,
        riderId: del?.rider_id ?? buyerMatch.rider_id ?? null,
        riderPhone: del?.rider_phone ?? buyerMatch.rider_phone ?? null,
        deliveryFeeBs: Number(del?.delivery_fee_motes ?? 5),
      }).catch(() => undefined);

      const reply = `✅ ¡Pedido ${normalizeShortCode(rawCode)} confirmado! Tu Pago Protegido fue entregado a la caserita.`;
      await sendWhatsAppText({
        to: normalizedPhone,
        body: reply,
        eventType: "whatsapp.cmd.entregado.buyer_ok",
      });
      return { to: normalizedPhone, command: "ENTREGADO", reply, status: "ok" };
    }

    const reply =
      "No encontramos un pedido tuyo pendiente con ese código (o, si eres repartidor, incluye también tu código de 4 dígitos al final).";
    await sendWhatsAppText({
      to: normalizedPhone,
      body: reply,
      eventType: "whatsapp.cmd.entregado.not_found",
    });
    return {
      to: normalizedPhone,
      command: "ENTREGADO",
      reply,
      status: "not_found",
    };
  }

  // Comando AYUDA / MENU o mensaje no reconocido
  const helpReply = buildHelpReply();
  await sendWhatsAppText({
    to: normalizedPhone,
    body: helpReply,
    eventType: "whatsapp.cmd.help",
  });
  return {
    to: normalizedPhone,
    command: /^AYUDA|MENU$/i.test(upperText) ? "AYUDA" : "FALLBACK",
    reply: helpReply,
    status: "ok",
  };
}

/**
 * Verificación oficial del Webhook de WhatsApp Cloud API (Meta).
 */
export async function GET(request: NextRequest) {
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
  if (!verifyToken) {
    return applyNoStoreHeaders(
      NextResponse.json(
        {
          error:
            "WHATSAPP_VERIFY_TOKEN no configurado todavía en variables de entorno.",
        },
        { status: 503 }
      )
    );
  }

  const { searchParams } = request.nextUrl;
  const mode = (searchParams.get("hub.mode") || "").trim();
  const token = (searchParams.get("hub.verify_token") || "").trim();
  const challenge = searchParams.get("hub.challenge") || "";

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    constantTimeTokenMatch(verifyToken, token)
  ) {
    return applyNoStoreHeaders(
      new NextResponse(challenge, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
        },
      })
    );
  }

  return applyNoStoreHeaders(
    new NextResponse("Forbidden", {
      status: 403,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
      },
    })
  );
}

/**
 * Receptor de eventos entrantes de WhatsApp (Meta Cloud API o payload directo en pruebas).
 */
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const appSecret = (process.env.WHATSAPP_APP_SECRET || "").trim();

    if (appSecret) {
      const signature = request.headers.get("x-hub-signature-256");
      if (!verifyMetaSignature(rawBody, signature, appSecret)) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "Firma x-hub-signature-256 inválida o ausente." },
            { status: 401 }
          )
        );
      }
    }

    let parsedPayload: unknown = null;
    try {
      parsedPayload = rawBody ? JSON.parse(rawBody) : null;
    } catch {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "Cuerpo JSON inválido en webhook de WhatsApp." },
          { status: 400 }
        )
      );
    }

    const inboundMessages = extractInboundMessages(parsedPayload);
    if (inboundMessages.length === 0) {
      return applyNoStoreHeaders(
        NextResponse.json({
          ok: true,
          handled: 0,
          replies: [],
        })
      );
    }

    const replies = [];
    for (const msg of inboundMessages) {
      const outcome = await handleInboundCommand(msg);
      replies.push(outcome);
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        ok: true,
        handled: replies.length,
        replies,
      })
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
