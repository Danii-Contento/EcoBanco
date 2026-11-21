import { Product } from "@/app/types/ecobanco";

export type MarketplaceCategoryKey =
  | "all"
  | "Gastronomía"
  | "Panadería"
  | "Agroecología"
  | "Servicios";

export interface MarketplaceCategoryOption {
  key: MarketplaceCategoryKey;
  label: string;
  emoji: string;
}

export const MARKETPLACE_CATEGORIES: ReadonlyArray<MarketplaceCategoryOption> = [
  { key: "all", label: "Todo", emoji: "✨" },
  { key: "Gastronomía", label: "Comida", emoji: "🍲" },
  { key: "Panadería", label: "Panadería", emoji: "🥖" },
  { key: "Agroecología", label: "Frescos", emoji: "🥬" },
  { key: "Servicios", label: "Servicios", emoji: "🛠️" },
];

const VALID_CATEGORIES = new Set<Exclude<MarketplaceCategoryKey, "all">>([
  "Gastronomía",
  "Panadería",
  "Agroecología",
  "Servicios",
]);

const BAKERY_KEYWORDS = [
  "pan",
  "empanada",
  "saltena",
  "tucumana",
  "torta",
  "queque",
  "cunape",
  "marraqueta",
  "masita",
  "galleta",
  "pastel",
  "huminta",
  "bizcocho",
  "rollo",
  "horno",
  "postre",
];

const FRESH_KEYWORDS = [
  "fruta",
  "verdura",
  "organico",
  "agro",
  "papa",
  "quinua",
  "queso",
  "miel",
  "leche",
  "huevo",
  "palta",
  "tomate",
  "hortaliza",
  "cafe",
  "cacao",
  "canasta",
  "fresco",
  "grano",
  "choclo",
];

const SERVICE_KEYWORDS = [
  "servicio",
  "reparacion",
  "costura",
  "limpieza",
  "corte",
  "lavado",
  "planchado",
  "clases",
  "delivery",
  "mantenimiento",
  "arreglo",
  "peluqueria",
];

/**
 * Normaliza un texto removiendo tildes y pasando a minúsculas para comparaciones tolerantes.
 */
export function normalizeFilterText(value?: string | null): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Determina la categoría del producto a partir de su campo explícito o palabras clave.
 */
export function inferProductCategory(
  product: Product
): Exclude<MarketplaceCategoryKey, "all"> {
  if (product.category && VALID_CATEGORIES.has(product.category)) {
    return product.category;
  }

  const haystack = normalizeFilterText(`${product.name} ${product.description}`);
  if (BAKERY_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return "Panadería";
  }
  if (FRESH_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return "Agroecología";
  }
  if (SERVICE_KEYWORDS.some((kw) => haystack.includes(kw))) {
    return "Servicios";
  }
  return "Gastronomía";
}

/**
 * Obtiene la metadata visual (emoji y etiqueta) para una categoría de producto.
 */
export function getCategoryOption(
  category: Exclude<MarketplaceCategoryKey, "all">
): MarketplaceCategoryOption {
  return (
    MARKETPLACE_CATEGORIES.find((c) => c.key === category) ??
    MARKETPLACE_CATEGORIES[1]
  );
}

/**
 * Extrae el nombre corto de la zona o barrio desde la dirección de la caserita.
 */
export function extractNeighborhoodZone(address?: string | null): string {
  const clean = String(address || "").trim();
  if (!clean) return "";

  const firstSegment = clean.split(/[,·\-/]/)[0]?.trim() || clean;
  if (firstSegment.length <= 28) {
    return firstSegment;
  }
  return `${firstSegment.slice(0, 25).trim()}...`;
}

/**
 * Devuelve la lista única de zonas o barrios presentes en los productos visibles.
 */
export function getAvailableZones(products: Product[]): string[] {
  const seen = new Map<string, string>();
  for (const product of products) {
    const zone = extractNeighborhoodZone(product.sellerAddress);
    if (!zone) continue;
    const key = normalizeFilterText(zone);
    if (key && !seen.has(key)) {
      seen.set(key, zone);
    }
  }
  return Array.from(seen.values());
}
