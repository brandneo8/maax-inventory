# MAAX Inventory

Inventory system for MAAX PTE LTD (Min and Kin). TypeScript, Next.js, Supabase, Vercel.

See `docs/PROJECT_HANDOFF.md` and `supabase/schema.sql` for the v2 data model.

## What is built

- Company-scoped schema with Row Level Security
- Seeded company, Min/Kin branches, stock rooms, GST 9%, and product tags
- Sign in / create account (new users join MAAX PTE LTD automatically)
- Import retail-use from the external sales system (manual or CSV)
- Export the retail product stock file for that external system
- Products, purchase orders (create, send, receive), and Admin (suppliers + branch access)
- Reports is reserved for costing / low stock later

Not in this pass: invoices, inventory counts, best-seller reporting.

## Local setup

```sh
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). Create an account, then add a supplier and products before placing an order.

If sign-up succeeds but you cannot sign in, turn off **Confirm email** in the [Supabase Auth settings](https://supabase.com/dashboard/project/tfetufbblqvjutzonyte/auth/providers).

`.env.local` is already filled on this machine and is gitignored.

## Scripts

| Command | What it does |
| --- | --- |
| `bun run dev` | Start the local app |
| `bun run build` | Production build |
| `bun run lint` | Lint |
| `bun run typecheck` | TypeScript check |
