"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveStoreLocations } from "../actions";
import { salonName } from "@/lib/labels";
import { btnClass, btnSecondaryClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";

type LocationRow = { key: string; id: string; name: string };

type BranchGroup = {
  id: string;
  name: string;
  locations: LocationRow[];
};

function newKey() {
  return `new-${Math.random().toString(36).slice(2, 10)}`;
}

export function LocationsEditor({
  branches,
}: {
  branches: { id: string; name: string; locations: { id: string; name: string }[] }[];
}) {
  const [groups, setGroups] = useState<BranchGroup[]>(() =>
    branches.map((branch) => ({
      id: branch.id,
      name: branch.name,
      locations: branch.locations.map((location) => ({
        key: location.id,
        id: location.id,
        name: location.name,
      })),
    })),
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  function setName(branchId: string, key: string, name: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id !== branchId
          ? group
          : {
              ...group,
              locations: group.locations.map((location) =>
                location.key === key ? { ...location, name } : location,
              ),
            },
      ),
    );
  }

  function addLocation(branchId: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id !== branchId
          ? group
          : { ...group, locations: [...group.locations, { key: newKey(), id: "", name: "" }] },
      ),
    );
  }

  function removeLocation(branchId: string, key: string) {
    setGroups((current) =>
      current.map((group) =>
        group.id !== branchId
          ? group
          : { ...group, locations: group.locations.filter((location) => location.key !== key) },
      ),
    );
  }

  async function onSubmit(formData: FormData) {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await saveStoreLocations(formData);
      setMessage("Locations saved.");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save locations.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>
      ) : null}
      {message ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {message}
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <section key={group.id} className="space-y-3 rounded-xl border border-border bg-card p-4">
            <h2 className="text-lg font-semibold">{salonName(group.name)}</h2>
            <input type="hidden" name={`count:${group.id}`} value={group.locations.length} />
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th className={thClass}>Location</th>
                    <th className={thClass} />
                  </tr>
                </thead>
                <tbody>
                  {group.locations.length === 0 ? (
                    <tr>
                      <td className={tdClass} colSpan={2}>
                        No count locations yet.
                      </td>
                    </tr>
                  ) : (
                    group.locations.map((location, index) => (
                      <tr key={location.key}>
                        <td className={tdClass}>
                          <input type="hidden" name={`id:${group.id}:${index}`} value={location.id} />
                          <input
                            className={fieldClass}
                            name={`name:${group.id}:${index}`}
                            value={location.name}
                            onChange={(event) => setName(group.id, location.key, event.target.value)}
                            placeholder="Store room"
                            required
                          />
                        </td>
                        <td className={tdClass}>
                          <button
                            className="text-sm text-muted underline"
                            type="button"
                            onClick={() => removeLocation(group.id, location.key)}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <button className={btnSecondaryClass} type="button" onClick={() => addLocation(group.id)}>
              Add location
            </button>
          </section>
        ))}
      </div>
      <button className={btnClass} type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save locations"}
      </button>
    </form>
  );
}
