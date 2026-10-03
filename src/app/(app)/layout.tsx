import { AppShell } from "@/components/app-shell";
import { BlockedScreen } from "@/components/blocked-screen";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { displayName, isAdmin, allowedBranches, branch } = await requireUser();

  if (allowedBranches.length === 0 && !isAdmin) {
    return <BlockedScreen email={displayName} isAdmin={false} />;
  }

  return (
    <AppShell
      email={displayName}
      isAdmin={isAdmin}
      allowedBranches={allowedBranches}
      branch={branch}
    >
      {children}
    </AppShell>
  );
}
