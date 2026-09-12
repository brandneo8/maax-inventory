import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";

export async function POST(request: Request) {
  const { supabase, companyId } = await requireAdmin();
  const body = (await request.json().catch(() => null)) as { id?: unknown; gstRegistered?: unknown } | null;
  const id = typeof body?.id === "string" ? body.id : "";
  const gstRegistered = Boolean(body?.gstRegistered);
  if (!id) {
    return NextResponse.json({ error: "Missing supplier." }, { status: 400 });
  }

  const { error } = await supabase
    .from("suppliers")
    .update({ gst_registered: gstRegistered })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  revalidatePath("/admin");
  revalidatePath("/admin/suppliers");
  revalidatePath("/admin/products");
  revalidatePath("/home/products");
  revalidatePath("/orders/new");
  return NextResponse.json({ ok: true });
}
