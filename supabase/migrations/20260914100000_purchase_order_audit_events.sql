-- Audit trail for purchase order actions (e.g. "marked sent") — who did it
-- and any remarks, shown at the bottom of the order detail page.
create table if not exists purchase_order_audit_events (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  event_type         text not null,
  actor_name         text not null,
  remarks            text,
  created_at         timestamptz not null default now()
);
comment on table purchase_order_audit_events is 'Audit trail for purchase order status actions (e.g. marked sent). actor_name is a free-standing staff name, not a linked user account.';

alter table purchase_order_audit_events enable row level security;
drop policy if exists purchase_order_audit_events_company_isolation on purchase_order_audit_events;
create policy purchase_order_audit_events_company_isolation on purchase_order_audit_events
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

grant select, insert, update, delete on public.purchase_order_audit_events to authenticated;
grant all on public.purchase_order_audit_events to service_role;

create index if not exists idx_po_audit_events_po on purchase_order_audit_events (purchase_order_id, created_at);

notify pgrst, 'reload schema';
