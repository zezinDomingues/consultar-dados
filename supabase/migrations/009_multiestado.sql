-- 009 · Base multiestado (05/11/2026)
--
-- A plataforma deixa de ser só de SP: os estados chegam aos poucos e cada um é carregado em separado por
-- banco-clientes-sp/carga_estado.py (apaga e regrava só as linhas do próprio estado).
--   * empresas.uf (SP nas linhas antigas) e estabelecimentos_sp -> estabelecimentos_uf
--   * municipios ganha uf; a chave passa a ser (uf, municipio) — há municípios homônimos entre estados
--   * localização: 'Grande SP' vira 'Região metropolitana' (vale para qualquer estado)
--   * filtro novo `ufs`; `municipios` aceita "Nome" (todos os estados) ou "Nome/UF"
--   * resumo ganha a dimensão uf; opções ganham a lista de estados
--   * atualizar_contagens() e atualizar_contadores() recalculam as tabelas derivadas depois de cada carga
-- Idempotente.

begin;

-- ---------------------------------------------------------------- colunas novas
alter table public.empresas add column if not exists uf char(2) not null default 'SP';
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'empresas' and column_name = 'estabelecimentos_sp') then
    alter table public.empresas rename column estabelecimentos_sp to estabelecimentos_uf;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'farmacias_manipulacao' and column_name = 'estabelecimentos_sp') then
    alter table public.farmacias_manipulacao rename column estabelecimentos_sp to estabelecimentos_uf;
  end if;
end $$;
alter table public.farmacias_manipulacao add column if not exists uf char(2) not null default 'SP';
comment on table public.empresas is 'Empresas ativas (1 por raiz de CNPJ em cada estado) com ECF de Lucro Real/Presumido. Uma empresa presente em dois estados aparece uma vez em cada. Fonte: Receita Federal, cadastro out/2026 + ECF 2016-2024. O regime ECF é histórico e não confirma o regime atual.';
comment on column public.empresas.estabelecimentos_uf is 'Estabelecimentos ativos da raiz no próprio estado (matriz + filiais).';

alter table public.municipios add column if not exists uf char(2) not null default 'SP';
update public.municipios set localizacao = 'Região metropolitana' where localizacao = 'Grande SP';

-- chave (uf, municipio)
alter table public.empresas drop constraint if exists empresas_municipio_fkey;
alter table public.farmacias_manipulacao drop constraint if exists farmacias_manipulacao_municipio_fkey;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'municipios_pkey'
                 and conrelid = 'public.municipios'::regclass and array_length(conkey, 1) = 2) then
    alter table public.municipios drop constraint if exists municipios_pkey;
    alter table public.municipios add primary key (uf, municipio);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'empresas_uf_municipio_fkey') then
    alter table public.empresas add constraint empresas_uf_municipio_fkey
      foreign key (uf, municipio) references public.municipios (uf, municipio);
  end if;
end $$;
drop index if exists public.empresas_municipio_idx;
create index if not exists empresas_uf_municipio_idx on public.empresas (uf, municipio);

alter table public.contadores_grupos add column if not exists ufs text;

