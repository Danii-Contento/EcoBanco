/**
 * Fuente única de verdad para textos comunitarios y sanitización de errores en EcoBanco Bolivia.
 * Garantiza que toda la interfaz use vocabulario cálido y barrial ("Mi Libreta",
 * "Saldo en Bs / MOTES", "Pago Protegido", "Comprobante") sin exponer términos técnicos.
 */

export const COMMUNITY_COPY = {
  walletTitle: "Mi Libreta Comunitaria",
  walletShort: "Mi Libreta",
  balanceHeading: "Saldo en Bs / MOTES",
  balanceBsLabel: "Saldo en Bs",
  balanceMotesLabel: "Saldo en MOTES",
  moteParity: "1 MOTE = 1 Bs",
  moteParityDetail: "1 MOTE = 1 Bs en productos del barrio",
  rechargeCta: "Recargar con QR",
  movementsCta: "Mis movimientos",
  protectedBadge: "Pago Protegido",
  protectedSeal:
    "Pago Protegido EcoBanco: tu dinero se guarda seguro y se entrega a la caserita cuando recibes tu pedido",
  zeroCommission: "Comisión: 0 Bs — Cubierta por EcoBanco",
  receiptLabel: "Comprobante",
  receiptSaved: "Comprobante guardado en tu libreta",
  defaultError: "Hubo un corte de señal, intenta nuevamente en un momento.",
  protectedPaymentError:
    "Hubo un corte de señal al confirmar tu Pago Protegido. Tu dinero está seguro, intenta nuevamente en un momento.",
  walletPreparingError:
    "Estamos terminando de alistar tu libreta comunitaria. Intenta nuevamente en unos segundos.",
  rechargeAuthRequired:
    "Confirma tu ingreso con Google o con tu correo para generar el QR de tu banco.",
  rechargeDuplicate: "Esta recarga ya fue sumada a tu libreta comunitaria.",
  rechargeFailed:
    "La recarga con QR no se pudo completar. Si hubo un débito en tu banco, se devuelve automáticamente.",
  rechargePendingNotice:
    "Tu recarga con QR está en verificación. Apenas tu banco confirme, el saldo aparecerá en tu libreta.",
} as const;

export type NormalizedDeliveryStatus = "pending" | "in_transit" | "delivered";

export interface DeliveryStatusCopy {
  key: NormalizedDeliveryStatus;
  label: string;
  shortLabel: string;
  badgeClass: string;
}

export function normalizeDeliveryStatusKey(
  status?: string | null
): NormalizedDeliveryStatus {
  const normalized = (status || "").trim().toLowerCase();
  if (normalized === "delivered") return "delivered";
  if (normalized === "in_transit") return "in_transit";
  return "pending";
}

export function getDeliveryStatusCopy(
  status?: string | null
): DeliveryStatusCopy {
  const key = normalizeDeliveryStatusKey(status);
  if (key === "delivered") {
    return {
      key,
      label: "✅ Entregado",
      shortLabel: "✅ Entregado",
      badgeClass: "bg-brote/25 border-brote text-arena",
    };
  }
  if (key === "in_transit") {
    return {
      key,
      label: "🚲 En camino",
      shortLabel: "🚲 En camino",
      badgeClass: "bg-oro/25 border-oro text-brillo",
    };
  }
  return {
    key,
    label: "🍳 Preparando pedido",
    shortLabel: "🍳 Preparando",
    badgeClass: "bg-arena/15 border-arena/35 text-arena",
  };
}

export function getPaymentProtectionCopy(
  orderStatus?: string | null,
  deliveryStatus?: string | null
): { isReleased: boolean; badgeLabel: string; sellerLabel: string } {
  const isReleased =
    (orderStatus || "").toUpperCase() === "RELEASED" ||
    normalizeDeliveryStatusKey(deliveryStatus) === "delivered";

  return {
    isReleased,
    badgeLabel: isReleased
      ? "✅ Pago entregado"
      : `🛡️ ${COMMUNITY_COPY.protectedBadge}`,
    sellerLabel: isReleased
      ? "✅ Pago en tu libreta"
      : `🛡️ ${COMMUNITY_COPY.protectedBadge}`,
  };
}

