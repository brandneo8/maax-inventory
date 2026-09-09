import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getInventoryCount } from "@/lib/data/counts";
import { formatDate, productDisplayName, productLabel } from "@/lib/format";
import { classificationLabel } from "@/lib/labels";
import { CountItemsForm, type CountLine } from "./count-items-form";

function brandName(value: unknown) {
  const brand = Array.isArray(value) ? value[0] : value;
  if (!brand || typeof brand !== "object" || !("name" in brand)) return "";
  return String((brand as { name?: string | null }).name ?? "").trim();
}

function toCountLine(
  item: Awaited<ReturnType<typeof getInventoryCount>>["items"][number],
): CountLine {
  const product = Array.isArray(item.products) ? item.products[0] : item.products;
  const itemLocation = Array.isArray(item.store_locations) ? item.store_locations[0] : item.store_locations;
  return {
    id: item.id,
    label: productLabel(product, item.product_id),
    name: productDisplayName(product),
    sku: product?.sku?.trim() ?? "",
    brand: brandName(product && "brands" in product ? product.brands : null),
    location: itemLocation?.name ?? "—",
    expected: Number(item.expected_quantity ?? 0),
    counted: item.counted_quantity === null ? null : Number(item.counted_quantity),
    variance: item.variance === null ? null : Number(item.variance),
  };
}

export default async function CountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const count = await getInventoryCount(supabase, companyId, id, branch.id).catch(() => null);

  if (!count) notFound();

  const location = Array.isArray(count.store_locations) ? count.store_locations[0] : count.store_locations;
  const brand = Array.isArray(count.brands) ? count.brands[0] : count.brands;
  const tag = Array.isArray(count.tags) ? count.tags[0] : count.tags;
  const open = count.status === "in_progress";
  const lines = count.items.map(toCountLine);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/counts" className="text-sm text-muted underline">
          Back to counts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Count {formatDate(count.count_date)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {[
            location?.name ?? "Whole branch",
            brand?.name,
            classificationLabel(count.filter_classification),
            tag?.name,
            count.status.replace("_", " "),
          ]
            .filter((part) => part && part !== "—")
            .join(" · ")}
        </p>
      </div>

      <CountItemsForm countId={count.id} items={lines} editable={open} />
    </div>
  );
}
