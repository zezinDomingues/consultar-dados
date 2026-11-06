-- 014 · Grupos de disparo: clientes que contratam a divulgação pelo WhatsApp (06/11/2026)
--
-- Cada GRUPO tem marca própria (nome, logo, site), fluxo (coleta = o da OficialCert: SIM → nome → contato → final;
-- divulgacao = logo + texto + link, sem perguntas), modelo de mensagens, números e campanhas próprios.
-- A OficialCert vira o grupo 1 e tudo o que já existia passa para ele.
-- "Nunca disparar 2 vezes" passa a valer POR GRUPO (índices únicos (grupo, telefone) e (grupo, cnpj)); o SAIR
-- bloqueia o telefone no grupo (bloqueio sem grupo = vale para todos — números da equipe, clientes etc.).
-- Cliente do disparo = papel 'cliente' + grupo_membros: enxerga só o(s) grupo(s) dele (painel, conversas, leads).
-- Idempotente.

create table if not exists public.disparo_grupos (
  id            bigint generated always as identity primary key,
  nome          text not null check (char_length(nome) between 1 and 80),
  logo_url      text check (logo_url is null or logo_url ~ '^https?://'),
  site_url      text check (site_url is null or site_url ~ '^https?://'),
  fluxo         text not null default 'coleta' check (fluxo in ('coleta', 'divulgacao')),
  medir_cliques boolean not null default true,   -- link da divulgação passa por /r/<token> para contar o clique
  modelo        jsonb not null default '{}'::jsonb, -- textos que uma campanha nova do grupo já traz
  ativo         boolean not null default true,
  observacao    text,
  criado_em     timestamptz not null default now()
);

insert into public.disparo_grupos (nome, logo_url, site_url, fluxo)
select 'OficialCert', 'https://www.oficialcert.com/site/marca/whatsapp-logo.jpg', 'https://www.oficialcert.com', 'coleta'
 where not exists (select 1 from public.disparo_grupos);

create table if not exists public.grupo_membros (
  user_id  uuid not null references auth.users (id) on delete cascade,
  grupo_id bigint not null references public.disparo_grupos (id) on delete cascade,
  primary key (user_id, grupo_id)
);

alter table public.disparo_numeros   add column if not exists grupo_id bigint references public.disparo_grupos (id);
alter table public.disparo_campanhas add column if not exists grupo_id bigint references public.disparo_grupos (id);
alter table public.disparos          add column if not exists grupo_id bigint references public.disparo_grupos (id);
do $$
declare g bigint := (select min(id) from public.disparo_grupos);
begin
  update public.disparo_numeros   set grupo_id = g where grupo_id is null;
  update public.disparo_campanhas set grupo_id = g where grupo_id is null;
  update public.disparos          set grupo_id = g where grupo_id is null;
end $$;
alter table public.disparo_numeros   alter column grupo_id set not null;
alter table public.disparo_campanhas alter column grupo_id set not null;
alter table public.disparos          alter column grupo_id set not null;
create index if not exists disparo_campanhas_grupo_idx on public.disparo_campanhas (grupo_id, status);
create index if not exists disparo_numeros_grupo_idx on public.disparo_numeros (grupo_id);

-- "Nunca 2 vezes" por grupo
drop index if exists public.disparos_telefone_uk;
drop index if exists public.disparos_cnpj_uk;
create unique index if not exists disparos_grupo_telefone_uk on public.disparos (grupo_id, telefone);
create unique index if not exists disparos_grupo_cnpj_uk on public.disparos (grupo_id, cnpj);

-- Bloqueios por grupo (null = todos os grupos)
alter table public.disparo_bloqueios add column if not exists id bigint generated always as identity;
alter table public.disparo_bloqueios add column if not exists grupo_id bigint references public.disparo_grupos (id) on delete cascade;
alter table public.disparo_bloqueios drop constraint if exists disparo_bloqueios_pkey;
create unique index if not exists disparo_bloqueios_grupo_uk on public.disparo_bloqueios (coalesce(grupo_id, 0), telefone);
create unique index if not exists disparo_bloqueios_id_uk on public.disparo_bloqueios (id);

