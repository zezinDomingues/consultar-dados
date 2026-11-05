-- 011 · Compactar índices para caber no plano grátis (05/11/2026)
--
-- Depois da carga de BA e MG (inserts linha a linha + atualização dos "compartilhados" em SP) o banco foi a
-- 560 MB, acima do limite de 500 MB do plano grátis. Os dados vivos são ~282 MB; o excesso está nos índices:
--   * score e capital levavam o CNPJ (texto) junto — trocados por índices só da coluna numérica. A ordem
--     "score desc, cnpj" continua usando o índice (o Postgres completa o desempate com incremental sort).
--   * os demais índices são reconstruídos compactos (REINDEX), um por vez.
-- Nenhum dado é apagado. Idempotente.

set statement_timeout = 0;

drop index if exists public.empresas_score_idx;
create index empresas_score_idx on public.empresas (score desc);

drop index if exists public.empresas_capital_idx;
create index empresas_capital_idx on public.empresas (capital_social desc nulls last);

reindex index public.empresas_email_idx;
reindex index public.empresas_pkey;
reindex index public.empresas_cnae_idx;
reindex index public.empresas_uf_municipio_idx;
reindex index public.empresas_prioridade_idx;
reindex index public.empresas_whatsapp_idx;

vacuum full public.contadores_grupos;
vacuum full public.municipios;
vacuum full public.cnae;
analyze public.empresas;

select pg_size_pretty(pg_database_size('postgres')) as banco_total;
