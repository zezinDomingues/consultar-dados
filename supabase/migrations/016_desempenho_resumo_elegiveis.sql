-- 016 — desempenho (07/11/2026; revista e testada em rollback na QA rodada 1, 09/11/2026)
--
-- 1) disparo_contar_elegiveis: os NOT EXISTS correlacionados rodavam 1 subconsulta por empresa com celular
--    (232 mil × 4). Agora cada lista (já contatados, bloqueados, celular compartilhado) vira um conjunto em hash
--    calculado UMA vez (NOT IN com subconsulta sem nulos). Mesmo resultado (conferido em 6 filtros), 3–4× mais
--    rápido (base inteira 2,9 s → 0,8 s). Devolve também 'elegiveis_sem_excluir', para a tela fazer UMA chamada em
--    vez de duas (Nova campanha: 2,9 + 1,6 s → 0,8 s).
-- 2) resumo_empresas: agregar as 868 mil empresas leva 1,2–3,7 s e acontecia em toda Consulta sem filtro.
--    resumo_cache guarda o resultado da base inteira e de cada UF (chave = o WHERE gerado): 0,02–0,05 s. Os dados
--    só mudam na carga — o carga_estado.py roda no fim, e quem mexer na base à mão deve rodar:
--        select public.atualizar_resumo_cache();
--    Sem isso a Consulta mostra os totais antigos (não quebra).
-- 3) O cálculo do resumo roda com enable_nestloop = off: com o RLS ligado, o planejador não usa as estatísticas
--    de capital_social e data_abertura (os operadores de numeric e date não são "leakproof") e estima 1 linha para
--    uma FAIXA ("capital entre X e Y", "idade de 5 a 30 anos") → laço aninhado com cnae × municipios por empresa →
--    mais de 40 s: hoje a Consulta com mínimo E máximo cai no limite de 8 s. Com hash: 0,8–3,3 s.
-- Idempotente. Tem cifrões (corpo de função): o aplicar_sql.py roda o arquivo inteiro de uma vez.

begin;

create or replace function public.disparo_contar_elegiveis(f jsonb default '{}'::jsonb,
                                                            excluir_compartilhados boolean default true,
                                                            p_grupo bigint default null)
returns jsonb
language plpgsql stable as $$
declare r jsonb;
        g bigint;
begin
  if not public.is_app_admin() then
    raise exception 'apenas administradores';
  end if;
  g := coalesce(p_grupo, (select min(id) from public.disparo_grupos));
  execute format($q$
    with e as (
      select e.cnpj, substr(e.whatsapp_e164, 4) as tel
        from public.empresas_completa e
       where %2$s and e.whatsapp_e164 is not null
    ), x as (
      select e.*,
             e.tel not in (select d.telefone from public.disparos d where d.grupo_id = %1$s and d.telefone is not null)
         and e.cnpj not in (select d.cnpj from public.disparos d where d.grupo_id = %1$s and d.cnpj is not null)
         and e.tel not in (select b.telefone from public.disparo_bloqueios b
                            where (b.grupo_id is null or b.grupo_id = %1$s) and b.telefone is not null) as livre,
             e.tel in (select o.whatsapp from public.empresas o where o.whatsapp is not null
                        group by o.whatsapp having count(*) > 1) as compartilhado
        from e
    )
    select jsonb_build_object(
      'com_whatsapp', count(*),
      'elegiveis', count(*) filter (where livre and (not %3$s or not compartilhado)),
      'elegiveis_sem_excluir', count(*) filter (where livre))
      from x$q$, g, public.empresas_where(f), case when excluir_compartilhados then 'true' else 'false' end) into r;
  return r;
end $$;
revoke all on function public.disparo_contar_elegiveis(jsonb, boolean, bigint) from public, anon;
grant execute on function public.disparo_contar_elegiveis(jsonb, boolean, bigint) to authenticated, service_role;

-- ---------------------------------------------------------------- cache do resumo
create table if not exists public.resumo_cache (
  chave         text primary key,          -- public.empresas_where(f)
  valor         jsonb not null,
  atualizado_em timestamptz not null default now()
);
alter table public.resumo_cache enable row level security;
drop policy if exists "equipe le" on public.resumo_cache;
create policy "equipe le" on public.resumo_cache for select to authenticated using ((select public.is_app_user()));
revoke all on public.resumo_cache from anon, authenticated;
grant select on public.resumo_cache to authenticated;

-- O cálculo de verdade (o corpo da 010), com outro nome.
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'resumo_empresas_calcular' and pronamespace = 'public'::regnamespace) then
    alter function public.resumo_empresas(jsonb) rename to resumo_empresas_calcular;
  end if;
end $$;
alter function public.resumo_empresas_calcular(jsonb) set enable_nestloop = off;   -- ver o item 3 do cabeçalho
revoke all on function public.resumo_empresas_calcular(jsonb) from public, anon;
grant execute on function public.resumo_empresas_calcular(jsonb) to authenticated, service_role;

create or replace function public.resumo_empresas(f jsonb default '{}'::jsonb)
returns jsonb language plpgsql stable as $$
declare r jsonb;
begin
  select valor into r from public.resumo_cache where chave = public.empresas_where(f);
  return coalesce(r, public.resumo_empresas_calcular(f));
end $$;
revoke all on function public.resumo_empresas(jsonb) from public, anon;
grant execute on function public.resumo_empresas(jsonb) to authenticated, service_role;

-- Refaz o cache: base inteira + cada UF. Rodar depois de toda carga (só service_role/postgres).
create or replace function public.atualizar_resumo_cache() returns int
language plpgsql volatile set statement_timeout = 0 as $$
declare f jsonb;
        n int := 0;
begin
  delete from public.resumo_cache where true;   -- "where true": a extensão safeupdate recusa DELETE sem WHERE
  for f in select '{}'::jsonb
           union all
           select jsonb_build_object('ufs', jsonb_build_array(uf)) from (select distinct uf::text as uf from public.municipios
                                                                          where qtd_empresas > 0) u loop
    insert into public.resumo_cache (chave, valor) values (public.empresas_where(f), public.resumo_empresas_calcular(f));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function public.atualizar_resumo_cache() from public, anon, authenticated;

select public.atualizar_resumo_cache();

notify pgrst, 'reload schema';

commit;
