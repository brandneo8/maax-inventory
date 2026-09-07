import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getBrands, getStoreLocations, getTags } from "@/lib/data/lookups";
import { CountForm } from "./count-form";

export default async function NewCountPage() {
  const { supabase, companyId, branch } = await requireBranch();
  const [locations, brands, tags] = await Promise.all([
    getStoreLocations(supabase, companyId),
    getBrands(supabase, companyId),
    getTags(supabase, companyId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/counts" className="text-sm text-muted underline">
          Back to counts
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New inventory count</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Leave a filter blank to include everything. Expected
          quantities are snapshotted from this salon&apos;s ledger when you start.
        </p>
      </div>

      <CountForm
        key={branch.id}
        locations={locations
          .filter((location) => location.branch_id === branch.id)
          .map((location) => ({ id: location.id, label: location.name }))}
        brands={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
        tags={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
      />
    </div>
  );
}
