# Maax Inventory

Inventory tracking app built with TypeScript, Next.js, Supabase, and Vercel.

## Local setup

You need [Bun](https://bun.sh) (already used by this repo) or Node.js with npm.

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). The home page shows which environment variables are still missing.

### Environment variables

This repo is linked to the Supabase project `tfetufbblqvjutzonyte` (maax-inventory).

1. Copy `.env.example` to `.env.local` if you need a fresh file.
2. Local keys for this project are already in `.env.local` on this machine.
3. Open **Project Settings → API** if you ever need to rotate keys:

| Variable | Where to find it | Used by |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL | Browser and server |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable / anon key | Browser and server |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (secret) | Server only |
| `SUPABASE_PROJECT_ID` | Project Settings → General → Reference ID | CLI / linking |

`.env.local` is gitignored. Do not commit real keys.

Restart `bun run dev` after you change `.env.local`.

### Database

The starter schema lives in `supabase/migrations/20260905100000_inventory.sql`.

It creates:

- `items` — SKU, name, quantity, location, reorder level
- `stock_movements` — receive / sale / adjust / waste / return

Each row is scoped to the signed-in user (`user_id`) with Row Level Security, same pattern as LedgerLight.

To apply it: Supabase dashboard → **SQL Editor** → paste the file → **Run**.

Later you can install the [Supabase CLI](https://supabase.com/docs/guides/local-development) and run `supabase link` instead.

## Deploy on Vercel

1. Push this repo to GitHub.
2. Import it at [vercel.com/new](https://vercel.com/new).
3. Add the same environment variables from `.env.local`.
4. Deploy.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the local app |
| `bun run build` | Production build |
| `bun run lint` | Lint |
| `bun run typecheck` | TypeScript check |
| `bun run format` | Format with Prettier |
