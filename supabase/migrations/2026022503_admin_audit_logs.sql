-- Audit log trail for admin actions.

create table if not exists public.admin_audit_logs (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created_at
  on public.admin_audit_logs(created_at desc);

create index if not exists idx_admin_audit_logs_entity
  on public.admin_audit_logs(entity_type, entity_id);

alter table public.admin_audit_logs enable row level security;

drop policy if exists "admin_audit_logs_service_rw" on public.admin_audit_logs;
create policy "admin_audit_logs_service_rw"
on public.admin_audit_logs
for all
using ((select auth.role()) = 'service_role')
with check ((select auth.role()) = 'service_role');