-- ---------------------------------------------------------------- view
drop view if exists public.empresas_completa cascade;   -- leva junto buscar_empresas (recriada abaixo)
create view public.empresas_completa with (security_invoker = true) as
select e.cnpj,
       substr(e.cnpj,1,2)||'.'||substr(e.cnpj,3,3)||'.'||substr(e.cnpj,6,3)||'/'||substr(e.cnpj,9,4)||'-'||right(e.cnpj,2) as cnpj_formatado,
       left(e.cnpj, 8) as raiz,
       e.prioridade, e.score, e.razao_social, e.nome_fantasia, e.tipo_negocio, e.matriz_filial, e.estabelecimentos_uf,
       c.secao, c.setor, c.macrossetor, c.divisao, c.ramo, c.grupo, c.segmento,
       e.cnae_principal, c.cnae_fmt, c.atividade as atividade_principal, e.cnaes_secundarios,
       e.regime, e.forma_tributacao, e.ano_ecf, e.simples_out2026, e.data_opcao_simples, e.data_exclusao_simples,
       e.situacao_regime, e.data_situacao, e.data_abertura,
       extract(year from age(current_date, e.data_abertura))::int as idade_anos,
       e.porte, e.capital_social,
       case when e.capital_social < 10000 then 'Até R$ 10 mil'
            when e.capital_social < 100000 then 'R$ 10 mil – 100 mil'
            when e.capital_social < 1000000 then 'R$ 100 mil – 1 mi'
            when e.capital_social < 10000000 then 'R$ 1 mi – 10 mi'
            when e.capital_social < 100000000 then 'R$ 10 mi – 100 mi'
            when e.capital_social is not null then 'Acima de R$ 100 mi' end as faixa_capital,
       e.uf::text as uf, e.municipio, m.regiao_intermediaria, m.regiao_imediata, m.localizacao,
       e.tipo_logradouro, e.logradouro, e.numero, e.complemento, e.bairro,
       left(e.cep,5)||'-'||right(e.cep,3) as cep,
       trim(concat_ws(' – ', concat_ws(', ', nullif(trim(concat_ws(' ', e.tipo_logradouro, e.logradouro)),''), e.numero), e.complemento)) as endereco,
       public.fmt_tel(e.telefone1) as telefone1, e.telefone1_tipo, e.telefone1_original,
       public.fmt_tel(e.telefone2) as telefone2, e.telefone2_tipo, e.telefone2_original,
       public.fmt_tel(e.whatsapp) as whatsapp, '+55' || e.whatsapp as whatsapp_e164,
       'https://wa.me/55' || e.whatsapp as whatsapp_link, e.empresas_mesmo_telefone,
       e.email, e.email_tipo, coalesce(e.email_original, e.email) as email_original, e.empresas_mesmo_email,
       e.estabelecimentos_uf as estabelecimentos_sp   -- apelido p/ a versão do app anterior ao deploy multiestado
from public.empresas e
left join public.cnae c on c.cnae = e.cnae_principal
left join public.municipios m on m.uf = e.uf and m.municipio = e.municipio;
comment on view public.empresas_completa is 'Tudo de empresas + setor/ramo/segmento (cnae) + regiões (municipios) + campos formatados. Respeita o RLS das tabelas (security_invoker).';
revoke all on public.empresas_completa from anon;
grant select on public.empresas_completa to authenticated;

-- ---------------------------------------------------------------- filtro
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
      w := w || format('e.cnpj between %L and %L', dig, rpad(dig, 14, '9'));
    else
      q := replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_');
      w := w || format('(e.razao_social ilike %L or e.nome_fantasia ilike %L)', '%' || q || '%', '%' || q || '%');
    end if;
  end if;

  for par in select * from (values ('setores', 'e.secao'), ('ramos', 'e.divisao'), ('segmentos', 'e.grupo'),
                                   ('cnaes', 'e.cnae_principal'), ('ufs', 'e.uf'),
                                   ('regioes', 'e.regiao_intermediaria'), ('localizacoes', 'e.localizacao'),
                                   ('portes', 'e.porte::text'), ('regimes', 'e.regime::text'),
                                   ('situacoes_regime', 'e.situacao_regime::text'), ('prioridades', 'e.prioridade::text'),
                                   ('tipos_negocio', 'e.tipo_negocio::text')) as t(chave, coluna) loop
    a := public.jarr(f->par.chave);
    if a is not null then
      w := w || format('%s = any (%L::text[])', par.coluna, a);
    end if;
  end loop;

  -- municípios: "Campinas" (qualquer estado) ou "Campinas/SP"
  a := public.jarr(f->'municipios');
  if a is not null then
    w := w || format('(e.municipio = any (%L::text[]) or e.municipio || ''/'' || e.uf = any (%L::text[]))', a, a);
  end if;

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
  if f->>'estab_min' is not null then w := w || format('e.estabelecimentos_uf >= %s', (f->>'estab_min')::int); end if;

  if coalesce((f->>'com_whatsapp')::boolean, false) then w := w || 'e.whatsapp is not null'::text; end if;
  if coalesce((f->>'com_email')::boolean, false) then w := w || 'e.email is not null'::text; end if;
  if coalesce((f->>'contato_proprio')::boolean, false) then
    w := w || $c$e.email_tipo::text in ('Corporativo', 'Pessoal (Gmail, Hotmail…)')$c$::text;
  end if;
  v := nullif(lower(btrim(f->>'email')), '');
  if v is not null then w := w || format('e.email = %L', v); end if;

  return array_to_string(w, ' and ');
