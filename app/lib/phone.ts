/**
 * Utilidades isomórficas para normalización y formato de teléfonos bolivianos (+591XXXXXXXX)
 * y construcción de enlaces de WhatsApp para pedidos barriales.
 */

export const BOLIVIA_COUNTRY_CODE = "+591";
export const BOLIVIAN_LOCAL_PHONE_REGEX = /^\d{8}$/;
export const BOLIVIAN_E164_PHONE_REGEX = /^\+591\d{8}$/;

/**
 * Extrae los dígitos locales de un teléfono boliviano removiendo separadores,
 * prefijos internacionales (00591, +591, 591) o cero inicial.
 */
export function extractBolivianLocalDigits(raw?: string | null): string {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  if (digits.startsWith("00591") && digits.length >= 13) {
    return digits.slice(5);
  }
  if (digits.startsWith("591") && digits.length === 11) {
    return digits.slice(3);
  }
  if (digits.startsWith("0") && digits.length === 9) {
    return digits.slice(1);
  }
  return digits;
}

/**
 * Normaliza un número celular boliviano de 8 dígitos al formato estándar `+591XXXXXXXX`.
 * Devuelve `null` si no contiene exactamente 8 dígitos locales válidos.
 */
export function normalizeBolivianPhone(raw?: string | null): string | null {
  const local = extractBolivianLocalDigits(raw);
  if (!BOLIVIAN_LOCAL_PHONE_REGEX.test(local)) {
    return null;
  }
  return `${BOLIVIA_COUNTRY_CODE}${local}`;
}

/**
 * Verifica si una entrada representa un teléfono boliviano válido de 8 dígitos.
 */
export function isValidBolivianPhone(raw?: string | null): boolean {
  return normalizeBolivianPhone(raw) !== null;
}

/**
 * Compara dos teléfonos bolivianos normalizándolos previamente cuando es posible.
 */
export function areSameBolivianPhone(
  a?: string | null,
  b?: string | null
): boolean {
  const normA = normalizeBolivianPhone(a);
  const normB = normalizeBolivianPhone(b);
  if (normA && normB) {
    return normA === normB;
  }

  const cleanA = String(a || "").replace(/\s+/g, "").trim();
  const cleanB = String(b || "").replace(/\s+/g, "").trim();
  return Boolean(cleanA && cleanB && cleanA === cleanB);
}

/**
 * Sanitiza la entrada de un campo de teléfono local con prefijo fijo `+591`.
 * Si el usuario pega `+591 76543210` o `59176543210`, extrae los 8 dígitos locales.
 */
export function sanitizeLocalPhoneInput(raw: string): string {
  return extractBolivianLocalDigits(raw).slice(0, 8);
}

/**
 * Formatea un teléfono boliviano para lectura amigable (`+591 7654 3210`).
 */
export function formatBolivianPhoneDisplay(raw?: string | null): string {
  const normalized = normalizeBolivianPhone(raw);
  if (!normalized) {
    return String(raw || "").trim();
  }
  const local = normalized.slice(BOLIVIA_COUNTRY_CODE.length);
  return `${BOLIVIA_COUNTRY_CODE} ${local.slice(0, 4)} ${local.slice(4)}`;
}

/**
 * Convierte un teléfono boliviano a dígitos puros `591XXXXXXXX` para enlaces `https://wa.me/`.
 */
export function toWhatsAppDigits(raw?: string | null): string {
  const normalized = normalizeBolivianPhone(raw);
  return normalized ? normalized.slice(1) : "";
}

export interface WhatsAppOrderUrlParams {
  orderCode: string;
  productName: string;
  quantity?: number;
  totalBs: number;
  sellerName: string;
  sellerPhone?: string | null;
  buyerName?: string;
  buyerPhone?: string;
  deliveryAddress?: string;
  specialNotes?: string;
}

/**
 * Genera el enlace `https://wa.me/` con el resumen legible del pedido.
 * Nunca incluye el PIN secreto de entrega (`delivery_pin`).
 */
export function buildWhatsAppOrderUrl(
  params: WhatsAppOrderUrlParams
): string {
  const qty = Math.max(1, Math.round(Number(params.quantity ?? 1)));
  const roundedBs = Math.max(0, Math.round(Number(params.totalBs ?? 0)));
  const formattedBuyerPhone = params.buyerPhone
    ? formatBolivianPhoneDisplay(params.buyerPhone)
    : "";

  const lines = [
    "¡Hola! Hice mi pedido en EcoBanco Bolivia 🌱",
    `Código: ${params.orderCode}`,
    `Pedido: ${qty > 1 ? `${qty}x ` : ""}${params.productName}`,
    `Caserita: ${params.sellerName}`,
    `Total: ${roundedBs} Bs (${roundedBs} MOTES) · Pago Protegido`,
  ];

  if (params.deliveryAddress?.trim()) {
    lines.push(`Entrega: ${params.deliveryAddress.trim()}`);
  }
  if (params.buyerName?.trim()) {
    lines.push(
      `Vecino: ${params.buyerName.trim()}${
        formattedBuyerPhone ? ` (${formattedBuyerPhone})` : ""
      }`
    );
  }
  if (params.specialNotes?.trim()) {
    lines.push(`Nota: ${params.specialNotes.trim()}`);
  }

  const targetDigits = toWhatsAppDigits(params.sellerPhone);
  const baseUrl = targetDigits
    ? `https://wa.me/${targetDigits}`
    : "https://wa.me/";
  return `${baseUrl}?text=${encodeURIComponent(lines.join("\n"))}`;
}
