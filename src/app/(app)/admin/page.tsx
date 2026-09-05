import { requireAdmin, isAdminEditUnlocked } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBranches, getSuppliers } from "@/lib/data/lookups";
import { salonName } from "@/lib/labels";
import { btnClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { saveBranchAccess, unlockAdminEdit } from "./actions";
import { SuppliersTable } from "./suppliers-table";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const { supabase, companyId } = await requireAdmin();
  const unlocked = await isAdminEditUnlocked();
  const [suppliers, branches, members] = await Promise.all([
    getSuppliers(supabase, companyId),
    getBranches(supabase, companyId),
    supabase.from("company_users").select("user_id, role").eq("company_id", companyId),
  ]);

  if (members.error) throw members.error;

  const { data: access } = await supabase
    .from("branch_users")
    .select("user_id, branch_id")
    .in(
      "user_id",
      (members.data ?? []).map((member) => member.user_id),
    );

  const admin = createAdminClient();
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 200 });
  const emailById = new Map((users.users ?? []).map((user) => [user.id, user.email ?? ""]));

  const accessSet = new Set((access ?? []).map((row) => `${row.user_id}:${row.branch_id}`));

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-1 text-sm text-muted">
          Manage users, branch access, and suppliers. Editing users needs the admin password.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Users</h2>
        {params.error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {params.error}
          </p>
        ) : null}

        {!unlocked ? (
          <form action={unlockAdminEdit} className="flex max-w-md flex-wrap items-end gap-2">
            <label className="min-w-56 flex-1 space-y-1 text-sm">
              <span>Unlock editing</span>
              <input className={fieldClass} type="password" name="password" required />
            </label>
            <button className={btnClass} type="submit">
              Unlock
            </button>
          </form>
        ) : (
          <p className="text-sm text-ok">Editing is unlocked for this session.</p>
        )}

        <form action={saveBranchAccess}>
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th className={thClass}>User</th>
                  <th className={thClass}>Role</th>
                  {branches.map((branch) => (
                    <th key={branch.id} className={thClass}>
                      {salonName(branch.name)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(members.data ?? []).length === 0 ? (
                  <tr>
                    <td className={tdClass} colSpan={2 + branches.length}>
                      No users yet.
                    </td>
                  </tr>
                ) : (
                  (members.data ?? []).map((member) => (
                    <tr key={member.user_id}>
                      <td className={tdClass}>{emailById.get(member.user_id) || member.user_id}</td>
                      <td className={tdClass}>{member.role}</td>
                      {branches.map((branch) => (
                        <td key={branch.id} className={tdClass}>
                          <input
                            type="checkbox"
                            name={`branch:${member.user_id}:${branch.id}`}
                            defaultChecked={accessSet.has(`${member.user_id}:${branch.id}`)}
                            disabled={!unlocked}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {unlocked ? (
            <button className={`${btnClass} mt-3`} type="submit">
              Save users
            </button>
          ) : null}
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">Suppliers</h2>
        <SuppliersTable
          suppliers={suppliers.map((supplier) => ({
            id: supplier.id,
            supplier_name: supplier.supplier_name,
            poc_name: supplier.poc_name ?? "",
            poc_number: supplier.poc_number ?? "",
            order_channel: supplier.order_channel ?? "",
            gst_registered: supplier.gst_registered,
          }))}
        />
      </section>
    </div>
  );
}