end $$;

create or replace function public.buscar_empresas(f jsonb default '{}'::jsonb, ordem text default 'score'::text,
                                                  limite integer default 50, pagina integer default 1)
returns setof public.empresas_completa
language plpgsql stable as $function$
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
  return query execute format(
    'with pagina as materialized (
       select e.cnpj from public.empresas_completa e where %1$s order by %2$s limit %3$s offset %4$s
     )
     select e.* from public.empresas_completa e join pagina p on p.cnpj = e.cnpj order by %2$s',
    public.empresas_where(f), ord, limite, (pagina - 1) * limite);
end $function$;
comment on function public.buscar_empresas(jsonb, text, int, int) is
  'Busca de empresas. f = {q, setores[], ramos[], segmentos[], cnaes[], cnae_secundario, ufs[], municipios[] ("Nome" ou "Nome/UF"), regioes[], localizacoes[], portes[], regimes[], situacoes_regime[], prioridades[], tipos_negocio[], capital_min, capital_max, idade_min, idade_max, estab_min, com_whatsapp, com_email, contato_proprio, email}. Campos ausentes = sem filtro. ordem: score|capital|antigas|novas|nome. limite <= 1000.';

-- ---------------------------------------------------------------- resumo
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
                when grouping(uf) = 0 then 'uf'
                else 'total' end as dim,
           case when grouping(secao) = 0 then secao
                when grouping(divisao) = 0 then divisao
                when grouping(porte) = 0 then porte::text
                when grouping(regime) = 0 then regime::text
                when grouping(situacao_regime) = 0 then situacao_regime::text
                when grouping(prioridade) = 0 then prioridade::text
                when grouping(regiao_intermediaria) = 0 then regiao_intermediaria
                when grouping(localizacao) = 0 then localizacao
                when grouping(municipio) = 0 then municipio || '/' || uf
                when grouping(uf) = 0 then uf end as chave,
           case when grouping(secao) = 0 then setor
                when grouping(divisao) = 0 then ramo
                when grouping(municipio) = 0 then municipio || ' (' || uf || ')' end as nome,
           count(*)::int as n,
           (count(*) filter (where regime = 'Lucro Real'))::int as lucro_real,
           (count(*) filter (where whatsapp is not null))::int as com_whatsapp,
           (count(*) filter (where email_tipo::text in ('Corporativo', 'Pessoal (Gmail, Hotmail…)')))::int as email_proprio,
           (count(*) filter (where prioridade = 'A'))::int as prioridade_a,
           (count(*) filter (where situacao_regime = 'Recente (ECF 2024)'))::int as regime_recente
    from public.empresas_completa e
    where %s
    group by grouping sets ((secao, setor), (divisao, ramo), (porte), (regime), (situacao_regime),
                            (prioridade), (regiao_intermediaria), (localizacao), (municipio, uf), (uf), ())
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

-- ---------------------------------------------------------------- opções dos filtros
create or replace function public.opcoes_filtros() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'total_base', (select sum(qtd_empresas) from public.municipios),
    'ufs', (select jsonb_agg(jsonb_build_object('chave', uf, 'nome', uf, 'n', n) order by n desc)
            from (select uf::text as uf, sum(qtd_empresas)::int as n from public.municipios
                  group by 1 having sum(qtd_empresas) > 0) s),
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
    'municipios', (select jsonb_agg(jsonb_build_object('chave', municipio || '/' || uf, 'nome', municipio || ' (' || uf || ')',
                                                       'pai', regiao_intermediaria, 'uf', uf, 'n', qtd_empresas)
                                    order by qtd_empresas desc)
                   from public.municipios where qtd_empresas > 0),
    'regioes', (select jsonb_agg(jsonb_build_object('chave', regiao_intermediaria, 'nome', regiao_intermediaria || ' (' || uf || ')',
                                                    'uf', uf, 'n', n) order by n desc)
                from (select regiao_intermediaria, min(uf)::text as uf, sum(qtd_empresas)::int as n
                      from public.municipios group by 1 having sum(qtd_empresas) > 0) s)
  )
