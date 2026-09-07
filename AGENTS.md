<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Live Supabase data (all agents)

The linked project `tfetufbblqvjutzonyte` is the live MAAX database. Catalog, stock, supplier, and user rows must survive every schema change.

- Apply schema with `bun run db:push` only (backup, then `supabase db push`).
- New migrations must be additive (`add column if not exists`, `create table if not exists`, `create or replace function`).
- Never run `supabase db reset` (including `--linked`). Never apply `supabase/schema.sql` to remote — it is a reference copy only.
- Never `drop table`, `truncate`, or `delete from` live catalog/stock tables in a migration.
- Do not replay `20260905140000_maax_salon_schema.sql`.
- Unsaved Admin table edits are browser-only. Save products/suppliers before a schema push.
- Bundle contents live in `product_components`. Never drop, truncate, or recreate that table. Schema pushes must keep existing kit BOMs.