export interface ProtectedPurchaseStep {
  num: 1 | 2 | 3;
  done: boolean;
  active: boolean;
  label: string;
}

export function getProtectedPurchaseSteps(params: {
  deliveryStatus?: string | null;
  orderStatus?: string | null;
  amountBs?: number;
}): {
  currentStep: 1 | 2 | 3;
  fillPercent: number;
  isDelivered: boolean;
  isInTransit: boolean;
  steps: ProtectedPurchaseStep[];
} {
  const statusKey = normalizeDeliveryStatusKey(params.deliveryStatus);
  const isDelivered =
    statusKey === "delivered" ||
    (params.orderStatus || "").toUpperCase() === "RELEASED";
  const isInTransit = statusKey === "in_transit";
  const currentStep: 1 | 2 | 3 = isDelivered ? 3 : 2;
  const fillPercent = isDelivered ? 100 : isInTransit ? 72 : 42;
  const roundedBs =
    params.amountBs && Number(params.amountBs) > 0
      ? Math.round(Number(params.amountBs))
      : 0;

  const steps: ProtectedPurchaseStep[] = [
    {
      num: 1,
      done: true,
      active: false,
      label:
        roundedBs > 0
          ? `Pago guardado seguro (${roundedBs} Bs protegidos).`
          : "Pago guardado de forma segura en EcoBanco.",
    },
    {
      num: 2,
      done: isInTransit || isDelivered,
      active: !isInTransit && !isDelivered,
      label: isInTransit
        ? "Pedido listo y en camino con tu repartidor de barrio."
        : "La caserita está preparando tu pedido.",
    },
    {
      num: 3,
      done: isDelivered,
      active: isInTransit && !isDelivered,
      label: "Pedido recibido → Pago entregado a la caserita.",
    },
  ];

  return {
    currentStep,
    fillPercent,
    isDelivered,
    isInTransit,
    steps,
  };
}

export function getRechargeStatusLabel(state?: string | null): string {
  const normalized = (state || "").trim().toLowerCase();
  switch (normalized) {
    case "created":
      return "QR listo para pagar desde tu banco";
    case "awaiting_payment":
      return "Esperando tu transferencia QR";
    case "processing":
      return "Verificando tu transferencia QR";
    case "settling_onchain":
      return "Confirmando tu saldo en tu libreta";
    case "completed":
      return "Saldo acreditado en tu libreta";
    case "failed":
    case "expired":
    case "cancelled":
      return "La recarga no se completó";
    case "refunded":
      return "Transferencia devuelta a tu banco";
    default:
      return "Recarga con QR en verificación";
  }
}

export function getRechargeStatusMessage(state?: string | null): string {
  const normalized = (state || "").trim().toLowerCase();
  if (normalized === "completed") {
    return "¡Listo! Tu saldo ya fue sumado a tu libreta comunitaria.";
  }
  if (normalized === "failed" || normalized === "refunded") {
    return COMMUNITY_COPY.rechargeFailed;
  }
  return `${getRechargeStatusLabel(
    state
  )}. En cuanto tu banco confirme, el saldo aparecerá automáticamente en tu libreta.`;
}

export function getAuthStepMessage(step?: string | null): string | null {
  switch ((step || "").trim().toLowerCase()) {
    case "creating_session":
      return "Preparando tu ingreso seguro...";
    case "opening_oauth":
      return "Completa tu acceso con Google en la ventana emergente...";
    case "sending_email":
      return "Enviando un código de acceso a tu correo...";
    case "entering_code":
    case "verifying_email_code":
      return "Verificando el código de tu correo...";
    case "authenticating":
      return "Confirmando tu libreta comunitaria...";
    default:
      return null;
  }
}

