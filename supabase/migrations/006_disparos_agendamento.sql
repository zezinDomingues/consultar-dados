-- 006 · Relógio dos disparos (05/11/2026)
--
-- O pg_cron do Supabase chama o ciclo da plataforma a cada minuto, mas SÓ quando há o que fazer
-- (disparo_precisa_ciclo: dentro do horário, sem pausa geral, com campanha ativa e número pronto) — fora disso
-- nenhuma chamada sai, e a Vercel não é acordada à toa.
--
-- Pré-requisito: o segredo do ciclo guardado no Vault com o nome 'disparos_segredo' (o MESMO valor da variável
-- DISPAROS_SEGREDO na Vercel). Criar uma vez:
--   select vault.create_secret('<segredo>', 'disparos_segredo', 'Bearer do ciclo de disparos de WhatsApp');
-- Trocar depois:
--   select vault.update_secret((select id from vault.secrets where name = 'disparos_segredo'), '<novo>');
--
-- Idempotente: cron.schedule com o mesmo nome substitui o agendamento.

create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'disparos-ciclo',
  '* * * * *',
  $cron$
  select net.http_post(
           url := 'https://www.oficialcert.com/api/sistema/disparos/ciclo',
           body := '{}'::jsonb,
           headers := jsonb_build_object(
             'Content-Type', 'application/json',
             'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                                             where name = 'disparos_segredo' limit 1)),
           timeout_milliseconds := 55000)
   where public.disparo_precisa_ciclo()
  $cron$
);
