-- Let staff attach a reference image (e.g. a photo of the retail/tester
-- shelf) to a stock-out report, shown beside the line summary table.
alter table stock_out_reports add column if not exists attachment_url text;
comment on column stock_out_reports.attachment_url is 'Public URL of an optional reference image in the stock-out-attachments storage bucket.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stock-out-attachments',
  'stock-out-attachments',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';
