import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { persistProductComponents } from "@/lib/data/product-components";

function asComponents(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { productId?: unknown; quantity?: unknown; allocatedCost?: unknown };
    const productId = typeof row.productId === "string" ? row.productId.trim() : "";
    const quantity = Number(row.quantity);
    if (!productId || !Number.isFinite(quantity) || quantity <= 0) return [];
    const allocated =
      row.allocatedCost == null || row.allocatedCost === ""
        ? null
        : Number(row.allocatedCost);
    return [
      {
        productId,
        quantity,
        allocatedCost: allocated == null || !Number.isFinite(allocated) ? null : allocated,
      },
    ];
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        productId?: unknown;
        unitCost?: unknown;
        components?: unknown;
        replaceEmpty?: unknown;
      }
    | null;

  const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
  if (!productId) {
    return NextResponse.json({ error: "Missing product." }, { status: 400 });
  }

  try {
    const { supabase, companyId } = await requireAdmin();
    const { data: owned, error } = await supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!owned) {
      return NextResponse.json({ error: "No matching product to update." }, { status: 400 });
    }

    await persistProductComponents(supabase, companyId, {
      productId,
      isSet: true,
      parentUnitCost: Number(body?.unitCost) || 0,
      components: asComponents(body?.components),
      replaceEmpty: body?.replaceEmpty === true,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save bundle contents.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
