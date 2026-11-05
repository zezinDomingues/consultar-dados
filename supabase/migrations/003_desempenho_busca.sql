-- 003 · Desempenho da busca e do resumo (04/11/2026)
--
-- Sintoma: "Indústrias médias/grandes no interior com Lucro Real recente" estourava o statement_timeout (8 s)
-- tanto na tela de Consulta quanto no agente.
-- Causa 1: buscar_empresas montava TODAS as colunas da view (telefones/endereço/CEP formatados) das ~4.800
--          empresas filtradas antes de ordenar e cortar as 10 da página (7,5 s).
-- Causa 2: o planejador estimava 1 linha para porte+regime+situação juntos (são colunas correlacionadas) e
--          escolhia laços aninhados: 3,6 milhões de comparações com a tabela de municípios.
-- Idempotente.

-- 1) Busca em duas etapas: escolhe os CNPJs da página com o mínimo de colunas e só depois monta as linhas.
create or replace function public.buscar_empresas(f jsonb default '{}'::jsonb, ordem text default 'score'::text,
                                                  limite integer default 50, pagina integer default 1)
returns setof public.empresas_completa
language plpgsql
stable
as $function$
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

-- 2) Estatísticas de colunas correlacionadas (o planejador para de estimar "1 linha").
--    O filtro dinâmico compara a coluna convertida (e.porte::text = any(...)); estatística da coluna pura não
--    vale para a expressão, por isso as estatísticas são sobre as próprias expressões ::text.
create statistics if not exists empresas_regime_stats (dependencies, mcv)
  on porte, regime, situacao_regime, prioridade from public.empresas;
create statistics if not exists empresas_regime_txt_stats (mcv)
  on (porte::text), (regime::text), (situacao_regime::text), (prioridade::text) from public.empresas;
create statistics if not exists empresas_local_stats (dependencies, mcv)
  on municipio, cnae_principal from public.empresas;
analyze public.empresas;
analyze public.municipios;
analyze public.cnae;
