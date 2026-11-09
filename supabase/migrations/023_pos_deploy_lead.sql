-- 023 · Tira do anon/authenticated o execute da registrar_lead_site (QA rodada 1, PB-03/SEC-04) — 09/11/2026
--
-- ⚠ SÓ APLICAR DEPOIS DO DEPLOY do código da QA rodada 1 (branch qa1/pb). ⚠
-- O /api/publico/lead novo chama a função pela chave secreta (service_role). O código que está no ar hoje
-- (main 38120d1) ainda chama com a chave PÚBLICA (anon): aplicada antes do deploy, esta migração faz o formulário
-- do site parar de gravar (o código antigo ainda diria "Recebemos" — PB-01) até o deploy sair.
--
-- Efeito: ninguém mais grava lead direto pelo PostgREST com a chave pública (POST /rest/v1/rpc/registrar_lead_site,
-- que pulava o route e as validações dele). O service_role mantém o execute (vem dos privilégios padrão do Supabase;
-- o grant abaixo só deixa explícito). Idempotente.
--
-- Conferir depois: select has_function_privilege('anon', 'public.registrar_lead_site(jsonb,text,text)', 'execute');
-- → false. E um envio de teste pelo site → "Recebemos" (200).

begin;

revoke execute on function public.registrar_lead_site(jsonb, text, text) from anon, authenticated;
grant execute on function public.registrar_lead_site(jsonb, text, text) to service_role;

commit;

notify pgrst, 'reload schema';
