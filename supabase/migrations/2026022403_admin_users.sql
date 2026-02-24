-- Admin users table for app-level authorization.

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_users_email on public.admin_users(email);

alter table public.admin_users enable row level security;

drop policy if exists "admin_users_service_rw" on public.admin_users;
create policy "admin_users_service_rw"
on public.admin_users
for all
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');
