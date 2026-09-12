-- =============================================================================
-- MAAX Salon Inventory System — Database Schema (Postgres / Supabase)
-- =============================================================================
-- Draft v2 — incorporates client answers to v1's open questions.
-- See PROJECT_HANDOFF.md for rationale, remaining open items, and the
-- workflow-by-workflow explanation of how these tables are used.
-- =============================================================================

create extension if not exists "pgcrypto";   -- gives us gen_random_uuid()

-- -----------------------------------------------------------------------------
-- ENUMS
-- -----------------------------------------------------------------------------

create type po_status as enum (
  'draft', 'sent', 'confirmed', 'partially_received', 'received', 'cancelled'
);

create type invoice_status as enum (
  'unpaid', 'partial', 'paid', 'disputed'
);

create type product_classification as enum (
  'retail', 'inhouse', 'gwp', 'retail_inhouse'
);

create type inventory_txn_type as enum (
  'goods_receipt', 'retail_use', 'count_adjustment', 'transfer', 'waste', 'gwp_use', 'initial_stock'
);

create type order_channel as enum (
  'email', 'phone', 'portal', 'whatsapp', 'other'
);

-- -----------------------------------------------------------------------------
-- CORE / TENANCY
-- -----------------------------------------------------------------------------

create table companies (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  created_at               timestamptz not null default now(),
  catalog_saved_at         timestamptz,
  catalog_saved_by_email   text
);
comment on table companies is 'Tenant/customer of the system. Single row (MAAX PTE LTD) for now.';

create table company_users (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member',
  created_at  timestamptz not null default now(),
  unique (company_id, user_id)
);
comment on table company_users is 'Maps Supabase auth users to the company/companies they can access. Every RLS policy below is built on this table.';

create table branches (
  id                        uuid primary key default gen_random_uuid(),
  company_id                uuid not null references companies(id) on delete cascade,
  name                      text not null,
  branch_manager_name       text,
  branch_manager_contact    text,
  inventory_manager_name    text,
  inventory_manager_contact text,
  address                   text,
  created_at                timestamptz not null default now(),
  unique (company_id, name)
);

create table store_locations (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branches(id) on delete cascade,
  parent_location_id uuid references store_locations(id) on delete set null,
  name               text not null,
  description        text,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  unique (branch_id, name)
);
comment on table store_locations is 'User-defined areas within a branch. parent_location_id allows nesting later; leave null for a flat list.';

create table tax_rates (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  name            text not null,
  rate_percentage numeric(5,2) not null,
  is_default      boolean not null default false
);

-- -----------------------------------------------------------------------------
-- PRODUCT CATALOG (brands, tags, products)
-- -----------------------------------------------------------------------------

create table brands (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  unique (company_id, name)
);

create table tags (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  unique (company_id, name)
);
comment on table tags is 'Controlled vocabulary for product categorisation: wash, treatment, colour, retexturise, styling, Bundle.';

create table suppliers (
  id              uuid primary key default gen_random_uuid(),
  company_id      uuid not null references companies(id) on delete cascade,
  supplier_name   text not null,
  poc_name        text,
  poc_number      text,
  order_channel   order_channel,
  gst_registered  boolean not null default false,
  created_at      timestamptz not null default now()
);

