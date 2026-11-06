-- 012 · Papéis, disparos por ramo, calendário de reuniões e o produto "Consulta de dados" para clientes (06/11/2026)
--
-- PAPÉIS (app_usuarios.papel):
--   admin    tudo
--   equipe   base inteira + responde os disparos SÓ dos ramos que recebeu (equipe_ramos) + calendário
--   consulta base inteira + calendário (o papel que já existia)
--   cliente  produto vendido: NÃO lê as tabelas da base. Só enxerga pelas funções cliente_* (ramos/estados do plano,
--            contatos escondidos até "liberar" a empresa, o que consome a cota do mês ou do pacote)
-- is_app_user() passa a significar "pessoa da equipe interna" — é ela que libera a leitura das tabelas da base no RLS.
-- Desativar alguém = app_usuarios.ativo = false (o login continua existindo, o acesso some).
--
-- Tudo aqui é pequeno (o banco está perto do limite de 500 MB do plano grátis). Idempotente.

-- ---------------------------------------------------------------------
-- 1. Papéis
-- ---------------------------------------------------------------------
alter table public.app_usuarios drop constraint if exists app_usuarios_papel_check;
alter table public.app_usuarios add constraint app_usuarios_papel_check check (papel in ('admin', 'equipe', 'consulta', 'cliente'));
alter table public.app_usuarios add column if not exists ativo boolean not null default true;

create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = '' as $$
  select papel from public.app_usuarios where user_id = (select auth.uid()) and ativo
$$;

create or replace function public.is_app_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios
                  where user_id = (select auth.uid()) and ativo and papel in ('admin', 'equipe', 'consulta'))
$$;

create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios where user_id = (select auth.uid()) and ativo and papel = 'admin')
$$;

do $$
declare fn text;
begin
  foreach fn in array array['public.meu_papel()', 'public.is_app_user()', 'public.is_app_admin()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- Quem é quem (nome/e-mail) para a equipe interna: calendário e responsáveis por ramo. Cliente não vê ninguém.
create or replace function public.pessoas_equipe()
returns table (user_id uuid, nome text, email text, papel text)
language sql stable security definer set search_path = '' as $$
  select u.user_id, coalesce(nullif(u.nome, ''), split_part(u.email, '@', 1)), u.email, u.papel
    from public.app_usuarios u
   where u.ativo and u.papel in ('admin', 'equipe', 'consulta') and public.is_app_user()
   order by 2
$$;
revoke all on function public.pessoas_equipe() from public, anon;
grant execute on function public.pessoas_equipe() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Disparos por ramo
-- ---------------------------------------------------------------------
alter table public.disparos
  add column if not exists ramo text,       -- divisão CNAE (2 dígitos), retrato do envio
  add column if not exists ramo_nome text,
  add column if not exists uf text;
update public.disparos d
   set ramo = e.divisao, ramo_nome = e.ramo, uf = e.uf
  from public.empresas_completa e
 where e.cnpj = d.cnpj and d.ramo is null;
create index if not exists disparos_ramo_idx on public.disparos (ramo, status);

-- Ramos de cada pessoa da equipe
create table if not exists public.equipe_ramos (
  user_id uuid not null references auth.users (id) on delete cascade,
  ramo    text not null check (ramo ~ '^\d{2}$'),
  primary key (user_id, ramo)
);
alter table public.equipe_ramos enable row level security;
revoke all on public.equipe_ramos from anon, authenticated;
grant select, insert, delete on public.equipe_ramos to authenticated;
drop policy if exists "admin gerencia" on public.equipe_ramos;
create policy "admin gerencia" on public.equipe_ramos for all to authenticated
  using ((select public.is_app_admin())) with check ((select public.is_app_admin()));
drop policy if exists "equipe le" on public.equipe_ramos;
create policy "equipe le" on public.equipe_ramos for select to authenticated using ((select public.is_app_user()));

create or replace function public.meus_ramos() returns text[]
language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(ramo), '{}') from public.equipe_ramos where user_id = (select auth.uid())
$$;
revoke all on function public.meus_ramos() from public, anon;
grant execute on function public.meus_ramos() to authenticated;

