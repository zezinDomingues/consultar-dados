-- 008 · Disparos: sai o CNPJ, entra o número de contato (05/11/2026)
--
-- Coleta pela conversa: nome completo → "pode nos passar um número para contato?" (usar ESTE número | informar
-- OUTRO) → se outro, o robô pede o número. O número escolhido vai para disparos.lead_whatsapp.
-- Achado de 05/11: no WAHA (NOWEB) a mensagem com botões é ENTREGUE ao celular mas não aparece na tela; por isso o
-- formato padrão passa a ser 'texto' (responder SIM / 1 / 2). Os botões ficam para quando houver um provedor que os
-- desenhe (ex.: Z-API).
-- Idempotente.

alter table public.disparo_campanhas
  add column if not exists pergunta_contato text not null
    default 'Obrigado, {primeiro_nome}! Poderia nos informar um *número para entrarmos em contato*?',
  add column if not exists botao_mesmo_numero text not null default 'Usar este número',
  add column if not exists botao_outro_numero text not null default 'Informar outro',
  add column if not exists pergunta_telefone text not null
    default 'Claro! Me envie o número com DDD, por favor. Ex.: (11) 98765-4321';

alter table public.disparo_campanhas alter column formato set default 'texto';

do $$ begin
  alter table public.disparo_campanhas add constraint disparo_campanhas_botoes_contato_ck
    check (char_length(botao_mesmo_numero) between 1 and 20 and char_length(botao_outro_numero) between 1 and 20);
exception when duplicate_object then null; end $$;

alter table public.disparos drop constraint if exists disparos_etapa_ck;
alter table public.disparos add constraint disparos_etapa_ck check (etapa in ('nome', 'contato', 'telefone', 'cnpj'));

notify pgrst, 'reload schema';