create table products (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  sku                    text,
  barcode                text,
  order_name             text not null,
  name                   text,
  description            text,
  brand_id               uuid references brands(id),
  unit_cost_price        numeric(12,2) not null default 0,
  tax_rate_id            uuid references tax_rates(id),
  rrp                    numeric(12,2),
  crp                    numeric(12,2) generated always as (
    case
      when rrp is not null and rrp > 0 then rrp
      else unit_cost_price * 2
    end
  ) stored,
  picture_url            text,
  default_classification product_classification,   -- suggested default; the AUTHORITATIVE classification is set per purchase_order_item (see below)
  low_stock_threshold    numeric(12,2),
  is_active              boolean not null default true,
  created_at             timestamptz not null default now(),
  size_label             text,
  size_ml                numeric(12, 3),
  is_set                 boolean not null default false,
  brand_sub              text,
  available_in_tunai     boolean not null default false,
  unique (company_id, sku),
  check (sku is null or length(btrim(sku)) > 0),
  check (barcode is null or length(btrim(barcode)) > 0)
);
comment on table products is 'No quantity column — on-hand quantity is derived per store_location from inventory_transactions (bottom of file). No tags array — tags are structured via product_tags below.';
comment on column products.order_name is 'Official product title used on orders and receiving. Required.';
comment on column products.name is 'Optional short name staff use to recognize the SKU in the app. Null when unset.';
comment on column products.crp is 'Confirmed retail price. Uses RRP when RRP > 0, otherwise unit_cost_price × 2.';
comment on column products.sku is 'Optional. Unique per company when present. Blank SKUs are stored as NULL.';
comment on column products.barcode is 'Optional. Unique per company when present. Blank barcodes are stored as NULL.';
comment on column products.default_classification is 'Suggested default type; mirrors one of product_classifications for legacy single-value consumers (PO line defaulting, count filter, CSV/report Type column). Maintained by trg_sync_product_classification_summary — the AUTHORITATIVE classification for a purchase is set per purchase_order_item (see below).';
comment on column products.available_in_tunai is 'True when product_classifications includes retail or gwp for this product. Maintained by trg_sync_product_classification_summary; do not write to it directly.';

create table product_tags (
  product_id  uuid not null references products(id) on delete cascade,
  tag_id      uuid not null references tags(id) on delete cascade,
  primary key (product_id, tag_id)
);

create table product_classifications (
  product_id      uuid not null references products(id) on delete cascade,
  classification  product_classification not null,
  primary key (product_id, classification)
);
comment on table product_classifications is 'Multi-tag product type. A product can carry more than one classification (e.g. retail and inhouse together). products.default_classification and products.available_in_tunai are kept in sync from this table by trigger (see trg_sync_product_classification_summary near the bottom of this file).';

create table product_branches (
  product_id  uuid not null references products(id) on delete cascade,
  branch_id   uuid not null references branches(id) on delete cascade,
  primary key (product_id, branch_id)
);
comment on table product_branches is 'Which branches show this product on /products. Ticked by admin on the catalog table.';

create table product_components (
  set_product_id        uuid not null references products(id) on delete cascade,
  component_product_id  uuid not null references products(id) on delete restrict,
  quantity              numeric(12, 3) not null default 1,
  allocated_cost        numeric(12,2),
  primary key (set_product_id, component_product_id),
  check (set_product_id <> component_product_id),
  check (quantity > 0)
);
comment on table product_components is 'Bill of materials for bundle SKUs. One row per component in the bundle.';
comment on column product_components.allocated_cost is 'Share of the parent bundle unit cost for this component line. Child unit cost is allocated_cost / quantity.';

create table supplier_products (
  id                   uuid primary key default gen_random_uuid(),
  supplier_id          uuid not null references suppliers(id) on delete cascade,
  product_id           uuid not null references products(id) on delete cascade,
  supplier_sku         text,
  supplier_cost_price  numeric(12,2),
  is_preferred         boolean not null default false,
  unique (supplier_id, product_id)
);

-- -----------------------------------------------------------------------------
-- PURCHASING
-- -----------------------------------------------------------------------------

create table purchase_orders (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  branch_id              uuid not null references branches(id),   -- confirmed: one branch per PO
  supplier_id            uuid not null references suppliers(id),
  po_number              text not null,
  status                 po_status not null default 'draft',      -- a PO represents an "unreceived order" until status = received
  order_date             date,
  expected_delivery_date date,
  created_by             text,
  notes                  text,
  created_at             timestamptz not null default now(),
  unique (company_id, po_number)
);

