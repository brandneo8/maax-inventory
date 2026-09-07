import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function BrandLogo({
  collapsed = false,
  href = "/home",
}: {
  collapsed?: boolean;
  href?: string;
}) {
  return (
    <Link
      href={href}
      className={cn("app-brand-logo", collapsed && "app-brand-logo-collapsed")}
      aria-label="Pulse, go to home"
    >
      <span className="app-brand-logo-image">
        <Image
          src="/pulse-logo.png"
          alt="Pulse"
          fill
          sizes={collapsed ? "56px" : "220px"}
          className="object-contain object-center"
          preload
        />
      </span>
    </Link>
  );
}
