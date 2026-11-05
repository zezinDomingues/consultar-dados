-- 007 · Disparos: logo + botão na 1ª mensagem, coleta de nome e CNPJ pela conversa, final com botão do site (05/11/2026)
--
-- Formato da 1ª mensagem (campanha.formato):
--   'botao'   imagem (logo) + texto + rodapé + UM botão de resposta ("Quero a consulta")
--   'texto'   imagem + texto pedindo "responda SIM" (para quando o aparelho não mostrar botões)
--   'enquete' formato antigo (enquete Sim/Não) — mantido só por compatibilidade
-- Depois do "sim", o robô pergunta o nome completo e o CNPJ ali mesmo (disparos.etapa 'nome' → 'cnpj'), grava em
-- lead_nome / lead_cnpj e encerra com a logo + agradecimento + botão que abre o site. O telefone é o da conversa.
--
-- disparos.teste: conversa de teste disparada pelo administrador para o próprio WhatsApp. Fica fora do funil e dos
-- limites; um teste novo para o mesmo telefone apaga o anterior.
-- Idempotente.

alter table public.disparo_campanhas
  add column if not exists formato text not null default 'botao',
  add column if not exists imagem_url text,
  add column if not exists botao_texto text not null default '✅ Quero a consulta',
  add column if not exists rodape text,
  add column if not exists pergunta_nome text not null default 'Qual é o seu *nome completo*?',
  add column if not exists pergunta_cnpj text not null default 'Agora me informe o *CNPJ da empresa*.',
  add column if not exists botao_site_texto text not null default 'Acessar a plataforma',
  add column if not exists site_url text not null default 'https://www.oficialcert.com';

do $$ begin
  alter table public.disparo_campanhas add constraint disparo_campanhas_formato_ck check (formato in ('botao', 'texto', 'enquete'));
exception when duplicate_object then null; end $$;
-- limites do próprio WhatsApp: título de botão até 20 caracteres, rodapé até 60
do $$ begin
  alter table public.disparo_campanhas add constraint disparo_campanhas_botoes_ck
    check (char_length(botao_texto) between 1 and 20 and char_length(botao_site_texto) between 1 and 20
           and (rodape is null or char_length(rodape) <= 60) and site_url ~ '^https?://');
exception when duplicate_object then null; end $$;

alter table public.disparos
  add column if not exists etapa text,
  add column if not exists lead_cnpj text,
  add column if not exists tentativas int not null default 0,
  add column if not exists teste boolean not null default false;

do $$ begin
  alter table public.disparos add constraint disparos_etapa_ck check (etapa in ('nome', 'cnpj'));
exception when duplicate_object then null; end $$;

-- Funil e números por campanha sem as conversas de teste
create or replace function public.disparo_resumo(p_campanha bigint default null)
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
  where not teste and (p_campanha is null or campanha_id = p_campanha)
$$;

create or replace view public.disparo_campanhas_numeros with (security_invoker = true) as
select campanha_id,
       count(*)                                          as total,
       count(*) filter (where enviado_em is not null)    as enviados,
       count(*) filter (where lido_em is not null)       as lidos,
       count(*) filter (where respondido_em is not null) as responderam,
       count(*) filter (where interessado_em is not null) as interessados,
       count(*) filter (where preenchido_em is not null) as preencheram,
       count(*) filter (where status in ('sem_interesse', 'descadastrado')) as recusaram,
       count(*) filter (where status in ('sem_whatsapp', 'falhou')) as nao_entregues,
       max(enviado_em)                                   as ultimo_envio_em
from public.disparos
where not teste
group by campanha_id;

notify pgrst, 'reload schema';
