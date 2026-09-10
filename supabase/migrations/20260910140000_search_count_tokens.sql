create or replace function public.search_products_for_count(
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
        from public.product_branches pb
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
    from public.products p
    left join public.brands b on b.id = p.brand_id
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

comment on function public.search_products_for_count(uuid, uuid, text, integer) is
  'Count catalog search. Matches every token across name, order name, sku, brand, brand_sub, and size. Untagged salon products first.';

grant execute on function public.search_products_for_count(uuid, uuid, text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
