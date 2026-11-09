-- 018 · Porte: separa "Demais (médio/grande)" em Médio porte e Grande porte (09/11/2026)
--
-- A Receita só tem ME, EPP e "Demais", e a base não tem faturamento. Critério escolhido pelo usuário:
--   Grande porte = "Demais" com capital social >= R$ 10 milhões; o resto do "Demais" = Médio porte.
-- Feito na VIEW (empresas_completa), não na tabela: regravar 395 mil linhas incharia o banco (454 de 500 MB no
-- plano grátis). Toda busca, resumo, agente, cliente e disparo lê a view, então tudo passa a ver os 4 portes.
-- A carga (carga_estado.py) continua gravando "Demais" — a view converte sozinha.
-- Estatística sobre a MESMA expressão: sem ela o planejador estimava 2,5 mil linhas para 179 mil (o erro que
-- derrubava a busca na 003). Mexeu na expressão do porte na view? Refaça a estatística igual.
--
-- SEM blocos de função (cifrões duplos): o aplicar_sql.py roda instrução por instrução com autocommit — o valor novo do enum precisa
-- estar gravado antes de ser usado na view. Idempotente.

alter type public.porte_empresa add value if not exists 'Médio porte';
alter type public.porte_empresa add value if not exists 'Grande porte';

create or replace view public.empresas_completa with (security_invoker = true) as
SELECT e.cnpj,
    (((((((substr(e.cnpj, 1, 2) || '.'::text) || substr(e.cnpj, 3, 3)) || '.'::text) || substr(e.cnpj, 6, 3)) || '/'::text) || substr(e.cnpj, 9, 4)) || '-'::text) || "right"(e.cnpj, 2) AS cnpj_formatado,
    "left"(e.cnpj, 8) AS raiz,
    e.prioridade,
    e.score,
    e.razao_social,
    e.nome_fantasia,
    e.tipo_negocio,
    e.matriz_filial,
    e.estabelecimentos_uf,
    c.secao,
    c.setor,
    c.macrossetor,
    c.divisao,
    c.ramo,
    c.grupo,
    c.segmento,
    e.cnae_principal,
    c.cnae_fmt,
    c.atividade AS atividade_principal,
    e.cnaes_secundarios,
    e.regime,
    e.forma_tributacao,
    e.ano_ecf,
    e.simples_out2026,
    e.data_opcao_simples,
    e.data_exclusao_simples,
    e.situacao_regime,
    e.data_situacao,
    e.data_abertura,
    EXTRACT(year FROM age(CURRENT_DATE::timestamp with time zone, e.data_abertura::timestamp with time zone))::integer AS idade_anos,
    CASE WHEN e.porte = 'Demais (médio/grande)'::public.porte_empresa THEN CASE WHEN e.capital_social >= 10000000::numeric THEN 'Grande porte'::public.porte_empresa ELSE 'Médio porte'::public.porte_empresa END ELSE e.porte END AS porte,
    e.capital_social,
        CASE
            WHEN e.capital_social < 10000::numeric THEN 'Até R$ 10 mil'::text
            WHEN e.capital_social < 100000::numeric THEN 'R$ 10 mil – 100 mil'::text
            WHEN e.capital_social < 1000000::numeric THEN 'R$ 100 mil – 1 mi'::text
            WHEN e.capital_social < 10000000::numeric THEN 'R$ 1 mi – 10 mi'::text
            WHEN e.capital_social < 100000000::numeric THEN 'R$ 10 mi – 100 mi'::text
            WHEN e.capital_social IS NOT NULL THEN 'Acima de R$ 100 mi'::text
            ELSE NULL::text
        END AS faixa_capital,
    e.uf::text AS uf,
    e.municipio,
    m.regiao_intermediaria,
    m.regiao_imediata,
    m.localizacao,
    e.tipo_logradouro,
    e.logradouro,
    e.numero,
    e.complemento,
    e.bairro,
    ("left"(e.cep, 5) || '-'::text) || "right"(e.cep, 3) AS cep,
    TRIM(BOTH FROM concat_ws(' – '::text, concat_ws(', '::text, NULLIF(TRIM(BOTH FROM concat_ws(' '::text, e.tipo_logradouro, e.logradouro)), ''::text), e.numero), e.complemento)) AS endereco,
    public.fmt_tel(e.telefone1) AS telefone1,
    e.telefone1_tipo,
    e.telefone1_original,
    public.fmt_tel(e.telefone2) AS telefone2,
    e.telefone2_tipo,
    e.telefone2_original,
    public.fmt_tel(e.whatsapp) AS whatsapp,
    '+55'::text || e.whatsapp AS whatsapp_e164,
    'https://wa.me/55'::text || e.whatsapp AS whatsapp_link,
    e.empresas_mesmo_telefone,
    e.email,
    e.email_tipo,
    COALESCE(e.email_original, e.email) AS email_original,
    e.empresas_mesmo_email,
    e.estabelecimentos_uf AS estabelecimentos_sp
   FROM public.empresas e
     LEFT JOIN public.cnae c ON c.cnae = e.cnae_principal
     LEFT JOIN public.municipios m ON m.uf = e.uf AND m.municipio = e.municipio;

create statistics if not exists public.empresas_porte_det_stats
  on ((CASE WHEN porte = 'Demais (médio/grande)'::public.porte_empresa THEN CASE WHEN capital_social >= 10000000::numeric THEN 'Grande porte'::public.porte_empresa ELSE 'Médio porte'::public.porte_empresa END ELSE porte END)::text) from public.empresas;

analyze public.empresas;
