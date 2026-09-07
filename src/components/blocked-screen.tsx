import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { BrandLogo } from "@/components/brand-logo";
import { btnClass, btnSecondaryClass } from "@/lib/ui";

export function BlockedScreen({ email, isAdmin }: { email: string; isAdmin: boolean }) {
  return (
    <main className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6 py-16">
      <BrandLogo href="/" />
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">No branch access</h1>
      <p className="mt-2 text-sm text-muted">
        You are signed in as {email || "this account"}, but you have not been given access to Min
        Salon or Kin Salon yet. Ask an admin to grant a branch.
      </p>
      <div className="mt-6 flex gap-2">
        {isAdmin ? (
          <Link className={btnClass} href="/admin">
            Open Admin
          </Link>
        ) : null}
        <form action={signOut}>
          <button className={btnSecondaryClass} type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
