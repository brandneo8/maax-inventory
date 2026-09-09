create or replace function public.fn_fill_uncounted_count_items(p_count_id uuid, p_mode text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_mode = 'zero' then
    update public.inventory_count_items
    set counted_quantity = 0
    where inventory_count_id = p_count_id
      and counted_quantity is null;
  elsif p_mode = 'keep' then
    update public.inventory_count_items
    set counted_quantity = coalesce(expected_quantity, 0)
    where inventory_count_id = p_count_id
      and counted_quantity is null;
  else
    raise exception 'Unknown fill mode';
  end if;
end;
$$;

grant execute on function public.fn_fill_uncounted_count_items(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
