-- 024 — agenda de publicação do Instagram (@oficialcert) pela API oficial da Meta (10/11/2026).
--
-- instagram_agenda: o que publicar e quando. O pg_cron chama /api/sistema/instagram/ciclo a cada 5 min,
-- só quando há item vencido ou em processamento. A rota publica em duas fases: cria o container na Meta e,
-- quando ela termina de processar (vídeo leva minutos), publica. Token: variáveis IG_ACCESS_TOKEN/IG_USER_ID
-- na Vercel ou, na falta delas, o Vault (segredos instagram_token / instagram_user_id), lido por
-- instagram_credenciais(), que só a chave de serviço executa. O token nunca vai para o repositório.
-- Mídia: bucket público `instagram` (JPEG e MP4), porque a Meta baixa a mídia de um endereço público.
-- Idempotente.
begin;

create table if not exists public.instagram_agenda (
  id            bigint generated always as identity primary key,
  quando        timestamptz not null,
  tipo          text not null check (tipo in ('imagem', 'carrossel', 'reel', 'story')),
  titulo        text not null,
  midias        text[] not null check (cardinality(midias) between 1 and 20),
  capa          text,
  legenda       text not null check (length(legenda) <= 2200),
  alt           text,
  status        text not null default 'agendado'
                  check (status in ('agendado', 'publicando', 'publicado', 'erro', 'cancelado')),
  container_id  text,
  tentativas    int not null default 0,
  erro          text,
  media_id      text,
  permalink     text,
  publicado_em  timestamptz,
  atualizado_em timestamptz not null default now(),
  criado_em     timestamptz not null default now()
);
create index if not exists instagram_agenda_fila_idx on public.instagram_agenda (status, quando);

alter table public.instagram_agenda enable row level security;
revoke all on public.instagram_agenda from anon, authenticated;
grant select on public.instagram_agenda to authenticated;
drop policy if exists "admin le agenda do instagram" on public.instagram_agenda;
create policy "admin le agenda do instagram" on public.instagram_agenda
  for select to authenticated using ((select public.is_app_admin()));

-- Há trabalho para o ciclo? (vencido para publicar, ou container esperando a Meta processar)
create or replace function public.instagram_precisa_ciclo()
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.instagram_agenda a
                  where (a.status = 'agendado' and a.quando <= now())
                     or a.status = 'publicando')
$$;

-- Pega UM item para trabalhar: primeiro os que esperam processamento, depois o vencido mais antigo.
-- Item preso em "publicando" sem container há mais de 15 min volta para a fila (até 3 tentativas).
create or replace function public.instagram_reservar()
returns setof public.instagram_agenda
language plpgsql security definer set search_path = '' as $$
declare alvo bigint;
begin
  update public.instagram_agenda
     set status = case when tentativas >= 3 then 'erro' else 'agendado' end,
         erro = coalesce(erro, 'travou sem container'), atualizado_em = now()
   where status = 'publicando' and container_id is null and atualizado_em < now() - interval '15 minutes';

  select a.id into alvo from public.instagram_agenda a
   where (a.status = 'publicando' and a.container_id is not null)
      or (a.status = 'agendado' and a.quando <= now())
   order by (a.status = 'publicando') desc, a.quando
   limit 1
   for update skip locked;
  if alvo is null then return; end if;

  return query
  update public.instagram_agenda a
     set status = 'publicando',
         tentativas = a.tentativas + case when a.container_id is null then 1 else 0 end,
         atualizado_em = now()
   where a.id = alvo
  returning a.*;
end $$;

-- Eventos do webhook (comentários e directs). ref = id do comentário/mensagem: a Meta reenvia, nós tratamos uma vez só.
create table if not exists public.instagram_eventos (
  id          bigint generated always as identity primary key,
  recebido_em timestamptz not null default now(),
  campo       text not null,
  ref         text not null,
  de_usuario  text,
  texto       text,
  acao        text,
  erro        text,
  payload     jsonb not null,
  unique (campo, ref)
);
alter table public.instagram_eventos enable row level security;
revoke all on public.instagram_eventos from anon, authenticated;
grant select on public.instagram_eventos to authenticated;
drop policy if exists "admin le eventos do instagram" on public.instagram_eventos;
create policy "admin le eventos do instagram" on public.instagram_eventos
  for select to authenticated using ((select public.is_app_admin()));

drop function if exists public.instagram_credenciais();
create or replace function public.instagram_credenciais()
returns table (token text, user_id text, app_secret text)
language sql stable security definer set search_path = '' as $$
  select (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_token' limit 1),
         (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_user_id' limit 1),
         (select decrypted_secret from vault.decrypted_secrets where name = 'instagram_app_secret' limit 1)
$$;

revoke all on function public.instagram_precisa_ciclo() from public, anon, authenticated;
revoke all on function public.instagram_reservar() from public, anon, authenticated;
revoke all on function public.instagram_credenciais() from public, anon, authenticated;
grant execute on function public.instagram_reservar() to service_role;
grant execute on function public.instagram_credenciais() to service_role;

-- bucket público da mídia (a Meta baixa daqui)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('instagram', 'instagram', true, 104857600, array['image/jpeg', 'video/mp4'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
                               allowed_mime_types = excluded.allowed_mime_types;

-- ciclo a cada 5 min, com o mesmo segredo do ciclo de disparos (Vault disparos_segredo)
select cron.unschedule('instagram-ciclo') where exists (select 1 from cron.job where jobname = 'instagram-ciclo');
select cron.schedule(
  'instagram-ciclo',
  '*/5 * * * *',
  $cron$
  select net.http_post(
           url := 'https://www.oficialcert.com/api/sistema/instagram/ciclo',
           body := '{}'::jsonb,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                             where name = 'disparos_segredo' limit 1)),
           timeout_milliseconds := 55000)
   where public.instagram_precisa_ciclo()
  $cron$
);

commit;
