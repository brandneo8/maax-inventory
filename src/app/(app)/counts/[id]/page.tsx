import Link from "next/link";
import { notFound } from "next/navigation";
import { requireBranch } from "@/lib/auth";
import { getInventoryCount } from "@/lib/data/counts";
import { getStoreLocations } from "@/lib/data/lookups";
import { formatDate } from "@/lib/format";
import { classificationLabel, countStatusLabel } from "@/lib/labels";
import { toCountEntry, toCountLine } from "../count-lines";
import { CountItemsForm } from "./count-items-form";
import { CountRecordAction } from "../delete-count-button";

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
  const lineById = new Map(lines.map((line) => [line.id, line]));
  const entries = count.entries.map((entry) => toCountEntry(entry, lineById.get(entry.inventory_count_item_id)));
  const branchLocations = (await getStoreLocations(supabase, companyId)).filter(
    (storeLocation) => storeLocation.branch_id === branch.id,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
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
              countStatusLabel(count.status),
            ]
              .filter((part) => part && part !== "—")
              .join(" · ")}
          </p>
        </div>
        {count.status === "in_progress" ? (
          <CountRecordAction countId={count.id} kind="delete" />
        ) : count.status === "completed" ? (
          <CountRecordAction countId={count.id} kind="void" />
        ) : null}
      </div>

      <CountItemsForm
        countId={count.id}
        items={lines}
        entries={entries}
        locations={branchLocations}
        branchName={branch.name}
        editable={open}
        mode="count"
      />
    </div>
  );
}