create table purchase_order_items (
  id                 uuid primary key default gen_random_uuid(),
  purchase_order_id  uuid not null references purchase_orders(id) on delete cascade,
  product_id         uuid not null references products(id),
  classification     product_classification not null,     -- confirmed: type is tagged per PO line, one line = one product
  quantity_ordered   numeric(12,2) not null,
  quantity_received  numeric(12,2) not null default 0,      -- maintained by trigger as goods_receipt_items come in
  unit_price         numeric(12,2) not null,
  tax_rate_id        uuid references tax_rates(id),
  line_total         numeric(14,2) generated always as (quantity_ordered * unit_price) stored
);

-- -----------------------------------------------------------------------------
-- INVOICES
-- -----------------------------------------------------------------------------

create table invoices (
  id                       uuid primary key default gen_random_uuid(),
  company_id               uuid not null references companies(id) on delete cascade,
  branch_id                uuid not null references branches(id),   -- confirmed: one branch per invoice
  supplier_id              uuid not null references suppliers(id),
  purchase_order_id        uuid references purchase_orders(id),
  invoice_number           text not null,
  invoice_date             date not null,
  total_amount             numeric(14,2),
  total_tax_amount         numeric(14,2),
  total_gross_amount       numeric(14,2),
  purchase_discount_amount numeric(14,2) not null default 0,
  status                   invoice_status not null default 'unpaid',
  created_at               timestamptz not null default now(),
  unique (company_id, supplier_id, invoice_number)
);

-- -----------------------------------------------------------------------------
-- RECEIVING
-- -----------------------------------------------------------------------------

create table goods_receipts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  purchase_order_id  uuid references purchase_orders(id),
  branch_id          uuid not null references branches(id),
  invoice_id         uuid references invoices(id),
  received_date      date not null default current_date,
  received_by        text,
  notes              text,
  created_at         timestamptz not null default now()
);

create table goods_receipt_items (
  id                       uuid primary key default gen_random_uuid(),
  goods_receipt_id         uuid not null references goods_receipts(id) on delete cascade,
  purchase_order_item_id   uuid references purchase_order_items(id),  -- null only for ad-hoc receipts with no PO
  product_id               uuid not null references products(id),
  store_location_id        uuid not null references store_locations(id),
  quantity_received        numeric(12,2) not null,
  unit_cost                numeric(12,2) not null,
  purchase_discount_amount numeric(12,2) not null default 0,
  classification           product_classification    -- auto-filled from purchase_order_item if linked; required otherwise (see trigger below)
);

create table invoice_items (
  id                       uuid primary key default gen_random_uuid(),
  invoice_id               uuid not null references invoices(id) on delete cascade,
  goods_receipt_item_id    uuid references goods_receipt_items(id),   -- traceability + sync source
  product_id               uuid not null references products(id),
  quantity                 numeric(12,2) not null,
  unit_price               numeric(12,2) not null,
  tax_amount               numeric(12,2) not null default 0,
  purchase_discount_amount numeric(12,2) not null default 0,
  line_total               numeric(14,2) generated always as (quantity * unit_price - purchase_discount_amount + tax_amount) stored
);

-- -----------------------------------------------------------------------------
-- INVENTORY LEDGER  (single source of truth for stock on hand)
-- -----------------------------------------------------------------------------

create table inventory_transactions (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  product_id         uuid not null references products(id),
  store_location_id  uuid not null references store_locations(id),
  txn_type           inventory_txn_type not null,
  quantity_change    numeric(12,2) not null,
  reference_table    text,
  reference_id       uuid,
  txn_date           timestamptz not null default now(),
  created_by         text,
  notes              text
);
comment on table inventory_transactions is 'Append-only ledger. Never write to a quantity column directly — current_stock view derives on-hand quantity from this.';

create index idx_inventory_txn_product_location on inventory_transactions (product_id, store_location_id);
create index idx_inventory_txn_company_date on inventory_transactions (company_id, txn_date);

