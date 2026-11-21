import { NextRequest, NextResponse } from "next/server";
import {
  getStoredObject,
  isValidBucket,
  uploadImageToStorage,
} from "@/app/lib/supabase";

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
    const body = await request.json();
    const { bucket, dataUrl, ownerId } = body;

    if (!bucket || !isValidBucket(String(bucket))) {
      return NextResponse.json(
        {
          error:
            "Bucket inválido. Debe ser 'avatars', 'product-images', 'qr-bancarios' o 'rider-verifications'.",
        },
        { status: 400 }
      );
    }

    if (!dataUrl || typeof dataUrl !== "string") {
      return NextResponse.json(
        { error: "Se requiere el contenido de la imagen (dataUrl)." },
        { status: 400 }
      );
    }

    const result = await uploadImageToStorage(
      bucket,
      dataUrl,
      String(ownerId || "ecobanco")
    );

    return NextResponse.json(
      {
        ok: true,
        bucket,
        path: result.path,
        publicUrl: result.publicUrl,
      },
      { status: 201 }
    );
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : "No se pudo subir la imagen a Storage.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
