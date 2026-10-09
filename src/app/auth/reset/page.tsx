import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { createClient } from "@/lib/supabase/server";
import { btnClass, fieldClass } from "@/lib/ui";
import { updateOwnPassword } from "./actions";

/** Choose a new password, after following the reset link (which signs you in). */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <BrandLogo href="/" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Choose a new password</h1>

      {!user ? (
        <>
          <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            This reset link has expired or has already been used.
          </p>
          <Link href="/login/forgot" className="mt-6 text-sm underline">
            Request a new reset link
          </Link>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            For {user.email}. You&apos;ll stay signed in once it&apos;s saved.
          </p>
          {params.error ? (
            <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {params.error}
            </p>
          ) : null}
          <form className="mt-8 space-y-4">
            <label className="block space-y-1 text-sm">
              <span>New password</span>
              <input
                id="reset-password"
                className={fieldClass}
                type="password"
                name="password"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Type it again</span>
              <input
                id="reset-password-confirm"
                className={fieldClass}
                type="password"
                name="confirm"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <button className={btnClass} formAction={updateOwnPassword} type="submit">
              Save new password
            </button>
          </form>
        </>
      )}
    </main>
  );
}
