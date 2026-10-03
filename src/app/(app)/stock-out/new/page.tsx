import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getBranchStockOutProducts } from "@/lib/data/products";
import { NewStockOutForm } from "./new-stock-out-form";

export default async function NewStockOutPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const { inhouse } = await getBranchStockOutProducts(supabase, companyId, branch.id);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/stock-out" className="text-sm text-muted underline">
          ← Back to Stock-out
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New stock-out</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. For products used in the salon — record retail sales in{" "}
          <Link href="/product-sales" className="underline">
            Product sales
          </Link>
          .
        </p>
      </div>

      <NewStockOutForm
        branchId={branch.id}
        branchName={branch.displayName}
        inhouseProducts={inhouse}
      />
    </div>
  );
}