-- A equipe lê (e marca como visto) só os contatos dos seus ramos; campanhas/números/regras só para ler.
drop policy if exists "equipe le seus ramos" on public.disparos;
create policy "equipe le seus ramos" on public.disparos for select to authenticated
  using ((select public.meu_papel()) = 'equipe' and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])));
drop policy if exists "equipe marca seus ramos" on public.disparos;
create policy "equipe marca seus ramos" on public.disparos for update to authenticated
  using ((select public.meu_papel()) = 'equipe' and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])))
  with check ((select public.meu_papel()) = 'equipe' and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])));
drop policy if exists "equipe le conversas" on public.disparo_eventos;
create policy "equipe le conversas" on public.disparo_eventos for select to authenticated
  using ((select public.meu_papel()) = 'equipe'
         and exists (select 1 from public.disparos d where d.id = disparo_id and d.ramo = any (coalesce((select public.meus_ramos()), '{}'::text[]))));
do $$
declare t text;
begin
  foreach t in array array['disparo_campanhas', 'disparo_numeros', 'disparo_config'] loop
    execute format('drop policy if exists "equipe le" on public.%I', t);
    execute format('create policy "equipe le" on public.%I for select to authenticated
                    using ((select public.meu_papel()) = ''equipe'')', t);
  end loop;
end $$;

-- Funil com filtro de ramo (roda como quem chama: a equipe só soma os ramos dela)
drop function if exists public.disparo_resumo(bigint);
create or replace function public.disparo_resumo(p_campanha bigint default null, p_ramo text default null)
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
$$;
revoke all on function public.disparo_resumo(bigint, text) from public, anon;
grant execute on function public.disparo_resumo(bigint, text) to authenticated, service_role;

-- Uma linha por ramo (painel "Por ramo")
create or replace function public.disparo_por_ramo(p_campanha bigint default null)
returns table (ramo text, ramo_nome text, total bigint, enviados bigint, aguardando bigint, responderam bigint,
               interessados bigint, preencheram bigint, atencao bigint)
language sql stable as $$
  select coalesce(ramo, '??'), coalesce(max(ramo_nome), 'Ramo não identificado'), count(*),
         count(*) filter (where enviado_em is not null), count(*) filter (where status = 'enviado'),
         count(*) filter (where respondido_em is not null), count(*) filter (where interessado_em is not null),
         count(*) filter (where preenchido_em is not null), count(*) filter (where atencao)
    from public.disparos
   where not teste and (p_campanha is null or campanha_id = p_campanha)
   group by coalesce(ramo, '??')
   order by count(*) filter (where atencao) desc, count(*) desc
$$;
revoke all on function public.disparo_por_ramo(bigint) from public, anon;
grant execute on function public.disparo_por_ramo(bigint) to authenticated;

-- A reserva passa a gravar o ramo e o estado da empresa
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
begin
  for c in select * from public.disparo_campanhas where status = 'ativa'
            order by ultima_reserva_em nulls first, criada_em, id loop
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
           and not exists (select 1 from public.disparos d where d.telefone = substr(e.whatsapp_e164, 4))
           and not exists (select 1 from public.disparos d where d.cnpj = e.cnpj)
           and not exists (select 1 from public.disparo_bloqueios b where b.telefone = substr(e.whatsapp_e164, 4))
           %s
         order by %s
         limit 1$q$,
        public.empresas_where(c.filtros),
        case when c.excluir_compartilhados
             then 'and not exists (select 1 from public.empresas o
                                    where o.whatsapp = substr(e.whatsapp_e164, 4) and o.cnpj <> e.cnpj)'
             else '' end,
        ord) into achou;
      get diagnostics n = row_count;
      exit when n = 0;

      insert into public.disparos (campanha_id, numero_id, cnpj, telefone, razao_social, nome_fantasia, municipio,
                                   ramo, ramo_nome, uf)
      values (c.id, p_numero, achou.cnpj, achou.telefone, achou.razao_social, achou.nome_fantasia, achou.municipio,
              achou.divisao, achou.ramo, achou.uf)
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

