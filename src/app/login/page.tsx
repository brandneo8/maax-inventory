import { BrandLogo } from "@/components/brand-logo";
import { btnClass, fieldClass } from "@/lib/ui";
import { signIn, signUp } from "./actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-16">
      <BrandLogo href="/" />
      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-muted">
        Sign in to order and receive stock for Min and Kin.
      </p>

      {params.error ? (
        <p className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {params.error}
        </p>
      ) : null}
      {params.message ? (
        <p className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {params.message}
        </p>
      ) : null}

      <form className="mt-8 space-y-4">
        <label className="block space-y-1 text-sm">
          <span>Email</span>
          <input className={fieldClass} type="email" name="email" required autoComplete="email" />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Password</span>
          <input
            className={fieldClass}
            type="password"
            name="password"
            required
            minLength={6}
            autoComplete="current-password"
          />
        </label>
        <div className="flex gap-2">
          <button className={btnClass} formAction={signIn} type="submit">
            Sign in
          </button>
          <button
            className="inline-flex items-center justify-center rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            formAction={signUp}
            type="submit"
          >
            Create account
          </button>
        </div>
      </form>
    </main>
  );
}
