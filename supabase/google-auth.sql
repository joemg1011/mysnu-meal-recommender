-- Run after schema.sql in the Supabase SQL Editor.
-- Keep public profile rows tied to the authenticated user's Google account.
alter table public.users enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'users' and policyname = 'read own profile') then
    create policy "read own profile" on public.users for select using (auth.uid() = id);
  end if;
end $$;

create or replace function public.create_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'create_user_profile_on_signup') then
    create trigger create_user_profile_on_signup
      after insert on auth.users
      for each row execute function public.create_user_profile();
  end if;
end $$;

insert into public.users (id, display_name)
select id, coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
