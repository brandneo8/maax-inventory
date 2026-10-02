import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getProductSale } from "@/lib/data/product-sales";
import { getBranchPosProducts } from "@/lib/data/products";
import { formatDate, productDisplayName, singaporeToday } from "@/lib/format";
import { NewProductSaleForm } from "./new-product-sale-form";

export default async function NewProductSalePage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const { supabase, companyId, branch } = await requireBranch();
  const [products, source] = await Promise.all([
    getBranchPosProducts(supabase, companyId, branch.id),
    from ? getProductSale(supabase, companyId, branch.id, from).catch(() => null) : Promise.resolve(null),
  ]);

  // A duplicate copies products, quantities and unit prices only — a fresh
  // date, no notes, and no count links (each shortfall can only be claimed
  // once). Lines whose product has since left this salon's POS list are
  // dropped, since the form can only sell what's on it.
  const onPosList = new Set(products.map((product) => product.id));
  const initialLines = (source?.items ?? [])
    .filter((item) => onPosList.has(item.product_id))
    .map((item, index) => ({
      key: `duplicate-${index}`,
      productId: item.product_id,
      quantity: Number(item.quantity),
      unitSalePrice: Number(item.unit_sale_price),
    }));
  const droppedLabels = (source?.items ?? [])
    .filter((item) => !onPosList.has(item.product_id))
    .map((item) => {
      const product = Array.isArray(item.products) ? item.products[0] : item.products;
      return productDisplayName(product) || product?.sku || "A product";
    });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/product-sales" className="text-sm text-muted underline">
          ← Back to Product sales
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New product sale</h1>
        <p className="mt-1 text-sm text-muted">Working in {branch.displayName}.</p>
      </div>

      {source ? (
        <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Copied from the{" "}
          <Link className="underline" href={`/product-sales/${source.id}`}>
            {formatDate(source.sale_date)} product sale
          </Link>
          . Check the date, quantities and prices, then save — nothing is recorded until you do. Count links
          aren&apos;t copied.
          {droppedLabels.length > 0
            ? ` Left out because they're no longer on this salon's POS list: ${droppedLabels.join(", ")}.`
            : ""}
        </p>
      ) : null}

      <NewProductSaleForm
        branchId={branch.id}
        branchName={branch.displayName}
        products={products}
        today={singaporeToday()}
        initialLines={initialLines}
      />
    </div>
  );
}
