-- Retail use and in-house use are now distinct ledger types, not just a
-- classification column on top of the same txn_type. Retail margin and
-- in-house service margin are different costing questions to the
-- business, so they need to be separable in the ledger itself:
--   - retail_use: reserved for genuine POS retail sales, always a
--     deduction, sourced from the (currently dormant) /import pathway
--     that reads external sales reports -- never written by anything
--     inside the app itself.
--   - inhouse_use: everything entered natively in Pulse that consumes
--     stock without a POS sale behind it -- stock-out entries going
--     forward.
--   - gwp_use: unchanged, still a distinct bucket.
-- Kept as its own migration (not combined with the functions that use
-- it) because Postgres won't let a new enum value be referenced by a
-- later statement in the same transaction it was added in.
alter type inventory_txn_type add value if not exists 'inhouse_use';

notify pgrst, 'reload schema';