export function formatBs(amount?: number | string | null): string {
  const numeric = Math.round(Number(amount ?? 0));
  return `${Number.isFinite(numeric) ? numeric : 0} Bs`;
}

export function formatMotes(amount?: number | string | null): string {
  const numeric = Math.round(Number(amount ?? 0));
  return `${Number.isFinite(numeric) ? numeric : 0} MOTES`;
}

function deterministicFourDigits(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) % 9000;
  }
  return String(1000 + Math.abs(hash));
}

export function formatOrderCode(rawId?: string | null): string {
  if (!rawId) return "#ECO-0000";
  const clean = String(rawId).trim();
  const digits = clean.match(/(\d{3,})$/)?.[1];
  if (digits) {
    return `#ECO-${digits.slice(-4).padStart(4, "0")}`;
  }
  return `#ECO-${deterministicFourDigits(clean)}`;
}

const TECHNICAL_LEAK_REGEX =
  /\b(stellar|soroban|pollar|trustless|escrow|web3|blockchain|cripto|crypto|wallet|on-?chain|testnet|mainnet|usdc|xlm|trustline|custodial|passkey|xdr|horizon|friendbot|supabase|postgres|pgrst|onramp|offramp|rampwidget|txhash|contract_?id|engagement_?id|api[_-]?key|service_?provider|dispute_?resolver|multi-?release|soroban_?contract)\b|[GSC][A-Z2-7]{30,}|\b[a-f0-9]{24,}\b/i;

const NETWORK_ERROR_REGEX =
  /failed to fetch|fetch failed|load failed|networkerror|network request failed|err_network|econnrefused|econnreset|etimedout|enotfound|abort(ed|error)?|timeout|timed out|offline|cors|502|503|504|bad gateway|service unavailable|gateway timeout/i;

const TECH_INFRA_ERROR_REGEX =
  /trustless|soroban|stellar|horizon|friendbot|xdr|treasury|tesorer[ií]a|multi-?release|milestone|hito|contract_?id|unsignedtransaction|signxdr|signtx|passkey|c-address|trustline|api_?key|variables de entorno|supabase|postgres|pgrst|storage|bucket|unexpected token|json\.parse|syntaxerror|typeerror|referenceerror|internal server error|status\s*5\d\d|ecodohmi/i;

