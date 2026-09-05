import { NextResponse } from "next/server";
import { requireBranch } from "@/lib/auth";
import { toCsv } from "@/lib/csv";
import { getRetailExportRows } from "@/lib/data/retail";

export async function GET() {
  const { supabase, companyId, user, branch } = await requireBranch();
  const rows = await getRetailExportRows(supabase, companyId, branch.id);
  const fileName = `maax-retail-stock-${new Date().toISOString().slice(0, 10)}.csv`;

  await supabase.from("report_exports").insert({
    company_id: companyId,
    branch_id: branch.id,
    report_type: "retail_stock",
    generated_by: user.email,
    file_reference: fileName,
  });

  return new NextResponse(toCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
