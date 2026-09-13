-- Invoices are no longer modeled as a separate data object. A received
-- purchase order (goods_receipts) now just carries a free-text invoice
-- reference and an attached file — no amount/status tracking, no line items.
-- Confirmed with the user: no real invoice data exists yet, safe to drop.

drop view if exists invoice_reconciliation;
drop function if exists fn_generate_invoice_items_from_receipt(uuid, uuid);

alter table goods_receipts drop column if exists invoice_id;

drop table if exists invoice_items;
drop table if exists invoices;
drop type if exists invoice_status;

alter table goods_receipts add column if not exists invoice_reference text;
alter table goods_receipts add column if not exists invoice_attachment_url text;
comment on column goods_receipts.invoice_reference is 'Free-text reference to the supplier invoice (e.g. invoice number). Not a linked data object.';
comment on column goods_receipts.invoice_attachment_url is 'Public URL of the attached invoice file in the invoice-attachments storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'invoice-attachments',
  'invoice-attachments',
  true,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
