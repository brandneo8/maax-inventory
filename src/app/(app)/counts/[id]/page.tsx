import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getInventoryCount } from "@/lib/data/counts";
import { formatDate, formatQty, productLabel } from "@/lib/format";
import { classificationLabel } from "@/lib/labels";
import { tableClass, tdClass, thClass } from "@/lib/ui";
import { CountItemsForm } from "./count-items-form";

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

      {open ? (
        <CountItemsForm
          countId={count.id}
          items={count.items.map((item) => {
            const product = Array.isArray(item.products) ? item.products[0] : item.products;
            const itemLocation = Array.isArray(item.store_locations)
              ? item.store_locations[0]
              : item.store_locations;
            return {
              id: item.id,
              label: productLabel(product, item.product_id),
              location: itemLocation?.name ?? "—",
              expected: Number(item.expected_quantity ?? 0),
              counted: item.counted_quantity === null ? null : Number(item.counted_quantity),
              variance: item.variance === null ? null : Number(item.variance),
            };
          })}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Product</th>
                <th className={thClass}>Location</th>
                <th className={thClass}>Expected</th>
                <th className={thClass}>Counted</th>
                <th className={thClass}>Variance</th>
              </tr>
            </thead>
            <tbody>
              {count.items.map((item) => {
                const product = Array.isArray(item.products) ? item.products[0] : item.products;
                const itemLocation = Array.isArray(item.store_locations)
                  ? item.store_locations[0]
                  : item.store_locations;
                return (
                  <tr key={item.id}>
                    <td className={tdClass}>
                      {productLabel(product, item.product_id)}
                    </td>
                    <td className={tdClass}>{itemLocation?.name ?? "—"}</td>
                    <td className={tdClass}>{formatQty(item.expected_quantity)}</td>
                    <td className={tdClass}>{formatQty(item.counted_quantity)}</td>
                    <td className={tdClass}>{formatQty(item.variance)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
