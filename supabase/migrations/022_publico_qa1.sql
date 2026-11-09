-- 022 · Bloqueio progressivo do login (QA rodada 1, PB-04) — 09/11/2026
--
-- O /login só tinha o limite do próprio Supabase: 11 senhas erradas seguidas passavam sem espera. Agora o servidor
-- (src/app/login/bloqueio.ts, pela chave secreta) conta as falhas em duas chaves:
--   ei:<sha256(e-mail|IP)>  → a partir da 5ª falha seguida, espera 30 s, 1 min, 2 min, 4 min, 8 min, 15 min (teto)
--   ip:<sha256(IP)>         → o mesmo a partir da 30ª (quem testa muitos e-mails do mesmo lugar)
-- "Seguida" = sem 30 min de pausa entre uma falha e outra (maior que o teto de 15 min: esperar o bloqueio acabar
-- não zera a contagem). Entrar certo zera a chave e-mail+IP. Vale igual para e-mail que existe e que não existe.
-- Só hashes: o e-mail nunca fica em claro aqui. Linhas sem falha há 1 dia são apagadas a cada falha nova.
--
-- Compatível com o código no ar (38120d1), que não usa nada disto. Sem a 022, o código novo segue sem o bloqueio
-- próprio (não dá erro). Tem bloco de função ($$): rodar o arquivo inteiro numa execução só. Idempotente.

begin;

create table if not exists public.login_tentativas (
  chave         text primary key check (length(chave) <= 100),
  falhas        integer not null default 0,
  ultima_falha  timestamptz not null default now(),
  bloqueado_ate timestamptz
);
create index if not exists login_tentativas_ultima_idx on public.login_tentativas (ultima_falha);
alter table public.login_tentativas enable row level security;
-- ninguém de fora lê nem escreve: só as funções abaixo (e elas só para a chave secreta)
revoke all on public.login_tentativas from public, anon, authenticated;

-- Segundos que ainda faltam do maior bloqueio entre as chaves (0 = pode tentar).
create or replace function public.login_espera(chaves text[])
returns integer
language sql stable security definer set search_path = '' as $$
  select coalesce(max(ceil(extract(epoch from (t.bloqueado_ate - now())))), 0)::integer
  from public.login_tentativas t
  where t.chave = any (chaves) and t.bloqueado_ate > now()
$$;

-- Registra uma senha errada; devolve os segundos de espera que começam agora (0 enquanto não chegou ao limite).
create or replace function public.login_falhou(chave text, limite integer default 5)
returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
  espera integer := 0;
begin
  if coalesce(length(chave), 0) not between 4 and 100 then raise exception 'chave inválida'; end if;
  limite := greatest(coalesce(limite, 5), 1);
  insert into public.login_tentativas as t (chave, falhas, ultima_falha)
  values (login_falhou.chave, 1, now())
  on conflict on constraint login_tentativas_pkey do update
    set falhas = case when t.ultima_falha < now() - interval '30 minutes' then 1 else t.falhas + 1 end,
        ultima_falha = now()
  returning t.falhas into n;
  if n >= limite then
    espera := least(900, 30 * power(2, least(n - limite, 10)))::integer;
    update public.login_tentativas t set bloqueado_ate = now() + make_interval(secs => espera)
     where t.chave = login_falhou.chave;
  end if;
  delete from public.login_tentativas t where t.ultima_falha < now() - interval '1 day';
  return espera;
end $$;

-- Entrou com a senha certa: zera a contagem dessa chave.
create or replace function public.login_sucesso(chave text)
returns void
language sql security definer set search_path = '' as $$
  delete from public.login_tentativas t where t.chave = login_sucesso.chave
$$;

revoke all on function public.login_espera(text[]) from public, anon, authenticated;
revoke all on function public.login_falhou(text, integer) from public, anon, authenticated;
revoke all on function public.login_sucesso(text) from public, anon, authenticated;
grant execute on function public.login_espera(text[]) to service_role;
grant execute on function public.login_falhou(text, integer) to service_role;
grant execute on function public.login_sucesso(text) to service_role;

commit;

notify pgrst, 'reload schema';
