-- 021 · QA rodada 1: busca por texto rápida, usuários gravados de uma vez e sempre um admin (09/11/2026)
--
-- 1) Busca por texto (QA-05). O ILIKE converte cada uma das 868 mil razões sociais para minúsculas: 2,1 s por
--    varredura, e a Consulta faz duas (lista + resumo) → 5–6 s na tela, perto do limite de 8 s do papel
--    authenticated. A base da Receita vem em MAIÚSCULAS e sem acento (conferido: 0 linhas com acento ou fora do
--    ASCII; 489 linhas com letra minúscula), então LIKE com o termo em maiúsculas dá o mesmo resultado comparando
--    bytes: 0,37 s. As 489 linhas fora do padrão ficam num índice parcial de 32 kB e seguem com ILIKE.
--    Medido em rollback: resumo com texto 2,1–4,4 s → 0,38–0,49 s; lista com termo raro 3,7–4,3 s → 0,8–1,0 s;
--    mesmo conjunto de CNPJs nos 9 termos testados. De brinde: termo com acento ("farmácia", "São Paulo") passa
--    a achar (antes dava 0, porque a base não tem acento). Um índice de trigramas não cabe (≈60 MB, banco 455/500).
--    Ainda no filtro: capital/idade mínimos maiores que os máximos são trocados (QA-09; a tela já troca, isto cobre o
--    agente) e o resumo roda sem laço aninhado (capital entre X e Y passava de 40 s — ver a 016, item 3).
-- 2) admin_salvar_usuario(): papel, ramos, grupos e plano do usuário numa transação só (BE-15 — antes, um plano
--    inválido apagava os grupos e deixava o cadastro pela metade). Só a chave de serviço chama (o servidor confere
--    antes que quem pede é admin).
-- 3) Gatilho app_usuarios_manter_admin: nunca deixa o sistema sem administrador ativo, nem com dois admins se
--    rebaixando ao mesmo tempo (trava consultiva na transação).
-- Compatível com o código no ar (main 38120d1): nada muda de assinatura. Idempotente.

begin;

-- ---------------------------------------------------------------- 1. busca por texto
create index if not exists empresas_caixa_mista_idx on public.empresas (cnpj)
  where razao_social <> upper(razao_social) or nome_fantasia <> upper(nome_fantasia);

create or replace function public.empresas_where(f jsonb) returns text
language plpgsql immutable as $$
declare
  w   text[] := array['true'];
  q   text;
  dig text;
  a   text[];
  v   text;
  par record;
  com_acento constant text := 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ';
  sem_acento constant text := 'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN';
