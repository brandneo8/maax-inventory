create or replace function public.search_products_for_count(
  p_company_id uuid,
  p_branch_id uuid,
  p_needle text,
  p_limit integer default 8
)
returns table (
  id uuid,
  sku text,
  name text,
  order_name text,
  brand_name text,
  on_salon boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  with needle as (
    select '%' || trim(p_needle) || '%' as pattern
  ),
  off_salon as (
    select
      p.id,
      p.sku,
      p.name,
      p.order_name,
      b.name as brand_name,
      false as on_salon
    from public.products p
    left join public.brands b on b.id = p.brand_id
    cross join needle
    where p.company_id = p_company_id
      and p.is_active
      and length(trim(p_needle)) >= 2
      and not exists (
        select 1
        from public.product_branches pb
        where pb.product_id = p.id
          and pb.branch_id = p_branch_id
      )
      and (
        p.name ilike needle.pattern
        or coalesce(p.order_name, '') ilike needle.pattern
        or coalesce(p.sku, '') ilike needle.pattern
        or coalesce(p.brand_sub, '') ilike needle.pattern
        or coalesce(b.name, '') ilike needle.pattern
      )
    order by coalesce(nullif(p.order_name, ''), nullif(p.name, ''), p.sku)
    limit greatest(1, least(coalesce(p_limit, 8), 16))
  ),
  on_salon as (
    select
      p.id,
      p.sku,
      p.name,
      p.order_name,
      b.name as brand_name,
      true as on_salon
    from public.products p
    left join public.brands b on b.id = p.brand_id
    cross join needle
    where p.company_id = p_company_id
      and p.is_active
      and length(trim(p_needle)) >= 2
      and exists (
        select 1
        from public.product_branches pb
        where pb.product_id = p.id
          and pb.branch_id = p_branch_id
      )
      and (
        p.name ilike needle.pattern
        or coalesce(p.order_name, '') ilike needle.pattern
        or coalesce(p.sku, '') ilike needle.pattern
        or coalesce(p.brand_sub, '') ilike needle.pattern
        or coalesce(b.name, '') ilike needle.pattern
      )
    order by coalesce(nullif(p.order_name, ''), nullif(p.name, ''), p.sku)
    limit greatest(1, least(coalesce(p_limit, 8), 16))
  )
  select * from off_salon
  union all
  select * from on_salon;
$$;

comment on function public.search_products_for_count(uuid, uuid, text, integer) is
  'Count search: untagged catalog matches first, then products already on this salon.';

grant execute on function public.search_products_for_count(uuid, uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
