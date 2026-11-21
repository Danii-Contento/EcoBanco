"use client";

export interface CompressedImageResult {
  dataUrl: string;
  sizeBytes: number;
  width: number;
  height: number;
  mimeType: string;
}

export interface ImageCompressionOptions {
  maxDimension?: number;
  maxBytes?: number;
  initialQuality?: number;
}

const DEFAULT_MAX_DIMENSION = 1080;
const DEFAULT_MAX_BYTES = 80 * 1024; // < 80 KB ("Modo Megas")

function estimateDataUrlBytes(dataUrl: string): number {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx === -1) return dataUrl.length;
  const base64 = dataUrl.slice(commaIdx + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("No se pudo abrir la imagen seleccionada."));
    };
    img.src = objectUrl;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("No se pudo leer la imagen."));
      }
    };
    reader.onerror = () => reject(new Error("Error al leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function supportsWebPEncoding(): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 2;
    probe.height = 2;
    return probe.toDataURL("image/webp", 0.5).startsWith("data:image/webp");
  } catch {
    return false;
  }
}

/**
 * "Modo Megas": Redimensiona (máx. 1080px) y comprime imágenes en el navegador
 * a formato WebP ligero (< 80 KB) antes de subirlas a Supabase Storage.
 */
export async function compressImageToWebP(
  file: File,
  options: ImageCompressionOptions = {}
): Promise<CompressedImageResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const initialQuality = options.initialQuality ?? 0.8;

  if (typeof window === "undefined" || typeof document === "undefined") {
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      sizeBytes: estimateDataUrlBytes(fallbackUrl),
      width: 0,
      height: 0,
      mimeType: file.type || "image/jpeg",
    };
  }

  let img: HTMLImageElement;
  try {
    img = await loadImageElement(file);
  } catch {
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      sizeBytes: estimateDataUrlBytes(fallbackUrl),
      width: 0,
      height: 0,
      mimeType: file.type || "image/jpeg",
    };
  }

  const naturalWidth = img.naturalWidth || img.width || 1;
  const naturalHeight = img.naturalHeight || img.height || 1;
  const longestSide = Math.max(naturalWidth, naturalHeight);
  const initialScale = longestSide > maxDimension ? maxDimension / longestSide : 1;

  let targetWidth = Math.max(1, Math.round(naturalWidth * initialScale));
  let targetHeight = Math.max(1, Math.round(naturalHeight * initialScale));

  const targetMime = supportsWebPEncoding() ? "image/webp" : "image/jpeg";
  const qualitySteps = [initialQuality, 0.72, 0.62, 0.52, 0.42, 0.34, 0.26];

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    const fallbackUrl = await readFileAsDataUrl(file);
    return {
      dataUrl: fallbackUrl,
      sizeBytes: estimateDataUrlBytes(fallbackUrl),
      width: naturalWidth,
      height: naturalHeight,
      mimeType: file.type || "image/jpeg",
    };
  }

  let bestDataUrl = "";
  let bestBytes = Number.POSITIVE_INFINITY;
  let bestWidth = targetWidth;
  let bestHeight = targetHeight;

  // Hasta 4 pasadas reduciendo escala si la imagen sigue superando el límite de 80 KB
  for (let pass = 0; pass < 4; pass++) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx.clearRect(0, 0, targetWidth, targetHeight);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    for (const q of qualitySteps) {
      const candidate = canvas.toDataURL(targetMime, q);
      const bytes = estimateDataUrlBytes(candidate);
      if (bytes < bestBytes) {
        bestDataUrl = candidate;
        bestBytes = bytes;
        bestWidth = targetWidth;
        bestHeight = targetHeight;
      }
      if (bytes <= maxBytes) {
        return {
          dataUrl: candidate,
          sizeBytes: bytes,
          width: targetWidth,
          height: targetHeight,
          mimeType: targetMime,
        };
      }
    }

    // Reduce dimensiones ligeramente para fotos muy densas y reintenta
    targetWidth = Math.max(320, Math.round(targetWidth * 0.78));
    targetHeight = Math.max(320, Math.round(targetHeight * 0.78));
  }

  return {
    dataUrl: bestDataUrl,
    sizeBytes: bestBytes,
    width: bestWidth,
    height: bestHeight,
    mimeType: targetMime,
  };
}
