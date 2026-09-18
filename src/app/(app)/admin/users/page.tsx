import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBranches } from "@/lib/data/lookups";
import { salonName } from "@/lib/labels";
import { btnClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { saveBranchAccess } from "../actions";

export default async function AdminUsersPage() {
  const { supabase, companyId } = await requireAdmin();
  const admin = createAdminClient();
  const [branches, members, usersResult] = await Promise.all([
    getBranches(supabase, companyId),
    supabase.from("company_users").select("user_id, role").eq("company_id", companyId),
    admin.auth.admin.listUsers({ perPage: 200 }),
  ]);

  if (members.error) throw members.error;

  const memberIds = (members.data ?? []).map((member) => member.user_id);
  const { data: access } =
    memberIds.length === 0
      ? { data: [] as { user_id: string; branch_id: string }[] }
      : await supabase.from("branch_users").select("user_id, branch_id").in("user_id", memberIds);

  const emailById = new Map((usersResult.data?.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const accessSet = new Set((access ?? []).map((row) => `${row.user_id}:${row.branch_id}`));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted">Tick a salon to grant that user access.</p>
      </div>

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
                        />
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <button className={`${btnClass} mt-3`} type="submit">
          Save users
        </button>
      </form>
    </div>
  );
}