export function translateBackendMessage(raw?: string | null): string {
  if (!raw) return "";
  let text = String(raw);

  const replacements: Array<[RegExp, string]> = [
    // Frases compuestas de recarga y órdenes
    [
      /\(Orden\s+Pollar\s+[A-Za-z0-9_:-]+\)/gi,
      "",
    ],
    [
      /con\s+orden\s+Pollar\s+[A-Za-z0-9_:-]+/gi,
      "con tu recarga QR",
    ],
    [
      /Orden\s+Pollar\s+[A-Za-z0-9_:-]+/gi,
      "tu comprobante de recarga",
    ],
    [
      /a\s+través\s+de\s+Pollar/gi,
      "desde Mi Libreta",
    ],
    [
      /mediante\s+Pollar\s*\([^)]*\)/gi,
      "con QR de tu banco",
    ],
    [
      /mediante\s+Pollar/gi,
      "con QR de tu banco",
    ],
    [
      /\(Pollar\s+Ramp\)/gi,
      "",
    ],
    [
      /\(Prosumidor\)/gi,
      "",
    ],
    [
      /\(BOB\s*[→>-]+\s*USDC\)/gi,
      "(Bs)",
    ],
    [
      /BOB\s*[→>-]+\s*USDC/gi,
      "Bolivianos (Bs)",
    ],
    // Suscripciones y nombres de planes
    [/Suscripción\s+Prosumidor/gi, "Club Vecino"],
    [/Modo\s+Prosumidor/gi, "Caserita Aliada"],
    [/\bProsumidor(es)?\b/gi, "Club Vecino"],
    [/Versión\s+Premium/gi, "Caserita Aliada"],
    // Vocabulario comunitario de saldos y libreta
    [/Billetera\s+FIAT\s*\(Bs\)/gi, COMMUNITY_COPY.balanceBsLabel],
    [/Billetera\s+FIAT/gi, COMMUNITY_COPY.balanceBsLabel],
    [/Billetera\s+de\s+MOTES/gi, COMMUNITY_COPY.balanceMotesLabel],
    [/Billetera\s+MOTES/gi, COMMUNITY_COPY.balanceMotesLabel],
    [/billeteras\s+MOTES\s+y\s+FIAT\/USDC/gi, COMMUNITY_COPY.balanceHeading],
    [/billetera\s+EcoDohmi/gi, "Mi Libreta"],
    [/billetera\s+custodial/gi, "Mi Libreta Comunitaria"],
    [/billetera\s+digital/gi, "Mi Libreta"],
    [/\bbilletera(s)?\b/gi, "libreta$1"],
    [/\bwallet(s)?\b/gi, "libreta$1"],
    [/\ben\s+FIAT\b/gi, "en Bs"],
    [/\bBs\s+FIAT\b/gi, "Bs disponibles"],
    [/\bFIAT\b/gi, "Bs"],
    [/Carga\s+saldo\s+con\s+QR\s+de\s+tu\s+banco\s+en\s+Mi\s+Perfil/gi, "Recarga con QR en Mi Libreta"],
    [/en\s+Mi\s+Perfil/gi, "en Mi Libreta"],
    // Vocabulario de Pago Protegido
    [/Escrow\s+liberado\s+a\s+la\s+caserita/gi, "Pago entregado a la caserita"],
    [/Escrow\s+liberado/gi, "Pago entregado a la caserita"],
    [/liberar\s+el\s+Escrow/gi, "entregar el pago a la caserita"],
    [/el\s+Escrow\s+ya\s+fue\s+liberado/gi, "el pago ya fue entregado"],
    [/\bCompra\s+Protegida\b/gi, COMMUNITY_COPY.protectedBadge],
    [/\bEscrow\b/gi, COMMUNITY_COPY.protectedBadge],
    [/Contrato\s+Inteligente/gi, COMMUNITY_COPY.protectedBadge],
    [/Contrato\s+Multi-?Release/gi, COMMUNITY_COPY.protectedBadge],
    // Eliminación de marcas y jerga Web3 / Blockchain
    [/Trustless\s+Work/gi, "EcoBanco"],
    [/\bTrustless\b/gi, "EcoBanco"],
    [/\bPollar\b/gi, "EcoBanco"],
    [/\bStellar\b/gi, "EcoBanco"],
    [/\bSoroban\b/gi, "EcoBanco"],
    [/\bWeb3\b/gi, ""],
    [/\bblockchain\b/gi, ""],
    [/\bon-?chain\b/gi, ""],
    [/\bTestnet\b/gi, ""],
    [/\bMainnet\b/gi, ""],
    [/\bUSDC\b/gi, "Bs"],
    [/\bXLM\b/gi, "Bs"],
    [/\bBOB\b/g, "Bs"],
    [/\bcripto\b|\bcrypto\b/gi, "saldo"],
    [/\btrustline\b/gi, "activación"],
    [/\bcustodial\b/gi, ""],
    [/\bONRAMP\b/gi, "recarga con QR"],
    [/\bRampWidget\b/gi, "recarga con QR"],
    [/\bhash\b/gi, "comprobante"],
    // Códigos internos de entregas y almacenamiento
    [/\(?pickup_pin\)?/gi, ""],
    [/\(?delivery_pin\)?/gi, ""],
    [/\(?rider_verified\)?/gi, ""],
    [/\bPIN\s+de\s+recojo\b/gi, "código de recojo"],
    [/\bPIN\s+de\s+entrega\b/gi, "código de entrega"],
    [/\bin_transit\b/gi, "en camino"],
    [/Supabase\s+Storage/gi, "tu libreta"],
    [/desde\s+Supabase/gi, "en este momento"],
    [/en\s+Supabase/gi, "en tu libreta"],
    [/\bSupabase\b/gi, "EcoBanco"],
    [/al\s+bucket\s+rider-verifications/gi, "a tu ficha de confianza"],
    [/bucket\s+rider-verifications/gi, "tu ficha de confianza"],
    [/en\s+Storage/gi, "correctamente"],
    [/a\s+Storage/gi, "correctamente"],
    [/código\s+único\s+EcoDohmi/gi, "credencial oficial de repartidor"],
    [/\bEcoDohmi\b/gi, "ecológico"],
    // Eliminar direcciones alfanuméricas o hashes largos
    [/\(?[GSC][A-Z2-7]{20,}\)?/g, ""],
    [/\b[a-fA-F0-9]{24,}\b/g, ""],
    [/\(\s*\)/g, ""],
    [/\s+([.,!?;:])/g, "$1"],
    [/\s{2,}/g, " "],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.trim();
}

