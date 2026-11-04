-- =====================================================================
-- Consultar Dados — acesso e funções de consulta da base de empresas
-- Rodar DEPOIS da carga (banco-clientes-sp/carga_supabase.py).
-- Idempotente: pode rodar de novo. Se a carga for refeita (ela faz DROP
-- ... CASCADE), rode este arquivo outra vez.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Quem pode consultar: usuários do Auth listados em app_usuarios
-- ---------------------------------------------------------------------
create table if not exists public.app_usuarios (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  email     text not null,
  nome      text,
  papel     text not null default 'consulta' check (papel in ('admin', 'consulta')),
  criado_em timestamptz not null default now()
);
alter table public.app_usuarios enable row level security;
drop policy if exists "usuario le o proprio cadastro" on public.app_usuarios;
create policy "usuario le o proprio cadastro" on public.app_usuarios
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.is_app_user() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios where user_id = (select auth.uid()))
$$;
revoke all on function public.is_app_user() from public, anon;
grant execute on function public.is_app_user() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Leitura só para usuários autorizados (o anon não lê nada)
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['empresas','cnae','municipios','contadores_grupos','farmacias_manipulacao'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "app le dados" on public.%I', t);
    execute format('create policy "app le dados" on public.%I for select to authenticated using ((select public.is_app_user()))', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('revoke insert, update, delete, truncate on public.%I from authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
revoke all on public.empresas_completa from anon;
grant select on public.empresas_completa to authenticated;

-- ---------------------------------------------------------------------
-- 3. Contagens nas tabelas de referência (opções dos filtros)
-- ---------------------------------------------------------------------
alter table public.cnae add column if not exists qtd_empresas integer not null default 0;
update public.cnae c set qtd_empresas = coalesce(s.n, 0)
from (select c2.cnae, count(e.cnpj)::int as n
      from public.cnae c2 left join public.empresas e on e.cnae_principal = c2.cnae
      group by c2.cnae) s
where s.cnae = c.cnae;

alter table public.municipios add column if not exists qtd_empresas integer not null default 0;
update public.municipios m set qtd_empresas = s.n
from (select municipio, count(*)::int as n from public.empresas group by 1) s
where s.municipio = m.municipio;

create index if not exists empresas_score_idx on public.empresas (score desc, cnpj);
create index if not exists empresas_capital_idx on public.empresas (capital_social desc nulls last, cnpj);

-- ---------------------------------------------------------------------
-- 4. Filtro único. A tela e o futuro agente de IA usam as mesmas funções:
--    o mesmo JSON de filtros produz o mesmo resultado nos dois.
--    empresas_where(f) monta só as condições dos filtros presentes, com
--    todo valor escapado por %L (sem injeção). Assim o planner enxerga
--    constantes e escolhe índice/hash join — com "X is null or ..." para
--    cada filtro ele estimava 1 linha e fazia nested loop (estourava 8 s).
-- ---------------------------------------------------------------------
drop function if exists public.empresas_filtradas(jsonb);

create or replace function public.jarr(j jsonb) returns text[]
language sql immutable as $$
  select case when jsonb_typeof(j) = 'array' and jsonb_array_length(j) > 0
              then array(select jsonb_array_elements_text(j)) end
$$;

create or replace function public.empresas_where(f jsonb) returns text
language plpgsql immutable as $$
declare
  w   text[] := array['true'];
  q   text;
  dig text;
  a   text[];
  v   text;
  par record;
begin
  f := coalesce(f, '{}'::jsonb);

  q := nullif(btrim(f->>'q'), '');
  if q is not null then
    dig := regexp_replace(q, '\D', '', 'g');
    if q ~ '^[0-9./\- ]+$' and length(dig) >= 8 then
      -- parece CNPJ: faixa na chave primária (usa o índice)
      w := w || format('e.cnpj between %L and %L', dig, rpad(dig, 14, '9'));
    else
      q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
      w := w || format('(e.razao_social ilike %L or e.nome_fantasia ilike %L)', '%' || q || '%', '%' || q || '%');
    end if;
  end if;

  -- listas: chave do JSON -> coluna
  for par in select * from (values ('setores', 'e.secao'), ('ramos', 'e.divisao'), ('segmentos', 'e.grupo'),
                                   ('cnaes', 'e.cnae_principal'), ('municipios', 'e.municipio'),
                                   ('regioes', 'e.regiao_intermediaria'), ('localizacoes', 'e.localizacao'),
                                   ('portes', 'e.porte::text'), ('regimes', 'e.regime::text'),
                                   ('situacoes_regime', 'e.situacao_regime::text'), ('prioridades', 'e.prioridade::text'),
                                   ('tipos_negocio', 'e.tipo_negocio::text')) as t(chave, coluna) loop
    a := public.jarr(f->par.chave);
    if a is not null then
      w := w || format('%s = any (%L::text[])', par.coluna, a);
    end if;
  end loop;

  v := nullif(regexp_replace(coalesce(f->>'cnae_secundario', ''), '\D', '', 'g'), '');
  if v is not null then w := w || format('e.cnaes_secundarios like %L', '%' || v || '%'); end if;

  if f->>'capital_min' is not null then w := w || format('e.capital_social >= %s', (f->>'capital_min')::numeric); end if;
  if f->>'capital_max' is not null then w := w || format('e.capital_social <= %s', (f->>'capital_max')::numeric); end if;
  if f->>'idade_min' is not null then
    w := w || format('e.data_abertura <= current_date - interval %L', (f->>'idade_min')::int || ' years');
  end if;
  if f->>'idade_max' is not null then
    w := w || format('e.data_abertura > current_date - interval %L', ((f->>'idade_max')::int + 1) || ' years');
  end if;
  if f->>'estab_min' is not null then w := w || format('e.estabelecimentos_sp >= %s', (f->>'estab_min')::int); end if;

  if coalesce((f->>'com_whatsapp')::boolean, false) then w := w || 'e.whatsapp is not null'::text; end if;
  if coalesce((f->>'com_email')::boolean, false) then w := w || 'e.email is not null'::text; end if;
  if coalesce((f->>'contato_proprio')::boolean, false) then
    w := w || $c$e.email_tipo::text in ('Corporativo', 'Pessoal (Gmail, Hotmail…)')$c$::text;
  end if;
  v := nullif(lower(btrim(f->>'email')), '');
  if v is not null then w := w || format('e.email = %L', v); end if;

  return array_to_string(w, ' and ');
end $$;

create or replace function public.buscar_empresas(f jsonb default '{}'::jsonb, ordem text default 'score',
                                                  limite int default 50, pagina int default 1)
returns setof public.empresas_completa
language plpgsql stable as $$
declare ord text;
begin
  ord := case ordem
           when 'capital' then 'e.capital_social desc nulls last, e.cnpj'
           when 'antigas' then 'e.data_abertura asc nulls last, e.cnpj'
           when 'novas'   then 'e.data_abertura desc nulls last, e.cnpj'
           when 'nome'    then 'e.razao_social, e.cnpj'
           else 'e.score desc, e.cnpj' end;
  limite := least(greatest(coalesce(limite, 50), 1), 1000);
  pagina := greatest(coalesce(pagina, 1), 1);
  return query execute format('select e.* from public.empresas_completa e where %s order by %s limit %s offset %s',
                              public.empresas_where(f), ord, limite, (pagina - 1) * limite);
end $$;
comment on function public.buscar_empresas(jsonb, text, int, int) is
  'Busca de empresas. f = {q, setores[], ramos[], segmentos[], cnaes[], cnae_secundario, municipios[], regioes[], localizacoes[], portes[], regimes[], situacoes_regime[], prioridades[], tipos_negocio[], capital_min, capital_max, idade_min, idade_max, estab_min, com_whatsapp, com_email, contato_proprio, email}. Campos ausentes = sem filtro. ordem: score|capital|antigas|novas|nome. limite <= 1000.';

-- ---------------------------------------------------------------------
-- 5. Resumo do resultado (uma passada só, com GROUPING SETS)
-- ---------------------------------------------------------------------
create or replace function public.resumo_empresas(f jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  execute format($q$
  with g as (
    select case when grouping(secao) = 0 then 'setor'
                when grouping(divisao) = 0 then 'ramo'
                when grouping(porte) = 0 then 'porte'
                when grouping(regime) = 0 then 'regime'
                when grouping(situacao_regime) = 0 then 'situacao_regime'
                when grouping(prioridade) = 0 then 'prioridade'
                when grouping(regiao_intermediaria) = 0 then 'regiao'
                when grouping(localizacao) = 0 then 'localizacao'
                when grouping(municipio) = 0 then 'municipio'
                else 'total' end as dim,
           coalesce(secao, divisao, porte::text, regime::text, situacao_regime::text, prioridade::text,
                    regiao_intermediaria, localizacao, municipio) as chave,
           coalesce(setor, ramo) as nome,
           count(*)::int as n,
           (count(*) filter (where regime = 'Lucro Real'))::int as lucro_real,
           (count(*) filter (where whatsapp is not null))::int as com_whatsapp,
           (count(*) filter (where email_tipo::text in ('Corporativo', 'Pessoal (Gmail, Hotmail…)')))::int as email_proprio,
           (count(*) filter (where prioridade = 'A'))::int as prioridade_a,
           (count(*) filter (where situacao_regime = 'Recente (ECF 2024)'))::int as regime_recente
    from public.empresas_completa e
    where %s
    group by grouping sets ((secao, setor), (divisao, ramo), (porte), (regime), (situacao_regime),
                            (prioridade), (regiao_intermediaria), (localizacao), (municipio), ())
  )
  select jsonb_build_object(
    'total', coalesce((select jsonb_build_object('n', n, 'lucro_real', lucro_real, 'com_whatsapp', com_whatsapp,
                                                 'email_proprio', email_proprio, 'prioridade_a', prioridade_a,
                                                 'regime_recente', regime_recente)
                       from g where dim = 'total'),
                      '{"n":0,"lucro_real":0,"com_whatsapp":0,"email_proprio":0,"prioridade_a":0,"regime_recente":0}'::jsonb),
    'dims', coalesce((select jsonb_object_agg(dim, itens)
                      from (select dim, jsonb_agg(jsonb_build_object('chave', chave, 'nome', coalesce(nome, chave), 'n', n)
                                                  order by n desc) as itens
                            from g where dim <> 'total' group by dim) x), '{}'::jsonb))
  $q$, public.empresas_where(f)) into r;
  return r;
end $$;

-- ---------------------------------------------------------------------
-- 6. Opções dos filtros (hierarquia CNAE, municípios, regiões) num JSON só
-- ---------------------------------------------------------------------
create or replace function public.opcoes_filtros() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total_base', (select sum(qtd_empresas) from public.municipios),
    'setores', (select jsonb_agg(jsonb_build_object('chave', secao, 'nome', setor, 'n', n) order by n desc)
                from (select secao, min(setor) as setor, sum(qtd_empresas)::int as n
                      from public.cnae group by secao having sum(qtd_empresas) > 0) s),
    'ramos', (select jsonb_agg(jsonb_build_object('chave', divisao, 'nome', ramo, 'pai', secao, 'n', n) order by n desc)
              from (select divisao, min(ramo) as ramo, min(secao) as secao, sum(qtd_empresas)::int as n
                    from public.cnae group by divisao having sum(qtd_empresas) > 0) s),
    'segmentos', (select jsonb_agg(jsonb_build_object('chave', grupo, 'nome', segmento, 'pai', divisao, 'n', n) order by n desc)
                  from (select grupo, min(segmento) as segmento, min(divisao) as divisao, sum(qtd_empresas)::int as n
                        from public.cnae group by grupo having sum(qtd_empresas) > 0) s),
    'atividades', (select jsonb_agg(jsonb_build_object('chave', cnae, 'nome', atividade, 'cod', cnae_fmt,
                                                       'pai', grupo, 'n', qtd_empresas) order by qtd_empresas desc)
                   from public.cnae where qtd_empresas > 0),
    'municipios', (select jsonb_agg(jsonb_build_object('chave', municipio, 'nome', municipio, 'pai', regiao_intermediaria,
                                                       'n', qtd_empresas) order by qtd_empresas desc)
                   from public.municipios),
    'regioes', (select jsonb_agg(jsonb_build_object('chave', regiao_intermediaria, 'nome', regiao_intermediaria, 'n', n) order by n desc)
                from (select regiao_intermediaria, sum(qtd_empresas)::int as n from public.municipios group by 1) s)
  )
$$;

-- nomes das atividades secundárias de uma empresa
create or replace function public.nomes_cnae(codigos text[]) returns table (cnae text, cnae_fmt text, atividade text)
language sql stable as $$
  select c.cnae, c.cnae_fmt, c.atividade from public.cnae c where c.cnae = any (codigos) order by c.cnae
$$;

do $$
declare fn text;
begin
  foreach fn in array array['public.jarr(jsonb)', 'public.empresas_where(jsonb)', 'public.buscar_empresas(jsonb, text, int, int)',
                            'public.resumo_empresas(jsonb)',
                            'public.opcoes_filtros()', 'public.nomes_cnae(text[])', 'public.fmt_tel(text)'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
