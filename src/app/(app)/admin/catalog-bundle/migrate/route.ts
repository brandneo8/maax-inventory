import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { migrateBundleStock } from "@/lib/data/product-components";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { productId?: unknown } | null;
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

    const result = await migrateBundleStock(supabase, companyId, productId);
    return NextResponse.json({ ok: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not migrate existing stock.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