$$;

-- ---------------------------------------------------------------- tabelas derivadas (rodar após cada carga)
create or replace function public.atualizar_contagens() returns void
language sql security definer set search_path = '' as $$
  update public.cnae c set qtd_empresas = coalesce(s.n, 0)
    from (select c2.cnae, count(e.cnpj)::int as n
          from public.cnae c2 left join public.empresas e on e.cnae_principal = c2.cnae group by c2.cnae) s
   where s.cnae = c.cnae and c.qtd_empresas is distinct from coalesce(s.n, 0);
  update public.municipios m set qtd_empresas = coalesce(s.n, 0)
    from (select m2.uf, m2.municipio, count(e.cnpj)::int as n
          from public.municipios m2 left join public.empresas e on e.uf = m2.uf and e.municipio = m2.municipio
          group by 1, 2) s
   where s.uf = m.uf and s.municipio = m.municipio and m.qtd_empresas is distinct from coalesce(s.n, 0);
$$;

create or replace function public.atualizar_contadores() returns void
language sql security definer set search_path = '' as $$
  delete from public.contadores_grupos where true;
  insert into public.contadores_grupos (email, classificacao, empresas, lucro_real, lucro_presumido,
         ecf2024_fora_simples, hoje_no_simples, prioridade_a, municipios_distintos, municipio_principal,
         setor_principal, telefone_mais_frequente, exemplos, ufs)
  with sh as (
    select e.*, c.setor from public.empresas e left join public.cnae c on c.cnae = e.cnae_principal
     where e.email in (select email from public.empresas where email is not null group by email having count(*) >= 5)
  )
  select email,
         replace((mode() within group (order by email_tipo::text)), 'Compartilhado (grupo/terceiro)', 'Grupo econômico / terceiro'),
         count(*), count(*) filter (where regime = 'Lucro Real'), count(*) filter (where regime = 'Lucro Presumido'),
         count(*) filter (where situacao_regime = 'Recente (ECF 2024)'),
         count(*) filter (where situacao_regime = 'Hoje no Simples'),
         count(*) filter (where prioridade = 'A'),
         count(distinct (uf, municipio)),
         mode() within group (order by municipio || '/' || uf),
         mode() within group (order by setor),
         public.fmt_tel(mode() within group (order by telefone1)),
         null,   -- exemplos: preenchido logo abaixo (as 3 de maior capital)
         string_agg(distinct uf::text, ', ')
    from sh group by email;
  update public.contadores_grupos g set exemplos = s.ex
    from (select email, string_agg(razao_social, ' | ' order by rn) as ex
            from (select email, razao_social,
                         row_number() over (partition by email order by capital_social desc nulls last, cnpj) as rn
                    from public.empresas
                   where email in (select email from public.contadores_grupos)) t
           where rn <= 3 group by email) s
   where s.email = g.email;
$$;

revoke all on function public.atualizar_contagens() from public, anon, authenticated;
revoke all on function public.atualizar_contadores() from public, anon, authenticated;

do $$
declare fn text;
begin
  foreach fn in array array['public.empresas_where(jsonb)', 'public.buscar_empresas(jsonb, text, int, int)',
                            'public.resumo_empresas(jsonb)', 'public.opcoes_filtros()'] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;

-- estatísticas: uf entra junto das colunas de localização
drop statistics if exists public.empresas_local_stats;
create statistics if not exists public.empresas_local_stats (dependencies, mcv)
  on uf, municipio, cnae_principal from public.empresas;

commit;

analyze public.empresas;
analyze public.municipios;
notify pgrst, 'reload schema';
