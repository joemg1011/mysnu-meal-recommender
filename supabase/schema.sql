-- "오늘 뭐먹지?" MVP database schema for Supabase
create extension if not exists "uuid-ossp";

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'student' check (role in ('student','admin')),
  created_at timestamptz not null default now()
);

create table public.cafeterias (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  location text,
  is_active boolean not null default true
);

create table public.meal_schedules (
  id uuid primary key default uuid_generate_v4(),
  cafeteria_id uuid not null references public.cafeterias(id) on delete cascade,
  served_on date not null,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner')),
  source_type text not null default 'manual' check (source_type in ('mysnu','manual','ocr')),
  source_image_path text,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected')),
  created_by uuid references public.users(id) on delete set null,
  unique(cafeteria_id, served_on, meal_type)
);

create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  meal_schedule_id uuid not null references public.meal_schedules(id) on delete cascade,
  name text not null,
  category text,
  sort_order smallint not null default 0,
  created_at timestamptz not null default now()
);

create table public.calorie_estimates (
  id uuid primary key default uuid_generate_v4(),
  menu_item_id uuid not null unique references public.menu_items(id) on delete cascade,
  calories integer not null check (calories >= 0),
  confidence text not null check (confidence in ('high','medium','low')),
  basis text not null,
  revised_by uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.votes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  reaction smallint check (reaction in (-1, 1)),
  rating smallint check (rating between 1 and 5),
  reorder_intent boolean,
  fullness smallint check (fullness between 1 and 5),
  value_score smallint check (value_score between 1 and 5),
  created_at timestamptz not null default now(),
  unique(user_id, menu_item_id)
);

create table public.user_preferences (
  user_id uuid primary key references public.users(id) on delete cascade,
  calorie_goal text not null default 'maintain' check (calorie_goal in ('diet','maintain','bulk')),
  daily_calorie_target integer,
  disliked_ingredients text[] not null default '{}',
  allergies text[] not null default '{}',
  dietary_style text,
  updated_at timestamptz not null default now()
);

create table public.meal_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  eaten_on date not null default current_date,
  created_at timestamptz not null default now(),
  unique(user_id, menu_item_id, eaten_on)
);

create table public.recommendations (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  meal_schedule_id uuid not null references public.meal_schedules(id) on delete cascade,
  menu_item_id uuid not null references public.menu_items(id) on delete cascade,
  score numeric(5,2) not null,
  reason text not null,
  created_at timestamptz not null default now()
);

alter table public.votes enable row level security;
alter table public.user_preferences enable row level security;
alter table public.meal_logs enable row level security;
alter table public.recommendations enable row level security;

create policy "read public menus" on public.meal_schedules for select using (verification_status = 'verified');
create policy "manage own votes" on public.votes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "manage own preferences" on public.user_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "manage own meal logs" on public.meal_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "read own recommendations" on public.recommendations for select using (auth.uid() = user_id);
