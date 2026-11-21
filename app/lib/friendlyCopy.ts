"use client";

/**
 * Capa visual "Cripto-Cero": traduce códigos internos y mensajes del backend
 * a lenguaje natural de mercado barrial boliviano sin alterar la lógica del servidor.
 */

export function formatBs(amount?: number | string | null): string {
  const numeric = Math.round(Number(amount ?? 0));
  return `${Number.isFinite(numeric) ? numeric : 0} Bs`;
}

export function formatMotes(amount?: number | string | null): string {
  const numeric = Math.round(Number(amount ?? 0));
  return `${Number.isFinite(numeric) ? numeric : 0} MOTES`;
}

export function formatOrderCode(rawId?: string | null): string {
  if (!rawId) return "Pedido";
  const digits = rawId.match(/(\d{3,})$/)?.[1];
  if (digits) {
    return `Pedido #${digits}`;
  }
  return `Pedido #${rawId.slice(-4).toUpperCase()}`;
}

export function translateBackendMessage(raw?: string | null): string {
  if (!raw) return "";
  let text = String(raw);

  const replacements: Array<[RegExp, string]> = [
    [/Suscripción\s+Prosumidor/gi, "Club Vecino"],
    [/Modo\s+Prosumidor/gi, "Caserita Aliada"],
    [/\bProsumidor(es)?\b/gi, "Club Vecino"],
    [/Versión\s+Premium/gi, "Caserita Aliada"],
    [/Billetera\s+FIAT\s*\(Bs\)/gi, "Saldo en Bolivianos (Bs)"],
    [/Billetera\s+FIAT/gi, "Saldo en Bolivianos (Bs)"],
    [/Billetera\s+MOTES/gi, "Puntos de Trueque (MOTES)"],
    [/\ben\s+FIAT\b/gi, "en Bolivianos (Bs)"],
    [/\bBs\s+FIAT\b/gi, "Bs disponibles"],
    [/\bFIAT\b/gi, "Bolivianos (Bs)"],
    [/Escrow\s+liberado\s+a\s+la\s+caserita/gi, "Pago liberado a la caserita"],
    [/Escrow\s+liberado/gi, "Pago liberado a la caserita"],
    [/liberar\s+el\s+Escrow/gi, "liberar el pago a la caserita"],
    [/el\s+Escrow\s+ya\s+fue\s+liberado/gi, "el pago ya fue liberado"],
    [/\bEscrow\b/gi, "Compra Protegida"],
    [/Contrato\s+Inteligente/gi, "Compra Protegida"],
    [/Trustless\s+Work/gi, "Compra Protegida"],
    [/\bPollar\b/gi, "EcoBanco"],
    [/\bStellar\b/gi, "EcoBanco"],
    [/\bTestnet\b/gi, ""],
    [/\bMainnet\b/gi, ""],
    [/\bUSDC\b/gi, "Bs"],
    [/\bpickup_pin\b/gi, "código de recojo"],
    [/\bdelivery_pin\b/gi, "código de entrega"],
    [/\(código de recojo\)/gi, ""],
    [/\(código de entrega\)/gi, ""],
    [/\(rider_verified\)/gi, ""],
    [/\bin_transit\b/gi, "en camino"],
    [/Supabase\s+Storage/gi, "tu libreta digital"],
    [/al\s+bucket\s+rider-verifications/gi, "a tu ficha de confianza"],
    [/bucket\s+rider-verifications/gi, "tu ficha de confianza"],
    [/en\s+Storage/gi, "correctamente"],
    [/a\s+Storage/gi, "correctamente"],
    [/billetera\s+EcoDohmi/gi, "libreta de repartidor"],
    [/código\s+único\s+EcoDohmi/gi, "credencial oficial de repartidor"],
    [/\bEcoDohmi\b/gi, "ecológico"],
    [/\s{2,}/g, " "],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  return text.trim();
}
