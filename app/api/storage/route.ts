import { NextRequest, NextResponse } from "next/server";
import { applyNoStoreHeaders, readSession } from "@/app/lib/session";
import {
  getStoredObject,
  isValidBucket,
  uploadImageToStorage,
} from "@/app/lib/supabase";

const MAX_RIDER_VERIFICATION_IMAGE_BYTES = 650 * 1024;
const DATA_IMAGE_REGEX = /^data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)$/;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const bucket = searchParams.get("bucket") || "";
    const objectPath = searchParams.get("path") || "";

    if (!isValidBucket(bucket) || !objectPath || objectPath.includes("..")) {
      return NextResponse.json(
        { error: "Bucket o ruta de archivo inválida." },
        { status: 400 }
      );
    }

    const stored = await getStoredObject(bucket, objectPath);
    if (!stored) {
      return NextResponse.json(
        { error: "Imagen no encontrada en Storage." },
        { status: 404 }
      );
    }

    return new NextResponse(new Uint8Array(stored.buffer), {
      status: 200,
      headers: {
        "Content-Type": stored.contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo recuperar el archivo de Storage." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    const body = await request.json();
    const { bucket, dataUrl, ownerId } = body;

    if (!bucket || !isValidBucket(String(bucket))) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Bucket inválido. Debe ser 'avatars', 'product-images', 'qr-bancarios' o 'rider-verifications'.",
          },
          { status: 400 }
        )
      );
    }

    let resolvedOwnerId = String(ownerId || "ecobanco");

    if (
      bucket === "avatars" ||
      bucket === "product-images" ||
      bucket === "qr-bancarios"
    ) {
      if (!session.merchantId) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "Debes iniciar sesión como caserita para subir archivos." },
            { status: session.buyerId || session.riderId ? 403 : 401 }
          )
        );
      }
      resolvedOwnerId = session.merchantId;
    }

    if (!dataUrl || typeof dataUrl !== "string") {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "Se requiere el contenido de la imagen (dataUrl)." },
          { status: 400 }
        )
      );
    }

    if (bucket === "rider-verifications") {
      const match = dataUrl.trim().match(DATA_IMAGE_REGEX);
      if (!match) {
        return applyNoStoreHeaders(
          NextResponse.json(
            { error: "La imagen de verificación debe ser un formato de imagen válido." },
            { status: 400 }
          )
        );
      }
      const approxBytes = Math.floor((match[1].replace(/\s+/g, "").length * 3) / 4);
      if (approxBytes > MAX_RIDER_VERIFICATION_IMAGE_BYTES) {
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "La foto es demasiado pesada. Comprímela antes de subirla.",
            },
            { status: 400 }
          )
        );
      }
    }

    const result = await uploadImageToStorage(
      bucket,
      dataUrl,
      resolvedOwnerId
    );

    return applyNoStoreHeaders(
      NextResponse.json(
        {
          ok: true,
          bucket,
          path: result.path,
          publicUrl: result.publicUrl,
        },
        { status: 201 }
      )
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "No se pudo subir la imagen a Storage.";
    return applyNoStoreHeaders(
      NextResponse.json({ error: message }, { status: 400 })
    );
  }
}
