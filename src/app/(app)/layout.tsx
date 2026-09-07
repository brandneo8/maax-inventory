import { AppShell } from "@/components/app-shell";
import { BlockedScreen } from "@/components/blocked-screen";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, allowedBranches, branch } = await requireUser();

  if (allowedBranches.length === 0 && !isAdmin) {
    return <BlockedScreen email={user.email ?? ""} isAdmin={false} />;
  }

  return (
    <AppShell
      email={user.email ?? ""}
      isAdmin={isAdmin}
      allowedBranches={allowedBranches}
      branch={branch}
    >
      {children}
    </AppShell>
  );
}
