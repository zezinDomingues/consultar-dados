-- =====================================================================
-- Contatos vindos do site institucional (formulários "Fale com um
-- especialista", "Diagnóstico" e "Seja um parceiro").
-- O site é público: ele grava SÓ pela função registrar_lead_site (security
-- definer, valida e limita), nunca direto na tabela. Leitura: só usuários
-- autorizados da plataforma.
-- =====================================================================
create table if not exists public.leads_site (
  id         bigint generated always as identity primary key,
  criado_em  timestamptz not null default now(),
  tipo       text not null check (tipo in ('contato', 'parceiro')),
  origem     text,
  pagina     text,
  nome       text not null,
  empresa    text,
  cnpj       text,
  email      text,
  whatsapp   text,
  mensagem   text,
  segmento   text,
  ip         text,
  user_agent text
);
create index if not exists leads_site_criado_idx on public.leads_site (criado_em desc);
alter table public.leads_site enable row level security;
revoke all on public.leads_site from anon, authenticated;
grant select on public.leads_site to authenticated;
drop policy if exists "app le leads do site" on public.leads_site;
create policy "app le leads do site" on public.leads_site
  for select to authenticated using ((select public.is_app_user()));

create or replace function public.registrar_lead_site(dados jsonb, ip text default null, user_agent text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  novo bigint;
  campo text;
begin
  if coalesce(btrim(dados->>'nome'), '') = '' then
    raise exception 'nome obrigatório';
  end if;
  foreach campo in array array['nome','empresa','cnpj','email','whatsapp','segmento','origem','pagina'] loop
    if length(coalesce(dados->>campo, '')) > 300 then raise exception 'campo % muito longo', campo; end if;
  end loop;
  if length(coalesce(dados->>'mensagem', '')) > 4000 then raise exception 'mensagem muito longa'; end if;
  -- freio contra robô: no máximo 15 envios por IP a cada 10 minutos
  if ip is not null and (select count(*) from public.leads_site l
                         where l.ip = registrar_lead_site.ip and l.criado_em > now() - interval '10 minutes') >= 15 then
    raise exception 'muitos envios, tente mais tarde';
  end if;

  insert into public.leads_site (tipo, origem, pagina, nome, empresa, cnpj, email, whatsapp, mensagem, segmento, ip, user_agent)
  values (
    case when dados->>'tipo' = 'parceiro' then 'parceiro' else 'contato' end,
    nullif(btrim(dados->>'origem'), ''), nullif(btrim(dados->>'pagina'), ''),
    btrim(dados->>'nome'), nullif(btrim(dados->>'empresa'), ''), nullif(regexp_replace(coalesce(dados->>'cnpj', ''), '\D', '', 'g'), ''),
    nullif(lower(btrim(dados->>'email')), ''), nullif(btrim(dados->>'whatsapp'), ''), nullif(btrim(dados->>'mensagem'), ''),
    nullif(btrim(dados->>'segmento'), ''), ip, left(user_agent, 300)
  )
  returning id into novo;
  return novo;
end $$;
revoke all on function public.registrar_lead_site(jsonb, text, text) from public;
grant execute on function public.registrar_lead_site(jsonb, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
