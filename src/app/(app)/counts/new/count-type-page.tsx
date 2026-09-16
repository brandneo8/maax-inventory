import Link from "next/link";
import { requireBranch } from "@/lib/auth";
import { getLatestPostedCountDate, type CountType } from "@/lib/data/counts";
import { getBrands, getTags } from "@/lib/data/lookups";
import { singaporeToday } from "@/lib/format";
import { CountForm } from "./count-form";

const COPY: Record<CountType, { title: string; description: string }> = {
  regular: {
    title: "New regular count",
    description:
      "Shortfalls cost at the average in effect on the count date; surpluses blend at the branch's current average.",
  },
  opening_balance: {
    title: "New opening balance count",
    description:
      "For SKUs with no reliable cost history. On the review step you'll enter a cost for every counted product yourself.",
  },
};

export async function CountTypeFormPage({ countType }: { countType: CountType }) {
  const { supabase, companyId, branch } = await requireBranch();
  const [brands, tags, latestPostedDate] = await Promise.all([
    getBrands(supabase, companyId),
    getTags(supabase, companyId),
    getLatestPostedCountDate(supabase, companyId, branch.id),
  ]);
  const today = singaporeToday();
  const copy = COPY[countType];

  return (
    <div className="space-y-6">
      <div>
        <Link href="/counts/new" className="text-sm text-muted underline">
          Back
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{copy.title}</h1>
        <p className="mt-1 text-sm text-muted">
          Working in {branch.displayName}. Leave a filter blank to include everything. Expected quantities
          are snapshotted from this salon&apos;s ledger when you start. {copy.description}
        </p>
      </div>

      <CountForm
        key={branch.id}
        countType={countType}
        brands={brands.map((brand) => ({ id: brand.id, label: brand.name }))}
        tags={tags.map((tag) => ({ id: tag.id, label: tag.name }))}
        today={today}
        latestPostedDate={latestPostedDate}
      />
    </div>
  );
}