-- ---------------------------------------------------------------------
-- 3. Calendário de reuniões (toda a equipe interna vê; cada um edita as suas, o admin edita todas)
-- ---------------------------------------------------------------------
create table if not exists public.reunioes (
  id          bigint generated always as identity primary key,
  titulo      text not null check (char_length(titulo) between 1 and 160),
  inicio      timestamptz not null,
  fim         timestamptz not null,
  descricao   text check (char_length(descricao) <= 4000),
  local       text check (char_length(local) <= 300),        -- endereço ou link da chamada
  cnpj        text,                                         -- empresa relacionada (opcional)
  disparo_id  bigint references public.disparos (id) on delete set null,
  criado_por  uuid not null default auth.uid() references auth.users (id) on delete cascade,
  criado_em   timestamptz not null default now(),
  check (fim > inicio)
);
create index if not exists reunioes_inicio_idx on public.reunioes (inicio);
alter table public.reunioes enable row level security;
revoke all on public.reunioes from anon, authenticated;
grant select, insert, update, delete on public.reunioes to authenticated;
drop policy if exists "equipe ve" on public.reunioes;
create policy "equipe ve" on public.reunioes for select to authenticated using ((select public.is_app_user()));
drop policy if exists "equipe cria" on public.reunioes;
create policy "equipe cria" on public.reunioes for insert to authenticated
  with check ((select public.is_app_user()) and criado_por = (select auth.uid()));
drop policy if exists "dono ou admin altera" on public.reunioes;
create policy "dono ou admin altera" on public.reunioes for update to authenticated
  using ((select public.is_app_user()) and (criado_por = (select auth.uid()) or (select public.is_app_admin())))
  with check ((select public.is_app_user()));
drop policy if exists "dono ou admin apaga" on public.reunioes;
create policy "dono ou admin apaga" on public.reunioes for delete to authenticated
  using ((select public.is_app_user()) and (criado_por = (select auth.uid()) or (select public.is_app_admin())));

-- ---------------------------------------------------------------------
-- 4. Produto "Consulta de dados" para clientes
-- ---------------------------------------------------------------------
create table if not exists public.clientes_acesso (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  ramos         text[] not null check (cardinality(ramos) >= 1),
  ufs           text[],                                      -- null = todos os estados da base
  modalidade    text not null check (modalidade in ('mensal', 'pacote')),
  cota_mensal   int check (cota_mensal > 0),                 -- empresas por mês (modalidade mensal)
  validade      date,                                        -- depois dela o acesso para
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (modalidade <> 'mensal' or cota_mensal is not null)
);
-- Cada "leva de compra" (modalidade pacote) soma empresas ao saldo
create table if not exists public.clientes_pacotes (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  quantidade  int not null check (quantidade > 0),
  observacao  text,
  criado_por  uuid default auth.uid(),
  criado_em   timestamptz not null default now()
);
create index if not exists clientes_pacotes_user_idx on public.clientes_pacotes (user_id);
-- Empresas que o cliente liberou (uma vez liberada, fica liberada para ele)
create table if not exists public.clientes_liberacoes (
  user_id     uuid not null references auth.users (id) on delete cascade,
  cnpj        text not null,
  liberada_em timestamptz not null default now(),
  primary key (user_id, cnpj)
);
create index if not exists clientes_liberacoes_data_idx on public.clientes_liberacoes (user_id, liberada_em);

