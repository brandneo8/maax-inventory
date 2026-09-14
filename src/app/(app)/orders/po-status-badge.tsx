import { poStatusLabel, type PoStatus } from "@/lib/labels";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Partial<Record<PoStatus, string>> = {
  sent: "border-green-300 bg-green-50 text-green-700",
  cancelled: "border-red-200 bg-red-50 text-red-700",
};

const DEFAULT_STYLE = "border-border bg-slate-50 text-muted";

export function PoStatusBadge({ status }: { status: PoStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLES[status] ?? DEFAULT_STYLE,
      )}
    >
      {poStatusLabel(status)}
    </span>
  );
}
