-- 004 · Histórico de conversas do Agente de IA (04/11/2026)
-- Cada usuário só vê, cria, altera e apaga as PRÓPRIAS conversas (RLS por auth.uid()) e precisa ser usuário
-- liberado do app. Os turnos ficam em jsonb exatamente como a tela os mostra (texto, painéis, etapas).
-- Idempotente.

create table if not exists public.agente_conversas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text not null check (char_length(titulo) between 1 and 200),
  turnos jsonb not null default '[]'::jsonb,
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now()
);
create index if not exists agente_conversas_usuario_idx on public.agente_conversas (user_id, atualizada_em desc);

alter table public.agente_conversas enable row level security;
revoke all on public.agente_conversas from anon, authenticated;
grant select, insert, update, delete on public.agente_conversas to authenticated;

drop policy if exists "dono le" on public.agente_conversas;
drop policy if exists "dono cria" on public.agente_conversas;
drop policy if exists "dono altera" on public.agente_conversas;
drop policy if exists "dono apaga" on public.agente_conversas;
create policy "dono le" on public.agente_conversas for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_app_user()));
create policy "dono cria" on public.agente_conversas for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_app_user()));
create policy "dono altera" on public.agente_conversas for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "dono apaga" on public.agente_conversas for delete to authenticated
  using (user_id = (select auth.uid()));
