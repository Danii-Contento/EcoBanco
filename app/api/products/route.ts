import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/app/lib/session";
import { db } from "@/app/lib/store";

export async function GET() {
  try {
    const products = await db.getProducts();
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
      return NextResponse.json(
        { error: "Debes iniciar sesión como caserita para publicar productos." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { name, priceMotes, description, imageUrl, sellerName } = body;

    if (
      !name ||
      !String(name).trim() ||
      Number(priceMotes) <= 0 ||
      !description ||
      !String(description).trim() ||
      !imageUrl
    ) {
      return NextResponse.json(
        {
          error:
            "Nombre del producto, precio en MOTES, descripción y foto real son obligatorios.",
        },
        { status: 400 }
      );
    }

    const result = await db.addProduct(session, {
      name: String(name),
      priceMotes: Number(priceMotes),
      description: String(description),
      imageUrl: String(imageUrl),
      sellerName: sellerName ? String(sellerName) : undefined,
    });

    if (!result.ok || !result.product) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    const products = await db.getProducts();
    return NextResponse.json(
      {
        product: result.product,
        products,
      },
      { status: 201 }
    );
  } catch {
    return NextResponse.json(
      { error: "No se pudo publicar el producto." },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.merchantId) {
      return NextResponse.json(
        { error: "Debes iniciar sesión como caserita para editar productos." },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { id, name, priceMotes, description, imageUrl } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID de producto requerido." },
        { status: 400 }
      );
    }

    const result = await db.updateProduct(session, String(id), {
      name,
      priceMotes: Number(priceMotes),
      description,
      imageUrl,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    const products = await db.getProducts();
    return NextResponse.json({
      products,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo actualizar el producto." },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = readSession(request);
    if (!session.merchantId) {
      return NextResponse.json(
        { error: "Debes iniciar sesión como caserita para eliminar productos." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID del producto requerido." },
        { status: 400 }
      );
    }

    const result = await db.removeProduct(session, id);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    const products = await db.getProducts();
    return NextResponse.json({
      products,
    });
  } catch {
    return NextResponse.json(
      { error: "No se pudo eliminar el producto." },
      { status: 500 }
    );
  }
}