do $$
declare t text;
begin
  foreach t in array array['clientes_acesso', 'clientes_pacotes', 'clientes_liberacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "admin gerencia" on public.%I', t);
    execute format('create policy "admin gerencia" on public.%I for all to authenticated
                    using ((select public.is_app_admin())) with check ((select public.is_app_admin()))', t);
    execute format('drop policy if exists "cliente le o seu" on public.%I', t);
    execute format('create policy "cliente le o seu" on public.%I for select to authenticated
                    using (user_id = (select auth.uid()))', t);
  end loop;
end $$;
grant insert, update, delete on public.clientes_acesso, public.clientes_pacotes to authenticated;
grant delete on public.clientes_liberacoes to authenticated; -- só o admin (RLS), para estornar

-- Saldo do cliente: do mês (mensal) ou dos pacotes comprados (pacote). p_user só vale para o admin.
create or replace function public.cliente_saldo(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  alvo   uuid := coalesce(p_user, (select auth.uid()));
  a      public.clientes_acesso;
  limite int;
  usadas int;
begin
  if p_user is not null and p_user <> (select auth.uid()) and not public.is_app_admin() then
    raise exception 'apenas administradores';
  end if;
  select * into a from public.clientes_acesso where user_id = alvo;
  if not found then return null; end if;
  if a.modalidade = 'mensal' then
    limite := a.cota_mensal;
    select count(*) into usadas from public.clientes_liberacoes l
     where l.user_id = alvo
       and l.liberada_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  else
    select coalesce(sum(quantidade), 0) into limite from public.clientes_pacotes where user_id = alvo;
    select count(*) into usadas from public.clientes_liberacoes where user_id = alvo;
  end if;
  return jsonb_build_object(
    'modalidade', a.modalidade, 'limite', limite, 'usadas', usadas, 'saldo', greatest(limite - usadas, 0),
    'ramos', a.ramos, 'ufs', a.ufs, 'validade', a.validade,
    'vencido', a.validade is not null and a.validade < (now() at time zone 'America/Sao_Paulo')::date,
    'total_liberadas', (select count(*) from public.clientes_liberacoes where user_id = alvo));
end $$;
revoke all on function public.cliente_saldo(uuid) from public, anon;
grant execute on function public.cliente_saldo(uuid) to authenticated;

-- Filtro do plano do cliente que chama (ramos e estados). null = não é cliente ativo com plano válido.
create or replace function public.cliente_escopo() returns text
language plpgsql stable security definer set search_path = '' as $$
declare a public.clientes_acesso;
begin
  if public.meu_papel() is distinct from 'cliente' then return null; end if;
  select * into a from public.clientes_acesso where user_id = (select auth.uid());
  if not found or (a.validade is not null and a.validade < (now() at time zone 'America/Sao_Paulo')::date) then
    return null;
  end if;
  return format('e.divisao = any (%L::text[])', a.ramos)
      || case when a.ufs is not null and cardinality(a.ufs) > 0 then format(' and e.uf = any (%L::text[])', a.ufs) else '' end;
end $$;
revoke all on function public.cliente_escopo() from public, anon, authenticated;

-- Busca do cliente: só o plano dele; contatos (telefones, WhatsApp, e-mail, endereço) só das empresas liberadas.
create or replace function public.cliente_buscar(f jsonb default '{}'::jsonb, ordem text default 'score',
                                                 limite int default 50, pagina int default 1,
                                                 so_liberadas boolean default false)
returns table (cnpj text, cnpj_formatado text, razao_social text, nome_fantasia text, setor text, ramo text,
               atividade_principal text, municipio text, uf text, porte text, capital_social numeric, regime text,
               situacao_regime text, prioridade text, score smallint, idade_anos int, liberada boolean,
               liberada_em timestamptz, telefone1 text, whatsapp text, whatsapp_link text, email text, endereco text)
language plpgsql stable security definer set search_path = '' as $$
declare
  esc text := public.cliente_escopo();
  ord text;
  f2  jsonb := coalesce(f, '{}'::jsonb) - 'email';  -- filtro por e-mail (clientes de um contador) não é do produto
begin
  if esc is null then raise exception 'sem plano ativo'; end if;
  ord := case ordem
           when 'capital' then 'e.capital_social desc nulls last, e.cnpj'
           when 'antigas' then 'e.data_abertura asc nulls last, e.cnpj'
           when 'novas'   then 'e.data_abertura desc nulls last, e.cnpj'
           when 'nome'    then 'e.razao_social, e.cnpj'
           when 'liberadas' then 'l.liberada_em desc nulls last, e.cnpj'
           else 'e.score desc, e.cnpj' end;
  limite := least(greatest(coalesce(limite, 50), 1), 500);
  pagina := greatest(coalesce(pagina, 1), 1);
  return query execute format($q$
    with pagina as materialized (
      select e.cnpj, l.liberada_em
        from public.empresas_completa e
        left join public.clientes_liberacoes l on l.user_id = %L and l.cnpj = e.cnpj
       where %s and %s %s
       order by %s limit %s offset %s)
    select e.cnpj, e.cnpj_formatado, e.razao_social, e.nome_fantasia, e.setor, e.ramo, e.atividade_principal,
           e.municipio, e.uf, e.porte::text, e.capital_social, e.regime::text, e.situacao_regime::text,
           e.prioridade::text, e.score, e.idade_anos, p.liberada_em is not null, p.liberada_em,
           case when p.liberada_em is not null then e.telefone1 end,
           case when p.liberada_em is not null then e.whatsapp end,
           case when p.liberada_em is not null then e.whatsapp_link end,
           case when p.liberada_em is not null then e.email end,
           case when p.liberada_em is not null then e.endereco end
      from pagina p join public.empresas_completa e on e.cnpj = p.cnpj
     order by %s$q$,
    (select auth.uid()), public.empresas_where(f2), esc,
    case when so_liberadas then 'and l.liberada_em is not null' else '' end,
    ord, limite, (pagina - 1) * limite,
    replace(ord, 'l.liberada_em', 'p.liberada_em'));
end $$;
revoke all on function public.cliente_buscar(jsonb, text, int, int, boolean) from public, anon;
grant execute on function public.cliente_buscar(jsonb, text, int, int, boolean) to authenticated;

create or replace function public.cliente_contar(f jsonb default '{}'::jsonb, so_liberadas boolean default false)
returns bigint
language plpgsql stable security definer set search_path = '' as $$
declare esc text := public.cliente_escopo(); r bigint;
begin
  if esc is null then raise exception 'sem plano ativo'; end if;
  execute format('select count(*) from public.empresas_completa e %s where %s and %s',
                 case when so_liberadas then format('join public.clientes_liberacoes l on l.user_id = %L and l.cnpj = e.cnpj', (select auth.uid())) else '' end,
                 public.empresas_where(coalesce(f, '{}'::jsonb) - 'email'), esc) into r;
  return r;
end $$;
revoke all on function public.cliente_contar(jsonb, boolean) from public, anon;
grant execute on function public.cliente_contar(jsonb, boolean) to authenticated;

-- Liberar o contato de uma empresa do plano: consome 1 do saldo (liberar de novo não cobra).
create or replace function public.cliente_liberar(p_cnpj text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  esc   text := public.cliente_escopo();
  uid   uuid := (select auth.uid());
  ok    boolean;
  saldo int;
begin
  if esc is null then raise exception 'sem plano ativo'; end if;
  perform pg_advisory_xact_lock(hashtext('cliente_liberar:' || uid::text)); -- dois cliques ao mesmo tempo não furam a cota
  if exists (select 1 from public.clientes_liberacoes where user_id = uid and cnpj = p_cnpj) then
    return jsonb_build_object('ok', true, 'ja_liberada', true, 'saldo', (public.cliente_saldo())->>'saldo');
  end if;
  execute format('select exists (select 1 from public.empresas_completa e where e.cnpj = %L and %s)', p_cnpj, esc) into ok;
  if not ok then raise exception 'empresa fora do seu plano'; end if;
  saldo := ((public.cliente_saldo())->>'saldo')::int;
  if saldo <= 0 then raise exception 'saldo esgotado'; end if;
  insert into public.clientes_liberacoes (user_id, cnpj) values (uid, p_cnpj);
  return jsonb_build_object('ok', true, 'ja_liberada', false, 'saldo', saldo - 1);
end $$;
revoke all on function public.cliente_liberar(text) from public, anon;
grant execute on function public.cliente_liberar(text) to authenticated;

notify pgrst, 'reload schema';