-- ---------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------
create or replace function public.meus_grupos() returns bigint[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(m.grupo_id), '{}')
    from public.grupo_membros m
    join public.app_usuarios u on u.user_id = m.user_id and u.ativo
   where m.user_id = (select auth.uid())
$$;
revoke all on function public.meus_grupos() from public, anon;
grant execute on function public.meus_grupos() to authenticated;

alter table public.disparo_grupos enable row level security;
alter table public.grupo_membros enable row level security;
revoke all on public.disparo_grupos, public.grupo_membros from anon, authenticated;
grant select, insert, update on public.disparo_grupos to authenticated;
grant select, insert, delete on public.grupo_membros to authenticated;
drop policy if exists "admin gerencia" on public.disparo_grupos;
create policy "admin gerencia" on public.disparo_grupos for all to authenticated
  using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
drop policy if exists "equipe le" on public.disparo_grupos;
create policy "equipe le" on public.disparo_grupos for select to authenticated using ((select public.is_app_user()));
drop policy if exists "cliente le o seu" on public.disparo_grupos;
create policy "cliente le o seu" on public.disparo_grupos for select to authenticated
  using (id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "admin gerencia" on public.grupo_membros;
create policy "admin gerencia" on public.grupo_membros for all to authenticated
  using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
drop policy if exists "le o proprio" on public.grupo_membros;
create policy "le o proprio" on public.grupo_membros for select to authenticated using (user_id = (select auth.uid()));

-- O cliente do grupo lê o painel do grupo dele, marca como visto e responde (a resposta sai pelo servidor)
drop policy if exists "cliente le seu grupo" on public.disparos;
create policy "cliente le seu grupo" on public.disparos for select to authenticated
  using (grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "cliente marca seu grupo" on public.disparos;
create policy "cliente marca seu grupo" on public.disparos for update to authenticated
  using (grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])))
  with check (grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "cliente le conversas" on public.disparo_eventos;
create policy "cliente le conversas" on public.disparo_eventos for select to authenticated
  using (exists (select 1 from public.disparos d where d.id = disparo_id
                   and d.grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))));
