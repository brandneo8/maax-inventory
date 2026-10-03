import { requireBranch } from "@/lib/auth";
import { workingIn } from "@/lib/ui";

export default async function HomePage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold">Products</h2>
        <p className="mt-1 text-sm text-muted">
          Look up any product&apos;s balance at {branch.displayName} from the <strong>Products</strong> tab on the
          right edge of every page — search by name, SKU or barcode, then click a product for its full in/out
          history.
        </p>
      </div>
    </div>
  );
}
