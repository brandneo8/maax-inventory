alter table public.inventory_count_entries replica identity full;
alter table public.inventory_count_items replica identity full;

do $$
begin
  begin
    alter publication supabase_realtime add table public.inventory_count_entries;
  exception
    when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.inventory_count_items;
  exception
    when duplicate_object then null;
  end;
end $$;