drop policy if exists "cliente le seu grupo" on public.disparo_campanhas;
create policy "cliente le seu grupo" on public.disparo_campanhas for select to authenticated
  using (grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "cliente le seu grupo" on public.disparo_numeros;
create policy "cliente le seu grupo" on public.disparo_numeros for select to authenticated
  using (grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "cliente le regras" on public.disparo_config;
create policy "cliente le regras" on public.disparo_config for select to authenticated
  using (cardinality(coalesce((select public.meus_grupos()), '{}'::bigint[])) > 0);
grant select (grupo_id) on public.disparo_numeros to authenticated;

-- ---------------------------------------------------------------------
-- Reserva, contagem e relógio por grupo
-- ---------------------------------------------------------------------
create or replace function public.disparo_reservar(p_numero bigint)
returns setof public.disparos
language plpgsql volatile as $$
declare
  c     public.disparo_campanhas;
  achou record;
  novo  public.disparos;
  ord   text;
  n     int;
  tent  int;
  grp   bigint := (select grupo_id from public.disparo_numeros where id = p_numero);
begin
  for c in select dc.* from public.disparo_campanhas dc
             join public.disparo_grupos g on g.id = dc.grupo_id and g.ativo
            where dc.status = 'ativa' and dc.grupo_id = grp
            order by dc.ultima_reserva_em nulls first, dc.criada_em, dc.id loop
    if c.limite_total is not null
       and (select count(*) from public.disparos d where d.campanha_id = c.id and not d.teste) >= c.limite_total then
      update public.disparo_campanhas
         set status = 'concluida', motivo_status = 'limite de envios da campanha atingido', atualizada_em = now()
       where id = c.id;
      continue;
    end if;

    ord := case c.ordem
             when 'capital' then 'e.capital_social desc nulls last, e.cnpj'
             when 'antigas' then 'e.data_abertura asc nulls last, e.cnpj'
             when 'novas'   then 'e.data_abertura desc nulls last, e.cnpj'
             when 'nome'    then 'e.razao_social, e.cnpj'
             else 'e.score desc, e.cnpj' end;

    tent := 0;
    loop
      tent := tent + 1;
      execute format($q$
        select e.cnpj, substr(e.whatsapp_e164, 4) as telefone, e.razao_social, e.nome_fantasia, e.municipio,
               e.divisao, e.ramo, e.uf
          from public.empresas_completa e
         where %s
           and e.whatsapp_e164 is not null
           and not exists (select 1 from public.disparos d where d.grupo_id = %s and d.telefone = substr(e.whatsapp_e164, 4))
           and not exists (select 1 from public.disparos d where d.grupo_id = %s and d.cnpj = e.cnpj)
           and not exists (select 1 from public.disparo_bloqueios b
                            where b.telefone = substr(e.whatsapp_e164, 4) and (b.grupo_id is null or b.grupo_id = %s))
           %s
         order by %s
         limit 1$q$,
        public.empresas_where(c.filtros), c.grupo_id, c.grupo_id, c.grupo_id,
        case when c.excluir_compartilhados
             then 'and not exists (select 1 from public.empresas o
                                    where o.whatsapp = substr(e.whatsapp_e164, 4) and o.cnpj <> e.cnpj)'
             else '' end,
        ord) into achou;
      get diagnostics n = row_count;
      exit when n = 0;

      insert into public.disparos (grupo_id, campanha_id, numero_id, cnpj, telefone, razao_social, nome_fantasia,
                                   municipio, ramo, ramo_nome, uf)
      values (c.grupo_id, c.id, p_numero, achou.cnpj, achou.telefone, achou.razao_social, achou.nome_fantasia,
              achou.municipio, achou.divisao, achou.ramo, achou.uf)
      on conflict do nothing
      returning * into novo;
      if novo.id is not null then
        update public.disparo_campanhas set ultima_reserva_em = now() where id = c.id;
        return next novo;
        return;
      end if;
      exit when tent >= 10;
    end loop;

    if n = 0 then
      update public.disparo_campanhas
         set status = 'concluida', motivo_status = 'todas as empresas elegíveis já foram contatadas',
             atualizada_em = now()
       where id = c.id;
    end if;
  end loop;
end $$;
revoke all on function public.disparo_reservar(bigint) from public, anon, authenticated;
grant execute on function public.disparo_reservar(bigint) to service_role;

drop function if exists public.disparo_contar_elegiveis(jsonb, boolean);
create or replace function public.disparo_contar_elegiveis(f jsonb default '{}'::jsonb,
                                                            excluir_compartilhados boolean default true,
                                                            p_grupo bigint default null)
returns jsonb
language plpgsql stable as $$
declare r jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'apenas administradores';
  end if;
  execute format($q$
    select jsonb_build_object(
      'com_whatsapp', count(*),
      'elegiveis', count(*) filter (where
          not exists (select 1 from public.disparos d where d.grupo_id = %2$s and d.telefone = substr(e.whatsapp_e164, 4))
          and not exists (select 1 from public.disparos d where d.grupo_id = %2$s and d.cnpj = e.cnpj)
          and not exists (select 1 from public.disparo_bloqueios b where b.telefone = substr(e.whatsapp_e164, 4)
                                                                    and (b.grupo_id is null or b.grupo_id = %2$s))
          %1$s))
      from public.empresas_completa e
     where %3$s and e.whatsapp_e164 is not null$q$,
    case when excluir_compartilhados
         then 'and not exists (select 1 from public.empresas o where o.whatsapp = substr(e.whatsapp_e164, 4) and o.cnpj <> e.cnpj)'
         else '' end,
    coalesce(p_grupo, (select min(id) from public.disparo_grupos)),
    public.empresas_where(f)) into r;
  return r;
end $$;
revoke all on function public.disparo_contar_elegiveis(jsonb, boolean, bigint) from public, anon;
grant execute on function public.disparo_contar_elegiveis(jsonb, boolean, bigint) to authenticated, service_role;

drop function if exists public.disparo_resumo(bigint, text);
create or replace function public.disparo_resumo(p_campanha bigint default null, p_ramo text default null,
                                                 p_grupo bigint default null)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total',          count(*),
    'na_fila',        count(*) filter (where status = 'reservado'),
    'enviados',       count(*) filter (where enviado_em is not null),
    'entregues',      count(*) filter (where entregue_em is not null),
    'lidos',          count(*) filter (where lido_em is not null),
    'responderam',    count(*) filter (where respondido_em is not null),
    'aguardando',     count(*) filter (where status = 'enviado'),
    'interessados',   count(*) filter (where interessado_em is not null),
    'links_abertos',  count(*) filter (where link_aberto_em is not null),
    'preencheram',    count(*) filter (where preenchido_em is not null),
    'sem_interesse',  count(*) filter (where status = 'sem_interesse'),
    'descadastrados', count(*) filter (where status = 'descadastrado'),
    'sem_whatsapp',   count(*) filter (where status = 'sem_whatsapp'),
    'falhas',         count(*) filter (where status = 'falhou'),
    'atencao',        count(*) filter (where atencao),
    'enviados_hoje',  count(*) filter (where enviado_em >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')
                                                            at time zone 'America/Sao_Paulo'))
  )
  from public.disparos
  where not teste and (p_campanha is null or campanha_id = p_campanha) and (p_ramo is null or ramo = p_ramo)
    and (p_grupo is null or grupo_id = p_grupo)
