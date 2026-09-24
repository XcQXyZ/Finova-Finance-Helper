
-- FINOVA 3.0 - SUPABASE DATABASE
-- Jalankan seluruh file ini di Supabase > SQL Editor.
-- Setelah selesai, isi SUPABASE_URL dan SUPABASE_KEY di js/app.js.

create extension if not exists pgcrypto;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  icon text not null default '📦',
  type text not null check (type in ('income','expense')),
  color text default '#8b5cf6',
  created_at timestamptz not null default now(),
  unique(user_id, name, type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(15,2) not null check (amount > 0),
  type text not null check (type in ('income','expense')),
  category_id uuid references public.categories(id) on delete set null,
  category text,
  transaction_date date not null default current_date,
  note text,
  recurring_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  amount numeric(15,2) not null check (amount > 0),
  month date not null,
  created_at timestamptz not null default now(),
  unique(user_id, category_id, month)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_amount numeric(15,2) not null check (target_amount > 0),
  current_amount numeric(15,2) not null default 0 check (current_amount >= 0),
  deadline date,
  icon text not null default '🎯',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recurring_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  amount numeric(15,2) not null check (amount > 0),
  type text not null check (type in ('income','expense')),
  category_id uuid references public.categories(id) on delete set null,
  category text,
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  next_date date not null,
  note text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'IDR',
  theme text not null default 'dark' check (theme in ('dark','light')),
  notifications boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists transactions_user_date_idx
  on public.transactions(user_id, transaction_date desc);
create index if not exists budgets_user_month_idx
  on public.budgets(user_id, month);
create index if not exists recurring_user_next_idx
  on public.recurring_transactions(user_id, next_date);
create index if not exists categories_user_idx
  on public.categories(user_id);
create index if not exists goals_user_idx
  on public.savings_goals(user_id);

alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.savings_goals enable row level security;
alter table public.recurring_transactions enable row level security;
alter table public.app_settings enable row level security;

-- Policies are dropped/recreated so this script can safely be rerun.
drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories for select using (auth.uid() = user_id);
create policy "categories_insert_own" on public.categories for insert with check (auth.uid() = user_id);
create policy "categories_update_own" on public.categories for update using (auth.uid() = user_id);
create policy "categories_delete_own" on public.categories for delete using (auth.uid() = user_id);

drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions for select using (auth.uid() = user_id);
create policy "transactions_insert_own" on public.transactions for insert with check (auth.uid() = user_id);
create policy "transactions_update_own" on public.transactions for update using (auth.uid() = user_id);
create policy "transactions_delete_own" on public.transactions for delete using (auth.uid() = user_id);

drop policy if exists "budgets_select_own" on public.budgets;
drop policy if exists "budgets_insert_own" on public.budgets;
drop policy if exists "budgets_update_own" on public.budgets;
drop policy if exists "budgets_delete_own" on public.budgets;

create policy "budgets_select_own" on public.budgets for select using (auth.uid() = user_id);
create policy "budgets_insert_own" on public.budgets for insert with check (auth.uid() = user_id);
create policy "budgets_update_own" on public.budgets for update using (auth.uid() = user_id);
create policy "budgets_delete_own" on public.budgets for delete using (auth.uid() = user_id);

drop policy if exists "goals_select_own" on public.savings_goals;
drop policy if exists "goals_insert_own" on public.savings_goals;
drop policy if exists "goals_update_own" on public.savings_goals;
drop policy if exists "goals_delete_own" on public.savings_goals;

create policy "goals_select_own" on public.savings_goals for select using (auth.uid() = user_id);
create policy "goals_insert_own" on public.savings_goals for insert with check (auth.uid() = user_id);
create policy "goals_update_own" on public.savings_goals for update using (auth.uid() = user_id);
create policy "goals_delete_own" on public.savings_goals for delete using (auth.uid() = user_id);

drop policy if exists "recurring_select_own" on public.recurring_transactions;
drop policy if exists "recurring_insert_own" on public.recurring_transactions;
drop policy if exists "recurring_update_own" on public.recurring_transactions;
drop policy if exists "recurring_delete_own" on public.recurring_transactions;

create policy "recurring_select_own" on public.recurring_transactions for select using (auth.uid() = user_id);
create policy "recurring_insert_own" on public.recurring_transactions for insert with check (auth.uid() = user_id);
create policy "recurring_update_own" on public.recurring_transactions for update using (auth.uid() = user_id);
create policy "recurring_delete_own" on public.recurring_transactions for delete using (auth.uid() = user_id);

drop policy if exists "settings_select_own" on public.app_settings;
drop policy if exists "settings_insert_own" on public.app_settings;
drop policy if exists "settings_update_own" on public.app_settings;
drop policy if exists "settings_delete_own" on public.app_settings;

create policy "settings_select_own" on public.app_settings for select using (auth.uid() = user_id);
create policy "settings_insert_own" on public.app_settings for insert with check (auth.uid() = user_id);
create policy "settings_update_own" on public.app_settings for update using (auth.uid() = user_id);
create policy "settings_delete_own" on public.app_settings for delete using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant select, insert, update, delete on public.recurring_transactions to authenticated;
grant select, insert, update, delete on public.app_settings to authenticated;

-- Default categories are created by the frontend after first login.
