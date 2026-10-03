import Link from "next/link";
import { ArrowRight, PackageMinus, PackagePlus, ShoppingBag } from "lucide-react";
import { requireBranch } from "@/lib/auth";
import { workingIn } from "@/lib/ui";

// Named by the task; icons match the sidebar so each card still reads as its page.
const SHORTCUTS = [
  {
    href: "/orders",
    title: "Plan what to order",
    description: "Check balances and usage, then plan and raise purchase orders.",
    icon: ShoppingBag,
  },
  {
    href: "/stock-in",
    title: "Receive orders",
    description: "Receive purchase orders against the invoice, and add free goods.",
    icon: PackagePlus,
  },
  {
    href: "/stock-out",
    title: "Product usage",
    description: "Record products opened for use in the salon.",
    icon: PackageMinus,
  },
];

export default async function HomePage() {
  const { branch } = await requireBranch();

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Home</h1>
        <p className="mt-1 text-sm text-muted">{workingIn(branch.displayName)}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {SHORTCUTS.map(({ href, title, description, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-sky-300 hover:bg-sky-50/40 focus-visible:outline-2 focus-visible:outline-sky-500"
          >
            <div className="flex items-center justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-700 group-hover:bg-sky-100 group-hover:text-sky-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <ArrowRight
                className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-sky-700"
                aria-hidden
              />
            </div>
            <div>
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-muted">{description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
