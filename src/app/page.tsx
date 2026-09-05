import { CheckCircle2, Circle, Database, KeyRound, Rocket } from "lucide-react";
import { getSetupStatus, isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

async function isInventorySchemaReady() {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("items").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

function StatusRow({
  done,
  label,
  hint,
}: {
  done: boolean;
  label: string;
  hint: string;
}) {
  return (
    <li className="flex gap-3 rounded-xl border border-border bg-card p-4">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" aria-hidden />
      ) : (
        <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-hidden />
      )}
      <div>
        <p className="font-medium">{label}</p>
        <p className="mt-1 text-sm text-muted">{hint}</p>
      </div>
    </li>
  );
}

function EnvBadge({ ok, name }: { ok: boolean; name: string }) {
  return (
    <li className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <code className="font-mono text-xs sm:text-sm">{name}</code>
      <span className={ok ? "font-medium text-ok" : "font-medium text-pending"}>
        {ok ? "Set" : "Missing"}
      </span>
    </li>
  );
}

export default async function Home() {
  const supabaseReady = isSupabaseConfigured();
  const schemaReady = await isInventorySchemaReady();
  const env = getSetupStatus();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-10 px-6 py-16">
      <header className="space-y-3">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Maax Inventory</p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Connected to your Supabase project
        </h1>
        <p className="max-w-2xl text-muted">
          Local keys and the starter inventory tables are in place on{" "}
          <code className="rounded bg-white px-1.5 py-0.5 font-mono text-sm">tfetufbblqvjutzonyte</code>.
          Next step is deploying this repo on Vercel with the same environment variables.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Setup checklist</h2>
        <ol className="space-y-3">
          <StatusRow
            done
            label="App project created"
            hint="Next.js, TypeScript, Tailwind, and the folder layout are already in this repo."
          />
          <StatusRow
            done={supabaseReady}
            label="Supabase keys added"
            hint="Project URL and publishable key are loaded from .env.local."
          />
          <StatusRow
            done={schemaReady}
            label="Inventory tables created"
            hint="items and stock_movements are on the remote database, with per-user Row Level Security."
          />
          <StatusRow
            done={false}
            label="Deploy on Vercel"
            hint="Import this GitHub repo in Vercel and add the same environment variables there."
          />
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <KeyRound className="size-5" aria-hidden />
          Environment variables
        </h2>
        <ul className="space-y-2">
          <EnvBadge ok={env.supabaseUrl} name="NEXT_PUBLIC_SUPABASE_URL" />
          <EnvBadge ok={env.publishableKey} name="NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" />
          <EnvBadge ok={env.serviceRoleKey} name="SUPABASE_SERVICE_ROLE_KEY" />
          <EnvBadge ok={env.projectId} name="SUPABASE_PROJECT_ID" />
        </ul>
        <p className="text-sm text-muted">
          Values stay on this machine. This page only shows whether each variable is filled in.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <a
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-slate-400"
          href="https://supabase.com/dashboard/project/tfetufbblqvjutzonyte"
          target="_blank"
          rel="noreferrer"
        >
          <Database className="mb-3 size-5" aria-hidden />
          <p className="font-medium">Open Supabase</p>
          <p className="mt-1 text-sm text-muted">Project maax-inventory in Tokyo.</p>
        </a>
        <a
          className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-slate-400"
          href="https://vercel.com/new"
          target="_blank"
          rel="noreferrer"
        >
          <Rocket className="mb-3 size-5" aria-hidden />
          <p className="font-medium">Open Vercel</p>
          <p className="mt-1 text-sm text-muted">Deploy this GitHub repository when you are ready.</p>
        </a>
      </section>
    </main>
  );
}