function extractRawErrorText(rawError: unknown): string {
  if (!rawError) return "";
  if (typeof rawError === "string") return rawError.trim();
  if (rawError instanceof Error) return (rawError.message || "").trim();
  if (typeof rawError === "object") {
    const record = rawError as Record<string, unknown>;
    if (typeof record.error === "string" && record.error.trim()) {
      return record.error.trim();
    }
    if (typeof record.message === "string" && record.message.trim()) {
      return record.message.trim();
    }
    if (record.error && typeof record.error === "object") {
      return extractRawErrorText(record.error);
    }
  }
  return "";
}

/**
 * Intercepta cualquier error técnico (de red, Pollar, Stellar, Soroban, Trustless Work
 * o base de datos) y devuelve siempre un mensaje humano y cálido en español boliviano.
 */
export function sanitizeUserError(rawError: unknown): string {
  const raw = extractRawErrorText(rawError);
  if (!raw) {
    return COMMUNITY_COPY.defaultError;
  }

  const lower = raw.toLowerCase();

  // 1. Errores de red / señal / tiempo de espera
  if (NETWORK_ERROR_REGEX.test(raw)) {
    return COMMUNITY_COPY.defaultError;
  }

  // 2. Errores de autenticación / preparación silenciosa de libreta
  if (
    lower.includes("pollar_not_authenticated") ||
    lower.includes("sesión de pollar") ||
    lower.includes("sesion de pollar") ||
    lower.includes("not authenticated") ||
    lower.includes("inicia sesión para continuar")
  ) {
    return COMMUNITY_COPY.rechargeAuthRequired;
  }

  if (
    lower.includes("wallet_not_ready") ||
    lower.includes("provisioning") ||
    lower.includes("createwallet") ||
    lower.includes("cuenta stellar") ||
    lower.includes("billetera stellar") ||
    lower.includes("trustline") ||
    lower.includes("cuenta g...")
  ) {
    return COMMUNITY_COPY.walletPreparingError;
  }

  // 3. Estados y errores de recargas con QR
  if (
    lower.includes("ya fue acreditada") ||
    lower.includes("duplicate")
  ) {
    return COMMUNITY_COPY.rechargeDuplicate;
  }

  if (
    lower.includes("reembolsad") ||
    lower.includes("refunded") ||
    lower.includes("no se completó") ||
    lower.includes("no se completo")
  ) {
    return COMMUNITY_COPY.rechargeFailed;
  }

  if (
    lower.includes("state !== 'completed'") ||
    lower.includes("aún no ha finalizado") ||
    lower.includes("aun no ha finalizado")
  ) {
    return COMMUNITY_COPY.rechargePendingNotice;
  }

  // 4. Mensajes humanos de negocio que sí deben orientar al usuario (sanitizados)
  if (lower.includes("saldo insuficiente")) {
    const cleaned = translateBackendMessage(raw);
    if (cleaned && !TECHNICAL_LEAK_REGEX.test(cleaned)) {
      return cleaned;
    }
    return "No te alcanza el saldo en tu libreta. Recarga con QR para continuar.";
  }

  if (lower.includes("rider_verified")) {
    return "Completa tu Ficha de Confianza antes de tomar o entregar pedidos.";
  }

  if (lower.includes("pickup_pin") || lower.includes("pin de recojo")) {
    return "El código de recojo de 4 números no coincide. Pídeselo nuevamente a la caserita.";
  }

  if (lower.includes("delivery_pin") || lower.includes("pin de entrega")) {
    return "El código de entrega de 4 números no coincide. Pídeselo nuevamente al vecino.";
  }

  if (
    lower.includes("contraseña incorrecta") ||
    lower.includes("clave incorrecta")
  ) {
    return "La clave no coincide. Revisa tu clave secreta de 4 números o tu WhatsApp e intenta otra vez.";
  }

  if (
    lower.includes("whatsapp ya está registrado") ||
    lower.includes("ya existe una cuenta registrada") ||
    lower.includes("ya existe un repartidor") ||
    lower.includes("pin o ci incorrecto") ||
    lower.includes("aún no está verificada") ||
    lower.includes("obligatorio") ||
    lower.includes("debes completar") ||
    lower.includes("producto seleccionado no existe") ||
    lower.includes("producto no encontrado") ||
    lower.includes("no encontramos una cuenta") ||
    lower.includes("ya fue entregado") ||
    lower.includes("ya no está disponible") ||
    lower.includes("ya está en tránsito") ||
    lower.includes("primero debes validar") ||
    lower.includes("monto válido") ||
    lower.includes("escribe tu nombre") ||
    lower.includes("escribe el nombre") ||
    lower.includes("ingresa un precio") ||
    lower.includes("ingresa el código") ||
    lower.includes("ingresa tu número") ||
    lower.includes("crea tu clave") ||
    lower.includes("escribe exactamente 4") ||
    lower.includes("sube una foto") ||
    lower.includes("solo puedes editar") ||
    lower.includes("solo puedes eliminar") ||
    lower.includes("debes iniciar sesión") ||
    lower.includes("puesto se encuentra cerrado") ||
    lower.includes("puesto está cerrado") ||
    lower.includes("no encontramos pedidos") ||
    lower.includes("genera el qr") ||
    lower.includes("pertenece a una cuenta") ||
    lower.includes("completa tus datos")
  ) {
    const cleaned = translateBackendMessage(raw);
    if (cleaned && !TECHNICAL_LEAK_REGEX.test(cleaned)) {
      return cleaned;
    }
  }

  // 5. Errores técnicos de infraestructura, blockchain, Pollar, Trustless Work o DB
  if (TECH_INFRA_ERROR_REGEX.test(raw) || TECHNICAL_LEAK_REGEX.test(raw)) {
    if (
      lower.includes("escrow") ||
      lower.includes("trustless") ||
      lower.includes("soroban") ||
      lower.includes("multi-release") ||
      lower.includes("hito") ||
      lower.includes("milestone")
    ) {
      return COMMUNITY_COPY.protectedPaymentError;
    }
    return COMMUNITY_COPY.defaultError;
  }

  // 6. Traducción general + cortafuegos final anti-fugas técnicas
  const translated = translateBackendMessage(raw);
  if (
    !translated ||
    translated.length > 240 ||
    TECHNICAL_LEAK_REGEX.test(translated)
  ) {
    return COMMUNITY_COPY.defaultError;
  }

  return translated;
}
