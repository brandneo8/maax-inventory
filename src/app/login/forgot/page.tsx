import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { btnClass, fieldClass } from "@/lib/ui";
import { requestPasswordReset } from "./actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <BrandLogo href="/" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Forgot password</h1>
      <p className="mt-2 text-sm text-muted">
        Enter your username or email. We&apos;ll email a link to choose a new password to the account&apos;s email
        address.
      </p>

      {params.error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{params.error}</p>
      ) : null}
      {params.sent ? (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {params.sent}
        </p>
      ) : null}

      <form className="mt-8 space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Username or email</span>
          <input
            id="forgot-login"
            className={fieldClass}
            type="text"
            name="login"
            required
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
          />
        </label>
        <div className="space-y-2">
          <button className={btnClass} formAction={requestPasswordReset} type="submit">
            Email me a reset link
          </button>
          <p className="text-xs text-muted">
            No email on your account? Ask an admin to set a new password for you on the Users page.
          </p>
        </div>
      </form>

      <Link href="/login" className="mt-6 text-sm text-muted underline">
        ← Back to sign in
      </Link>
    </main>
  );
}
