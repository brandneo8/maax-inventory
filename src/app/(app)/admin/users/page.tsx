import { DEFAULT_ADMIN_EMAIL, USER_ROLES, requireAdmin, roleOf } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBranches } from "@/lib/data/lookups";
import { salonName } from "@/lib/labels";
import { btnClass, fieldClass, tableClass, tdClass, thClass } from "@/lib/ui";
import { realEmail } from "@/lib/usernames";
import { createUserAccount, saveBranchAccess, setUserPassword } from "../actions";

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; created?: string; saved?: string; passwordSet?: string }>;
}) {
  const { supabase, companyId, user } = await requireAdmin();
  const params = await searchParams;
  const admin = createAdminClient();
  const [branches, members, usersResult, profiles] = await Promise.all([
    getBranches(supabase, companyId),
    supabase.from("company_users").select("user_id, role").eq("company_id", companyId),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("user_profiles").select("user_id, username"),
  ]);
  if (profiles.error) throw profiles.error;
  const usernameById = new Map((profiles.data ?? []).map((profile) => [profile.user_id, profile.username]));

  if (members.error) throw members.error;

  const memberIds = (members.data ?? []).map((member) => member.user_id);
  const { data: access } =
    memberIds.length === 0
      ? { data: [] as { user_id: string; branch_id: string }[] }
      : await supabase.from("branch_users").select("user_id, branch_id").in("user_id", memberIds);

  const emailById = new Map((usersResult.data?.users ?? []).map((account) => [account.id, account.email ?? ""]));
  const accessSet = new Set((access ?? []).map((row) => `${row.user_id}:${row.branch_id}`));
  const nameOf = (userId: string) => usernameById.get(userId) || realEmail(emailById.get(userId)) || userId;
  const sortedMembers = [...(members.data ?? [])].sort((left, right) => nameOf(left.user_id).localeCompare(nameOf(right.user_id)));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="mt-1 text-sm text-muted">
          <strong>Admins</strong> can use every page. <strong>Stylists</strong> only see Home and Reports, for the
          salons ticked below.
        </p>
      </div>

      {params.error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{params.error}</p>
      ) : null}
      {params.created ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Added {params.created}. Share the starting password with them — they sign in with the username{" "}
          <strong>{params.created}</strong> (or their email, once added) and that password.
        </p>
      ) : null}
      {params.saved ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          Users saved.
        </p>
      ) : null}
      {params.passwordSet ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          New password set for <strong>{params.passwordSet}</strong>. Share it with them — they can sign in with it
          straight away.
        </p>
      ) : null}

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Add user</h2>
        <form action={createUserAccount} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="space-y-1 text-sm">
              <span>Username</span>
              <input
                id="new-user-username"
                className={fieldClass}
                name="username"
                required
                pattern="[A-Za-z0-9._\-]{3,30}"
                title="3–30 characters: letters, numbers, dots, dashes or underscores"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>Starting password</span>
              <input
                id="new-user-password"
                className={fieldClass}
                type="text"
                name="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </label>
            <label className="space-y-1 text-sm">
              <span>
                Email <span className="text-muted">(optional, can add later)</span>
              </span>
              <input id="new-user-email" className={fieldClass} type="email" name="email" autoComplete="off" />
            </label>
            <label className="space-y-1 text-sm">
              <span>Role</span>
              <select id="new-user-role" className={fieldClass} name="role" defaultValue="stylist">
                {USER_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="mb-1 text-sm">Salons</legend>
            {branches.map((branch) => (
              <label key={branch.id} className="flex items-center gap-2">
                <input type="checkbox" name={`new-branch:${branch.id}`} defaultChecked={branches.length === 1} />
                {salonName(branch.name)}
              </label>
            ))}
            <span className="text-xs text-muted">Admins can use every salon regardless.</span>
          </fieldset>
          <button className={btnClass} type="submit">
            Add user
          </button>
        </form>
      </section>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div>
          <h2 className="text-lg font-semibold">Set a password</h2>
          <p className="text-sm text-muted">
            For someone who forgot theirs — especially accounts without an email, which can&apos;t use Forgot password
            on the sign-in page. Their old password stops working.
          </p>
        </div>
        <form action={setUserPassword} className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm">
            <span>User</span>
            <select id="set-password-user" className={`${fieldClass} w-56`} name="user_id" required defaultValue="">
              <option value="" disabled>
                Pick a user…
              </option>
              {sortedMembers.map((member) => (
                <option key={member.user_id} value={member.user_id}>
                  {nameOf(member.user_id)}
                  {member.user_id === user.id ? " (you)" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>New password</span>
            <input
              id="set-password-value"
              className={`${fieldClass} w-56`}
              type="text"
              name="password"
              required
              minLength={8}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>
          <button className={btnClass} type="submit">
            Set password
          </button>
        </form>
      </section>

      <form action={saveBranchAccess} className="space-y-3">
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className={tableClass}>
            <thead>
              <tr>
                <th className={thClass}>Username</th>
                <th className={thClass}>Email</th>
                <th className={thClass}>Role</th>
                {branches.map((branch) => (
                  <th key={branch.id} className={thClass}>
                    {salonName(branch.name)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedMembers.length === 0 ? (
                <tr>
                  <td className={tdClass} colSpan={3 + branches.length}>
                    No users yet.
                  </td>
                </tr>
              ) : (
                sortedMembers.map((member) => {
                  const email = realEmail(emailById.get(member.user_id));
                  const label = nameOf(member.user_id);
                  const isDefaultAdmin = email.toLowerCase() === DEFAULT_ADMIN_EMAIL;
                  // You can't demote yourself or the default admin — there's always an admin.
                  const locked = member.user_id === user.id || isDefaultAdmin;
                  return (
                    <tr key={member.user_id}>
                      <td className={tdClass}>
                        <div className="flex items-center gap-1">
                          <input
                            className={`${fieldClass} w-36 py-1.5`}
                            name={`username:${member.user_id}`}
                            defaultValue={usernameById.get(member.user_id) ?? ""}
                            placeholder="Set a username"
                            pattern="[A-Za-z0-9._\-]{3,30}"
                            aria-label={`Username for ${label}`}
                            autoCapitalize="none"
                            spellCheck={false}
                          />
                          {member.user_id === user.id ? <span className="text-xs text-muted">(you)</span> : null}
                        </div>
                      </td>
                      <td className={tdClass}>
                        <input
                          className={`${fieldClass} w-56 py-1.5`}
                          type="email"
                          name={`email:${member.user_id}`}
                          defaultValue={email}
                          placeholder="Add email"
                          readOnly={isDefaultAdmin}
                          title={isDefaultAdmin ? "The default admin's email can't be changed here." : undefined}
                          aria-label={`Email for ${label}`}
                        />
                      </td>
                      <td className={tdClass}>
                        <select
                          className={`${fieldClass} w-auto py-1.5`}
                          name={`role:${member.user_id}`}
                          defaultValue={roleOf(member.role)}
                          disabled={locked}
                          aria-label={`Role for ${label}`}
                          title={locked ? "You can't remove Admin from yourself or the default admin." : undefined}
                        >
                          {USER_ROLES.map((role) => (
                            <option key={role.value} value={role.value}>
                              {role.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      {branches.map((branch) => (
                        <td key={branch.id} className={tdClass}>
                          <input
                            type="checkbox"
                            name={`branch:${member.user_id}:${branch.id}`}
                            defaultChecked={accessSet.has(`${member.user_id}:${branch.id}`)}
                            aria-label={`${salonName(branch.name)} access for ${label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <button className={btnClass} type="submit">
          Save users
        </button>
      </form>
    </div>
  );
}
