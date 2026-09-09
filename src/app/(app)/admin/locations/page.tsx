import { requireAdmin } from "@/lib/auth";
import { getBranches, getStoreLocations } from "@/lib/data/lookups";
import { LocationsEditor } from "./locations-editor";

export default async function AdminLocationsPage() {
  const { supabase, companyId } = await requireAdmin();
  const [branches, locations] = await Promise.all([
    getBranches(supabase, companyId),
    getStoreLocations(supabase, companyId),
  ]);
  const orderedBranches = [...branches].sort((left, right) => {
    const rank = (name: string) =>
      name.trim().toLowerCase() === "min" ? 0 : name.trim().toLowerCase() === "kin" ? 1 : 2;
    return rank(left.name) - rank(right.name) || left.name.localeCompare(right.name);
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Locations</h1>
        <p className="mt-1 text-sm text-muted">
          Set the count locations for Min and Kin. New counts include every location listed here.
        </p>
      </div>
      <LocationsEditor
        branches={orderedBranches.map((branch) => ({
          id: branch.id,
          name: branch.name,
          locations: locations
            .filter((location) => location.branch_id === branch.id)
            .map((location) => ({ id: location.id, name: location.name })),
        }))}
      />
    </div>
  );
}
