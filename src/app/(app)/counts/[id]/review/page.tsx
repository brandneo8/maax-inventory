import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getInventoryCount, getSalonProductIds } from "@/lib/data/counts";
import { getStoreLocations } from "@/lib/data/lookups";
import { formatDate } from "@/lib/format";
import { classificationLabel } from "@/lib/labels";
import { toCountEntry, toCountLine } from "../../count-lines";
import { CountItemsForm } from "../count-items-form";

export default async function CountReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { supabase, companyId, branch } = await requireBranch();
  const count = await getInventoryCount(supabase, companyId, id, branch.id).catch(() => null);

  if (!count) notFound();
  if (count.status !== "in_progress") redirect(`/counts/${id}`);

  const location = Array.isArray(count.store_locations) ? count.store_locations[0] : count.store_locations;
  const brand = Array.isArray(count.brands) ? count.brands[0] : count.brands;
  const tag = Array.isArray(count.tags) ? count.tags[0] : count.tags;
  const lines = count.items.map(toCountLine);
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const entries = count.entries.map((entry) => toCountEntry(entry, lineById.get(entry.inventory_count_item_id)));
  const missing = lines.filter((line) => line.counted == null).length;
  const changed = lines.filter((line) => line.variance != null && line.variance !== 0).length;
  const branchLocations = (await getStoreLocations(supabase, companyId)).filter(
    (storeLocation) => storeLocation.branch_id === branch.id,
  );
  const salonProductIds = [
    ...(await getSalonProductIds(
      supabase,
      branch.id,
      lines.map((line) => line.productId),
    )),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/counts/${id}`} className="text-sm text-muted underline">
          Back to counting
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Review count {formatDate(count.count_date)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {[
            location?.name ?? "Whole branch",
            brand?.name,
            classificationLabel(count.filter_classification),
            tag?.name,
            missing > 0 ? `${missing} uncounted` : "All products counted",
            `${changed} variance${changed === 1 ? "" : "s"} to post`,
          ]
            .filter((part) => part && part !== "—")
            .join(" · ")}
        </p>
      </div>

      <CountItemsForm
        countId={count.id}
        items={lines}
        entries={entries}
        locations={branchLocations}
        branchName={branch.name}
        salonProductIds={salonProductIds}
        editable
        mode="review"
      />
    </div>
  );
}