begin
  f := coalesce(f, '{}'::jsonb);

  q := nullif(btrim(f->>'q'), '');
  if q is not null then
    dig := regexp_replace(q, '\D', '', 'g');
    if q ~ '^[0-9./\- ]+$' and length(dig) >= 8 then
      w := w || format('e.cnpj between %L and %L', dig, rpad(dig, 14, '9'));
    else
      q := '%' || replace(replace(replace(q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
      -- o termo como veio e sem acento; LIKE em maiúsculas para a base, ILIKE só nas linhas do índice parcial
      a := array(select distinct x from unnest(array[q, translate(q, com_acento, sem_acento)]) x);
      w := w || format('(e.razao_social like any (%1$L::text[]) or e.nome_fantasia like any (%1$L::text[])'
                       ' or e.cnpj = any (array(select x.cnpj from public.empresas x'
                       ' where (x.razao_social <> upper(x.razao_social) or x.nome_fantasia <> upper(x.nome_fantasia))'
                       ' and (x.razao_social ilike any (%2$L::text[]) or x.nome_fantasia ilike any (%2$L::text[])))))',
                       array(select distinct upper(x) from unnest(a) x), a);
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

  -- mínimo maior que o máximo (QA-09): troca os dois em vez de devolver 0 sem explicar
  if (f->>'capital_min')::numeric > (f->>'capital_max')::numeric then
    f := f || jsonb_build_object('capital_min', f->'capital_max', 'capital_max', f->'capital_min');
  end if;
  if (f->>'idade_min')::int > (f->>'idade_max')::int then
    f := f || jsonb_build_object('idade_min', f->'idade_max', 'idade_max', f->'idade_min');
  end if;
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
comment on function public.empresas_where(jsonb) is
  'WHERE dos filtros (buscar_empresas, resumo_empresas, cliente_*, disparo_*). Texto: LIKE em maiúsculas (a base é maiúscula e sem acento) + ILIKE nas linhas de empresas_caixa_mista_idx (021).';

-- O resumo com capital mínimo E máximo passava de 40 s (ver a 016, item 3). A 016 já liga isto no cálculo; aqui
-- vale também se a 016 ainda não tiver sido aplicada (aí o cálculo é a própria resumo_empresas).
do $$
begin
  if to_regprocedure('public.resumo_empresas_calcular(jsonb)') is not null then
    alter function public.resumo_empresas_calcular(jsonb) set enable_nestloop = off;
  else
    alter function public.resumo_empresas(jsonb) set enable_nestloop = off;
  end if;
end $$;

-- ---------------------------------------------------------------- 2. salvar usuário de uma vez
-- p_plano = {ramos[], ufs[], modalidade, cota_mensal, validade, observacao} (null = sem o produto Consulta).
create or replace function public.admin_salvar_usuario(p_user uuid, p_email text, p_nome text, p_papel text,
                                                       p_ativo boolean, p_novo boolean, p_ramos text[] default '{}',
                                                       p_grupos bigint[] default '{}', p_plano jsonb default null,
                                                       p_pacote_inicial int default null, p_por uuid default null)
returns void
language plpgsql volatile security definer set search_path = '' as $$
declare
  ramos  text[] := coalesce(p_ramos, '{}');
  grupos bigint[] := coalesce(p_grupos, '{}');
begin
  if p_papel is null or p_papel not in ('admin', 'equipe', 'consulta', 'cliente') then
    raise exception 'Papel inválido.' using errcode = '22023';
  end if;
  if p_papel = 'equipe' and cardinality(ramos) = 0 then
    raise exception 'Escolha pelo menos um ramo para a pessoa da equipe.' using errcode = '22023';
  end if;
  if p_papel = 'cliente' and p_plano is null and cardinality(grupos) = 0 then
    raise exception 'Escolha pelo menos um produto para o cliente.' using errcode = '22023';
  end if;

  if p_novo then
    insert into public.app_usuarios (user_id, email, nome, papel, ativo)
    values (p_user, lower(btrim(p_email)), p_nome, p_papel, coalesce(p_ativo, true));
  else
    update public.app_usuarios set nome = p_nome, papel = p_papel, ativo = coalesce(p_ativo, ativo)
     where user_id = p_user;
    if not found then raise exception 'Usuário não encontrado.' using errcode = 'P0002'; end if;
  end if;

  -- ramos: só a equipe tem
  delete from public.equipe_ramos where user_id = p_user and (p_papel <> 'equipe' or ramo <> all (ramos));
  if p_papel = 'equipe' then
    insert into public.equipe_ramos (user_id, ramo) select p_user, r from unnest(ramos) r on conflict do nothing;
  end if;

  -- grupos: todos menos o admin (que já vê todos)
  delete from public.grupo_membros where user_id = p_user and (p_papel = 'admin' or grupo_id <> all (grupos));
  if p_papel <> 'admin' then
    insert into public.grupo_membros (user_id, grupo_id) select p_user, g from unnest(grupos) g on conflict do nothing;
  end if;

  -- plano do produto Consulta (só cliente); sem ele, o plano sai e as liberações ficam no histórico
  if p_papel = 'cliente' and p_plano is not null then
    insert into public.clientes_acesso as c (user_id, ramos, ufs, modalidade, cota_mensal, validade, observacao, atualizado_em)
    values (p_user,
            array(select jsonb_array_elements_text(coalesce(p_plano->'ramos', '[]'))),
            nullif(array(select jsonb_array_elements_text(coalesce(p_plano->'ufs', '[]'))), '{}'),
            p_plano->>'modalidade',
            case when p_plano->>'modalidade' = 'mensal' then (p_plano->>'cota_mensal')::int end,
            (p_plano->>'validade')::date,
            nullif(btrim(p_plano->>'observacao'), ''),
            now())
    on conflict (user_id) do update
       set ramos = excluded.ramos, ufs = excluded.ufs, modalidade = excluded.modalidade,
           cota_mensal = excluded.cota_mensal, validade = excluded.validade, observacao = excluded.observacao,
           atualizado_em = excluded.atualizado_em;
    if p_novo and p_plano->>'modalidade' = 'pacote' and coalesce(p_pacote_inicial, 0) > 0 then
      insert into public.clientes_pacotes (user_id, quantidade, observacao, criado_por)
      values (p_user, p_pacote_inicial, 'pacote inicial', p_por);
    end if;
  else
    delete from public.clientes_acesso where user_id = p_user;
  end if;
end $$;
revoke all on function public.admin_salvar_usuario(uuid, text, text, text, boolean, boolean, text[], bigint[], jsonb, int, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_salvar_usuario(uuid, text, text, text, boolean, boolean, text[], bigint[], jsonb, int, uuid)
  to service_role;

-- ---------------------------------------------------------------- 3. sempre um admin ativo
-- A trava consultiva serializa quem tira um admin: o segundo espera o primeiro terminar e, ao contar, já vê a
-- mudança dele (READ COMMITTED: cada consulta da função tira um retrato novo).
create or replace function public.app_usuarios_manter_admin() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'admin' and old.ativo
     and (tg_op = 'DELETE' or new.papel is distinct from 'admin' or not coalesce(new.ativo, false)) then
    perform pg_advisory_xact_lock(hashtext('app_usuarios_manter_admin'));
    if not exists (select 1 from public.app_usuarios
                    where papel = 'admin' and ativo and user_id <> old.user_id) then
      raise exception 'O sistema precisa de pelo menos um administrador ativo.' using errcode = 'P0001',
        hint = 'ultimo_admin';
    end if;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
revoke all on function public.app_usuarios_manter_admin() from public, anon, authenticated;

drop trigger if exists app_usuarios_manter_admin on public.app_usuarios;
create trigger app_usuarios_manter_admin before update of papel, ativo or delete on public.app_usuarios
  for each row execute function public.app_usuarios_manter_admin();

notify pgrst, 'reload schema';

commit;