-- -----------------------------------------------------------------------------
-- RETAIL-USE REPORTING (round-trip with the external retail system)
-- -----------------------------------------------------------------------------

create table report_exports (
  id             uuid primary key default gen_random_uuid(),
  company_id     uuid not null references companies(id) on delete cascade,
  branch_id      uuid references branches(id),
  report_type    text not null,
  period_start   date,
  period_end     date,
  generated_by   text,
  generated_at   timestamptz not null default now(),
  file_reference text
);

create table retail_use_entries (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid not null references companies(id) on delete cascade,
  branch_id          uuid not null references branches(id),
  product_id         uuid not null references products(id),
  store_location_id  uuid references store_locations(id),
  quantity_used      numeric(12,2) not null,
  entry_date         date not null,
  external_reference text,
  keyed_in_by        text,
  notes              text,
  created_at         timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- INVENTORY COUNTS
-- -----------------------------------------------------------------------------

create table inventory_counts (
  id                     uuid primary key default gen_random_uuid(),
  company_id             uuid not null references companies(id) on delete cascade,
  branch_id              uuid not null references branches(id),
  store_location_id      uuid references store_locations(id),     -- null = whole branch
  filter_brand_id        uuid references brands(id),               -- optional scope: count only this brand
  filter_classification  product_classification,                   -- optional scope: count only this type
  filter_tag_id          uuid references tags(id),                 -- optional scope: count only products with this tag
  additional_filters     jsonb,                                    -- reserved for any other ad-hoc product-column filter (see handoff)
  status                 text not null default 'in_progress',
  count_date             date not null default current_date,
  counted_by             text,
  created_at             timestamptz not null default now()
);
comment on table inventory_counts is 'Scope of a count session can be a location, a brand, a type/classification, a tag, or any combination — the app resolves which products fall in scope from the filter_* columns before creating inventory_count_items.';

create table inventory_count_items (
  id                 uuid primary key default gen_random_uuid(),
  inventory_count_id uuid not null references inventory_counts(id) on delete cascade,
  product_id         uuid not null references products(id),
  store_location_id  uuid references store_locations(id),
  expected_quantity  numeric(12,2),
  counted_quantity   numeric(12,2),
  variance           numeric(12,2) generated always as (counted_quantity - expected_quantity) stored,
  notes              text,
  unique (inventory_count_id, product_id)
);
comment on column inventory_count_items.store_location_id is 'Unused for uniqueness. Count lines are one row per product; room notes live on entries.';
alter table inventory_count_items replica identity full;

create table inventory_count_entries (
  id                       uuid primary key default gen_random_uuid(),
  inventory_count_id       uuid not null references inventory_counts(id) on delete cascade,
  inventory_count_item_id  uuid not null references inventory_count_items(id) on delete cascade,
  store_location_id        uuid references store_locations(id) on delete set null,
  quantity_delta           numeric(12,2) not null,
  created_at               timestamptz not null default now(),
  created_by               text
);
comment on table inventory_count_entries is 'Additive count scans. counted_quantity on inventory_count_items is the running total of these deltas. store_location_id is the room remark for that scan.';
comment on column inventory_count_entries.store_location_id is 'Optional room where this scan was found. Does not split on-hand or count lines.';
alter table inventory_count_entries replica identity full;

create or replace function search_products_for_count(
  p_company_id uuid,
  p_branch_id uuid,
  p_needle text,
  p_limit integer default 16
)
returns table (
  id uuid,
  sku text,
  name text,
  order_name text,
  brand_name text,
  on_salon boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tokens text[];
begin
  tokens := array(
    select token
    from unnest(
      regexp_split_to_array(
        regexp_replace(lower(coalesce(p_needle, '')), '[^a-z0-9]+', ' ', 'g'),
        '\s+'
      )
    ) as token
    where length(token) >= 2
  );

  if coalesce(array_length(tokens, 1), 0) = 0 then
    return;
  end if;

  return query
  with ranked as (
    select
      p.id,
      p.sku,
      p.name,
      p.order_name,
      b.name as brand_name,
      exists (
        select 1
        from product_branches pb
        where pb.product_id = p.id
          and pb.branch_id = p_branch_id
      ) as on_salon,
      concat_ws(
        ' ',
        p.name,
        p.order_name,
        p.sku,
        p.brand_sub,
        p.size_label,
        b.name
      ) as haystack
    from products p
    left join brands b on b.id = p.brand_id
    where p.company_id = p_company_id
      and p.is_active
  )
  select
    ranked.id,
    ranked.sku,
    ranked.name,
    ranked.order_name,
    ranked.brand_name,
    ranked.on_salon
  from ranked
  where not exists (
    select 1
    from unnest(tokens) as token
    where ranked.haystack not ilike '%' || token || '%'
  )
  order by
    ranked.on_salon asc,
    length(ranked.haystack) asc,
    coalesce(nullif(ranked.order_name, ''), nullif(ranked.name, ''), ranked.sku)
  limit greatest(1, least(coalesce(p_limit, 16), 40));
end;
$$;

create or replace function fn_fill_uncounted_count_items(p_count_id uuid, p_mode text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_mode = 'zero' then
    update inventory_count_items
    set counted_quantity = 0
    where inventory_count_id = p_count_id
      and counted_quantity is null;
  elsif p_mode = 'keep' then
    update inventory_count_items
    set counted_quantity = coalesce(expected_quantity, 0)
    where inventory_count_id = p_count_id
      and counted_quantity is null;
  else
    raise exception 'Unknown fill mode';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- DERIVED VIEWS
-- -----------------------------------------------------------------------------

create view current_stock as
select
  product_id,
  store_location_id,
  sum(quantity_change) as quantity_on_hand
from inventory_transactions
group by product_id, store_location_id;

create view low_stock_alerts as
select
  p.id as product_id,
  p.sku,
  coalesce(nullif(btrim(p.name), ''), p.order_name) as name,
  p.low_stock_threshold,
  coalesce(sum(cs.quantity_on_hand), 0) as total_on_hand
from products p
left join current_stock cs on cs.product_id = p.id
where p.low_stock_threshold is not null
group by p.id, p.sku, p.name, p.order_name, p.low_stock_threshold
having coalesce(sum(cs.quantity_on_hand), 0) <= p.low_stock_threshold;

create view invoice_reconciliation as
select
  i.id as invoice_id,
  i.invoice_number,
  i.total_gross_amount as invoice_stated_total,
  coalesce(sum(ii.line_total), 0) as line_items_total,
  i.total_gross_amount - coalesce(sum(ii.line_total), 0) as variance
from invoices i
left join invoice_items ii on ii.invoice_id = i.id
group by i.id, i.invoice_number, i.total_gross_amount;
comment on view invoice_reconciliation is 'variance <> 0 means the invoice''s line items do not yet sum to its stated total — review before marking the invoice paid.';

-- -----------------------------------------------------------------------------
-- FUNCTIONS & TRIGGERS — receiving automation
-- -----------------------------------------------------------------------------

create or replace function fn_recompute_po_status(p_po_id uuid)
returns void language plpgsql as $$
declare
  v_total_ordered  numeric;
  v_total_received numeric;
  v_current_status po_status;
begin
  select status into v_current_status from purchase_orders where id = p_po_id;
  if v_current_status in ('draft', 'cancelled') then
    return;  -- don't auto-transition orders that haven't been sent, or are cancelled
  end if;

  select coalesce(sum(quantity_ordered), 0), coalesce(sum(quantity_received), 0)
    into v_total_ordered, v_total_received
    from purchase_order_items where purchase_order_id = p_po_id;

  if v_total_received <= 0 then
    return;
  elsif v_total_received >= v_total_ordered then
    update purchase_orders set status = 'received' where id = p_po_id;
  else
    update purchase_orders set status = 'partially_received' where id = p_po_id;
  end if;
end;
$$;

create or replace function fn_default_receipt_item_classification()
returns trigger language plpgsql as $$
begin
  if new.classification is null and new.purchase_order_item_id is not null then
    select classification into new.classification
    from purchase_order_items where id = new.purchase_order_item_id;
  end if;

  if new.classification is null then
    raise exception 'classification must be provided when a goods_receipt_item has no purchase_order_item_id';
  end if;

  return new;
end;
$$;

create trigger trg_default_receipt_item_classification
before insert on goods_receipt_items
for each row execute function fn_default_receipt_item_classification();

create or replace function fn_sync_product_classification_summary()
returns trigger language plpgsql as $$
declare
  pid uuid;
  has_retail boolean;
  has_gwp boolean;
  has_inhouse boolean;
begin
  pid := coalesce(new.product_id, old.product_id);
  select
    bool_or(classification = 'retail'),
    bool_or(classification = 'gwp'),
    bool_or(classification = 'inhouse')
  into has_retail, has_gwp, has_inhouse
  from product_classifications
  where product_id = pid;

  update products
  set
    default_classification = case
      when has_retail then 'retail'::product_classification
      when has_gwp then 'gwp'::product_classification
      when has_inhouse then 'inhouse'::product_classification
      else null
    end,
    available_in_tunai = coalesce(has_retail or has_gwp, false)
  where id = pid;

  return null;
end;
$$;

create trigger trg_sync_product_classification_summary
after insert or update or delete on product_classifications
for each row execute function fn_sync_product_classification_summary();

create or replace function fn_after_goods_receipt_item_insert()
returns trigger language plpgsql as $$
declare
  v_company_id uuid;
  v_po_id uuid;
  v_is_set boolean;
  v_has_components boolean;
  v_component record;
begin
  select gr.company_id into v_company_id from goods_receipts gr where gr.id = new.goods_receipt_id;

  select p.is_set into v_is_set from products p where p.id = new.product_id;
  select exists (
    select 1 from product_components pc where pc.set_product_id = new.product_id
  ) into v_has_components;

  if coalesce(v_is_set, false) and v_has_components then
    for v_component in
      select pc.component_product_id, pc.quantity
      from product_components pc
      where pc.set_product_id = new.product_id
    loop
      insert into inventory_transactions (
        company_id, product_id, store_location_id, txn_type, quantity_change,
        reference_table, reference_id, notes
      ) values (
        v_company_id,
        v_component.component_product_id,
        new.store_location_id,
        'goods_receipt',
        new.quantity_received * v_component.quantity,
        'goods_receipt_items',
        new.id,
        'Unpacked from bundle on receipt'
      );
    end loop;
  else
    insert into inventory_transactions (
      company_id, product_id, store_location_id, txn_type, quantity_change,
      reference_table, reference_id, notes
    ) values (
      v_company_id, new.product_id, new.store_location_id, 'goods_receipt', new.quantity_received,
      'goods_receipt_items', new.id, 'Auto-created on receipt'
    );
  end if;

  if new.purchase_order_item_id is not null then
    update purchase_order_items
      set quantity_received = quantity_received + new.quantity_received
      where id = new.purchase_order_item_id
      returning purchase_order_id into v_po_id;

    perform fn_recompute_po_status(v_po_id);
  end if;

  return new;
end;
$$;
comment on function fn_after_goods_receipt_item_insert is 'Receives a PO line, then stocks either that SKU or its bundle components. Over-receipt is allowed.';

create trigger trg_after_goods_receipt_item_insert
after insert on goods_receipt_items
for each row execute function fn_after_goods_receipt_item_insert();

create or replace function fn_generate_invoice_items_from_receipt(
  p_invoice_id uuid,
  p_goods_receipt_id uuid
) returns integer language plpgsql as $$
declare
  v_count integer := 0;
begin
  insert into invoice_items (
    invoice_id, product_id, goods_receipt_item_id, quantity, unit_price,
    purchase_discount_amount, tax_amount
  )
  select
    p_invoice_id,
    gri.product_id,
    gri.id,
    gri.quantity_received,
    gri.unit_cost,
    gri.purchase_discount_amount,
    round(
      gri.quantity_received * gri.unit_cost *
      coalesce((select tr.rate_percentage from products p
                left join tax_rates tr on tr.id = p.tax_rate_id
                where p.id = gri.product_id), 0) / 100,
      2
    )
  from goods_receipt_items gri
  where gri.goods_receipt_id = p_goods_receipt_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
comment on function fn_generate_invoice_items_from_receipt is 'Pre-fills invoice_items from a goods receipt''s lines so the invoice can be reconciled against actual received quantities/costs instead of re-keyed from scratch. Check invoice_reconciliation afterwards — adjust purchase_discount_amount lines if it does not match the invoice total.';

-- -----------------------------------------------------------------------------
-- ROW LEVEL SECURITY — standard company-scoped isolation
-- -----------------------------------------------------------------------------
-- Baseline policy: any authenticated user who is a member of a company (via
-- company_users) can read/write everything belonging to that company. There
-- is no role-based restriction yet (e.g. only managers voiding invoices) —
-- add narrower policies per table later if that's needed.
-- -----------------------------------------------------------------------------

create or replace function fn_my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id from company_users where user_id = auth.uid()
$$;

-- companies / company_users: read-only for members; writes go through service role
alter table companies enable row level security;
create policy companies_select on companies
  for select using (id in (select fn_my_company_ids()));

alter table company_users enable row level security;
create policy company_users_select on company_users
  for select using (company_id in (select fn_my_company_ids()));

-- tables with a direct company_id column
alter table branches enable row level security;
create policy branches_company_isolation on branches
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table tax_rates enable row level security;
create policy tax_rates_company_isolation on tax_rates
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table brands enable row level security;
create policy brands_company_isolation on brands
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table tags enable row level security;
create policy tags_company_isolation on tags
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table suppliers enable row level security;
create policy suppliers_company_isolation on suppliers
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table products enable row level security;
create policy products_company_isolation on products
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table purchase_orders enable row level security;
create policy purchase_orders_company_isolation on purchase_orders
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table invoices enable row level security;
create policy invoices_company_isolation on invoices
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table goods_receipts enable row level security;
create policy goods_receipts_company_isolation on goods_receipts
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table inventory_transactions enable row level security;
create policy inventory_transactions_company_isolation on inventory_transactions
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table report_exports enable row level security;
create policy report_exports_company_isolation on report_exports
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table retail_use_entries enable row level security;
create policy retail_use_entries_company_isolation on retail_use_entries
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

alter table inventory_counts enable row level security;
create policy inventory_counts_company_isolation on inventory_counts
  for all using (company_id in (select fn_my_company_ids()))
  with check (company_id in (select fn_my_company_ids()));

-- tables without a direct company_id — scoped via their parent
alter table store_locations enable row level security;
create policy store_locations_company_isolation on store_locations
  for all using (branch_id in (select id from branches where company_id in (select fn_my_company_ids())))
  with check (branch_id in (select id from branches where company_id in (select fn_my_company_ids())));

alter table product_tags enable row level security;
create policy product_tags_company_isolation on product_tags
  for all using (product_id in (select id from products where company_id in (select fn_my_company_ids())))
  with check (product_id in (select id from products where company_id in (select fn_my_company_ids())));

alter table product_classifications enable row level security;
create policy product_classifications_company_isolation on product_classifications
  for all using (product_id in (select id from products where company_id in (select fn_my_company_ids())))
  with check (product_id in (select id from products where company_id in (select fn_my_company_ids())));

alter table product_branches enable row level security;
create policy product_branches_company_isolation on product_branches
  for all using (product_id in (select id from products where company_id in (select fn_my_company_ids())))
  with check (
    product_id in (select id from products where company_id in (select fn_my_company_ids()))
    and branch_id in (select id from branches where company_id in (select fn_my_company_ids()))
  );

alter table product_components enable row level security;
create policy product_components_company_isolation on product_components
  for all using (set_product_id in (select id from products where company_id in (select fn_my_company_ids())))
  with check (
    set_product_id in (select id from products where company_id in (select fn_my_company_ids()))
    and component_product_id in (select id from products where company_id in (select fn_my_company_ids()))
  );

alter table supplier_products enable row level security;
create policy supplier_products_company_isolation on supplier_products
  for all using (supplier_id in (select id from suppliers where company_id in (select fn_my_company_ids())))
  with check (supplier_id in (select id from suppliers where company_id in (select fn_my_company_ids())));

alter table purchase_order_items enable row level security;
create policy purchase_order_items_company_isolation on purchase_order_items
  for all using (purchase_order_id in (select id from purchase_orders where company_id in (select fn_my_company_ids())))
  with check (purchase_order_id in (select id from purchase_orders where company_id in (select fn_my_company_ids())));

alter table goods_receipt_items enable row level security;
create policy goods_receipt_items_company_isolation on goods_receipt_items
  for all using (goods_receipt_id in (select id from goods_receipts where company_id in (select fn_my_company_ids())))
  with check (goods_receipt_id in (select id from goods_receipts where company_id in (select fn_my_company_ids())));

alter table invoice_items enable row level security;
create policy invoice_items_company_isolation on invoice_items
  for all using (invoice_id in (select id from invoices where company_id in (select fn_my_company_ids())))
  with check (invoice_id in (select id from invoices where company_id in (select fn_my_company_ids())));

alter table inventory_count_items enable row level security;
create policy inventory_count_items_company_isolation on inventory_count_items
  for all using (inventory_count_id in (select id from inventory_counts where company_id in (select fn_my_company_ids())))
  with check (inventory_count_id in (select id from inventory_counts where company_id in (select fn_my_company_ids())));

alter table inventory_count_entries enable row level security;
create policy inventory_count_entries_company_isolation on inventory_count_entries
  for all using (inventory_count_id in (select id from inventory_counts where company_id in (select fn_my_company_ids())))
  with check (inventory_count_id in (select id from inventory_counts where company_id in (select fn_my_company_ids())));

-- views (current_stock, low_stock_alerts, invoice_reconciliation) inherit RLS
-- from their underlying tables automatically — no extra policies needed.

-- -----------------------------------------------------------------------------
-- INDEXES
-- -----------------------------------------------------------------------------

create index idx_products_brand on products (brand_id);
create unique index products_company_id_barcode_key on products (company_id, barcode) where barcode is not null;
create index idx_product_tags_tag on product_tags (tag_id);
create index idx_product_branches_branch on product_branches (branch_id);
create index idx_po_items_po on purchase_order_items (purchase_order_id);
create index idx_gri_po_item on goods_receipt_items (purchase_order_item_id);
create index idx_invoice_items_gri on invoice_items (goods_receipt_item_id);
create index idx_inventory_count_entries_count_created on inventory_count_entries (inventory_count_id, created_at desc);

-- -----------------------------------------------------------------------------
-- SEED DATA — run once you have a company row
-- -----------------------------------------------------------------------------
-- insert into tags (company_id, name)
-- select id, tag_name
-- from companies, unnest(array['wash','treatment','colour','retexturise','styling']) as tag_name
-- where companies.name = 'MAAX PTE LTD';

-- =============================================================================
-- End of schema v2 — see PROJECT_HANDOFF.md for remaining open items.
-- =============================================================================