$$;
revoke all on function public.disparo_resumo(bigint, text, bigint) from public, anon;
grant execute on function public.disparo_resumo(bigint, text, bigint) to authenticated, service_role;

drop function if exists public.disparo_por_ramo(bigint);
create or replace function public.disparo_por_ramo(p_campanha bigint default null, p_grupo bigint default null)
returns table (ramo text, ramo_nome text, total bigint, enviados bigint, aguardando bigint, responderam bigint,
               interessados bigint, preencheram bigint, atencao bigint)
language sql stable as $$
  select coalesce(ramo, '??'), coalesce(max(ramo_nome), 'Ramo não identificado'), count(*),
         count(*) filter (where enviado_em is not null), count(*) filter (where status = 'enviado'),
         count(*) filter (where respondido_em is not null), count(*) filter (where interessado_em is not null),
         count(*) filter (where preenchido_em is not null), count(*) filter (where atencao)
    from public.disparos
   where not teste and (p_campanha is null or campanha_id = p_campanha) and (p_grupo is null or grupo_id = p_grupo)
   group by coalesce(ramo, '??')
   order by count(*) filter (where atencao) desc, count(*) desc
$$;
revoke all on function public.disparo_por_ramo(bigint, bigint) from public, anon;
grant execute on function public.disparo_por_ramo(bigint, bigint) to authenticated;

-- O pg_cron só chama o ciclo se houver número pronto com campanha ativa NO MESMO grupo (e o grupo ativo)
create or replace function public.disparo_precisa_ciclo() returns boolean
language sql stable as $$
  select coalesce((
    select not c.pausado
       and extract(isodow from now() at time zone 'America/Sao_Paulo')::smallint = any (c.dias_semana)
       and extract(hour from now() at time zone 'America/Sao_Paulo') >= c.hora_inicio
       and extract(hour from now() at time zone 'America/Sao_Paulo') < c.hora_fim
       and exists (select 1
                     from public.disparo_numeros n
                     join public.disparo_grupos g on g.id = n.grupo_id and g.ativo
                     join public.disparo_campanhas dc on dc.grupo_id = n.grupo_id and dc.status = 'ativa'
                    where n.ativo and n.proximo_envio_em <= now())
      from public.disparo_config c
     where c.id = 1), false)
$$;
revoke all on function public.disparo_precisa_ciclo() from public, anon, authenticated;

-- Logos dos grupos: bucket público do Storage (fora dos 500 MB do banco)
insert into storage.buckets (id, name, public) values ('marcas', 'marcas', true) on conflict (id) do nothing;

notify pgrst, 'reload schema';
