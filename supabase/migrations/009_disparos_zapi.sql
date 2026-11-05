-- 009 · Disparos: número pela Z-API (botões que aparecem no celular) além do WAHA (05/11/2026)
--
-- disparo_numeros.provedor: 'waha' (padrão; só texto/imagem — botão chega invisível) ou 'zapi' (send-button-actions).
-- Na Z-API: waha_url = https://api.z-api.io, waha_sessao = ID da instância, waha_api_key = token da instância e
-- client_token = token de segurança da conta (header Client-Token). Como a API key, o client_token não é legível
-- pelo papel authenticated.
-- Idempotente.

alter table public.disparo_numeros
  add column if not exists provedor text not null default 'waha',
  add column if not exists client_token text;

do $$ begin
  alter table public.disparo_numeros add constraint disparo_numeros_provedor_ck check (provedor in ('waha', 'zapi'));
exception when duplicate_object then null; end $$;

grant select (provedor) on public.disparo_numeros to authenticated;

notify pgrst, 'reload schema';
