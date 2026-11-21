import { NextRequest, NextResponse } from "next/server";
import { applyNoStoreHeaders, readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";
import { notifyProductPublished } from "@/app/lib/whatsappBridge";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const includeClosed = searchParams.get("includeClosed") === "true";
    if (includeClosed) {
      const session = readSession(request);
      if (!session.merchantId) {
        const status = session.buyerId || session.riderId ? 403 : 401;
        return applyNoStoreHeaders(
          NextResponse.json(
            {
              error:
                "Debes iniciar sesión como caserita para ver los productos de tu puesto.",
              products: [],
              total: 0,
            },
            { status }
          )
        );
      }
      const products = await db.getProducts({
        includeClosed: true,
        merchantId: session.merchantId,
      });
      return applyNoStoreHeaders(
        NextResponse.json({
          products,
          total: products.length,
        })
      );
    }

    const products = await db.getProducts({ includeClosed: false });
    return NextResponse.json({
      products,
      total: products.length,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudieron obtener los productos." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.merchantId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Debes iniciar sesión como caserita para publicar productos.",
          },
          { status: session.buyerId || session.riderId ? 403 : 401 }
        )
      );
    }

    const body = await request.json();
    const { name, priceMotes, description, imageUrl, sellerName } = body;

    const cleanName = String(name || "").trim();
    const numericPrice = Number(priceMotes);
    const cleanImageUrl = String(imageUrl || "").trim();
    const resolvedDescription =
      String(description || "").trim() ||
      `${cleanName} — Producto fresco del barrio.`;

    if (
      !cleanName ||
      !Number.isFinite(numericPrice) ||
      numericPrice <= 0 ||
      !cleanImageUrl
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Foto real, nombre del producto y precio en Bolivianos (Bs) mayor a 0 son obligatorios.",
          },
          { status: 400 }
        )
      );
    }

    const result = await db.addProduct(session, {
      name: cleanName,
      priceMotes: numericPrice,
      description: resolvedDescription,
      imageUrl: cleanImageUrl,
      sellerName: sellerName ? String(sellerName) : undefined,
    });

    if (!result.ok || !result.product) {
      return applyNoStoreHeaders(
        NextResponse.json({ error: result.error }, { status: 401 })
      );
    }

    const products = await db.getProducts({
      includeClosed: true,
      merchantId: session.merchantId,
    });

    void notifyProductPublished({
      event: "created",
      sellerId: result.product.sellerId || session.merchantId,
      sellerName: result.product.sellerName || "Tu puesto",
      sellerPhone: result.product.sellerPhone ?? null,
      productName: result.product.name,
      priceBs: Number(result.product.priceMotes ?? 0),
    }).catch(() => undefined);

    return applyNoStoreHeaders(
      NextResponse.json(
        {
          product: result.product,
          products,
        },
        { status: 201 }
      )
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "No se pudo publicar el producto." },
        { status: 500 }
      )
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.merchantId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error: "Debes iniciar sesión como caserita para editar productos.",
          },
          { status: session.buyerId || session.riderId ? 403 : 401 }
        )
      );
    }

    const body = await request.json();
    const { id, name, priceMotes, description, imageUrl } = body;

    if (!id) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "ID de producto requerido." },
          { status: 400 }
        )
      );
    }

    if (
      priceMotes !== undefined &&
      (!Number.isFinite(Number(priceMotes)) || Number(priceMotes) <= 0)
    ) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "Ingresa un precio válido mayor a 0 Bs." },
          { status: 400 }
        )
      );
    }

    const result = await db.updateProduct(session, String(id), {
      ...(name !== undefined ? { name: String(name) } : {}),
      ...(priceMotes !== undefined ? { priceMotes: Number(priceMotes) } : {}),
      ...(description !== undefined
        ? { description: String(description) }
        : {}),
      ...(imageUrl !== undefined ? { imageUrl: String(imageUrl) } : {}),
    });

    if (!result.ok) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: result.error },
          { status: result.forbidden ? 403 : 400 }
        )
      );
    }

    const products = await db.getProducts({
      includeClosed: true,
      merchantId: session.merchantId,
    });

    if (result.product) {
      void notifyProductPublished({
        event: "updated",
        sellerId: result.product.sellerId || session.merchantId,
        sellerName: result.product.sellerName || "Tu puesto",
        sellerPhone: result.product.sellerPhone ?? null,
        productName: result.product.name,
        priceBs: Number(result.product.priceMotes ?? 0),
      }).catch(() => undefined);
    }

    return applyNoStoreHeaders(
      NextResponse.json({
        products,
      })
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "No se pudo actualizar el producto." },
        { status: 500 }
      )
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.merchantId) {
      return applyNoStoreHeaders(
        NextResponse.json(
          {
            error:
              "Debes iniciar sesión como caserita para eliminar productos.",
          },
          { status: session.buyerId || session.riderId ? 403 : 401 }
        )
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: "ID del producto requerido." },
          { status: 400 }
        )
      );
    }

    const result = await db.removeProduct(session, id);
    if (!result.ok) {
      return applyNoStoreHeaders(
        NextResponse.json(
          { error: result.error },
          { status: result.forbidden ? 403 : 400 }
        )
      );
    }

    const products = await db.getProducts({
      includeClosed: true,
      merchantId: session.merchantId,
    });

    return applyNoStoreHeaders(
      NextResponse.json({
        products,
      })
    );
  } catch {
    return applyNoStoreHeaders(
      NextResponse.json(
        { error: "No se pudo eliminar el producto." },
        { status: 500 }
      )
    );
  }
}
