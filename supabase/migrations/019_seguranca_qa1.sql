-- 019 · Segurança — correções da QA rodada 1 (09/11/2026)
--
-- O que muda (o código que está no ar, main 38120d1, continua funcionando: pela sessão ele só grava
-- disparos.atencao, as tabelas de Disparos do admin e as reuniões; o resto é pela chave secreta):
--   SEC-01  disparos: a sessão só altera a coluna `atencao` (antes: a linha inteira — numero_id, chat_id,
--           telefone, status… — para cliente e equipe).
--   SEC-02  equipe: disparos/conversas só dos grupos de que é membro E dos seus ramos; campanhas e grupos só
--           dos grupos de que é membro; números (disparo_numeros) só o admin lê. Para as telas de equipe/cliente
--           que mostram "Enviado por" e a capacidade: função disparo_numeros_visiveis() sem as colunas secretas.
--   SEC-04  registrar_lead_site: limite também sem IP (balde comum por hora) + teto global por dia; limite
--           atingido = SQLSTATE PT429 (o PostgREST responde HTTP 429). Assinatura igual.
--   SEC-07  pessoas_dos_meus_grupos: só quem divide grupo comigo (ou marcou reunião nele); e-mail só para admin.
--   SEC-08  leads_site: leitura só para admin.
--   SEC-09  reunioes: o update não muda criado_por (coluna fora do grant) e o with check exige ser o dono e
--           membro do grupo (admin segue editando todas).
--   SEC-10  agente_uso + agente_consumir(): limite de perguntas ao agente por usuário (minuto e dia).
--   SEC-12  bucket "marcas": só JPG/PNG até 3 MB, também no Storage.
--   Varredura: tira privilégios que nenhuma tela usa (o RLS já barrava, mas grant largo é risco à toa).
-- Idempotente: pode rodar de novo.

begin;

-- ---------------------------------------------------------------------------------------------------------
-- SEC-01 · disparos: pela sessão só se marca "visto" (atencao). Todo o resto é do servidor (chave secreta).
-- ---------------------------------------------------------------------------------------------------------
revoke update on public.disparos from authenticated;
grant update (atencao) on public.disparos to authenticated;

-- SEC-02 · equipe interna: só os grupos de que é membro (grupo_membros) e, dentro deles, só os seus ramos
drop policy if exists "equipe le seus ramos" on public.disparos;
drop policy if exists "equipe le seus grupos e ramos" on public.disparos;
create policy "equipe le seus grupos e ramos" on public.disparos for select to authenticated
  using ((select public.meu_papel()) = 'equipe'
         and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))
         and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])));
drop policy if exists "equipe marca seus ramos" on public.disparos;
drop policy if exists "equipe marca seus grupos e ramos" on public.disparos;
create policy "equipe marca seus grupos e ramos" on public.disparos for update to authenticated
  using ((select public.meu_papel()) = 'equipe'
         and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))
         and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])))
  with check ((select public.meu_papel()) = 'equipe'
              and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))
              and ramo = any (coalesce((select public.meus_ramos()), '{}'::text[])));
-- "cliente le seu grupo" e "cliente marca seu grupo" (015) continuam; com o grant acima o cliente só muda atencao.

drop policy if exists "equipe le conversas" on public.disparo_eventos;
create policy "equipe le conversas" on public.disparo_eventos for select to authenticated
  using ((select public.meu_papel()) = 'equipe'
         and exists (select 1 from public.disparos d
                      where d.id = disparo_eventos.disparo_id
                        and d.grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))
                        and d.ramo = any (coalesce((select public.meus_ramos()), '{}'::text[]))));

drop policy if exists "equipe le" on public.disparo_campanhas;
create policy "equipe le" on public.disparo_campanhas for select to authenticated
  using ((select public.meu_papel()) = 'equipe'
         and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));

-- grupos: fora o admin, cada um vê só os grupos de que é membro ("membro le o seu", da 015)
drop policy if exists "equipe le" on public.disparo_grupos;
drop policy if exists "cliente le o seu" on public.disparo_grupos; -- igual a "membro le o seu"

-- números: só o admin lê a tabela (telefone, waha_url, waha_sessao…). A API key e o client_token continuam
-- fora do grant de select: nem o admin os lê pela sessão (só o servidor, com a chave secreta).
drop policy if exists "equipe le" on public.disparo_numeros;
drop policy if exists "cliente le seu grupo" on public.disparo_numeros;

-- O que equipe e cliente precisam dos números (rótulo e telefone em "Enviado por", ativo/limite para a
-- capacidade): só dos grupos de que são membros e sem nenhuma coluna secreta. Admin: todos.
create or replace function public.disparo_numeros_visiveis()
returns table (id bigint, grupo_id bigint, rotulo text, telefone text, status text, ativo boolean,
               limite_diario int, webhook_em timestamptz)
language sql stable security definer set search_path = '' as $$
  with eu as (select public.is_app_admin() as admin, public.meu_papel() as papel, public.meus_grupos() as grupos)
  select n.id, n.grupo_id, n.rotulo, n.telefone, n.status, n.ativo, n.limite_diario, n.webhook_em
    from public.disparo_numeros n, eu
   where eu.admin or (eu.papel in ('equipe', 'cliente') and n.grupo_id = any (eu.grupos))
   order by n.id
$$;
revoke all on function public.disparo_numeros_visiveis() from public, anon;
grant execute on function public.disparo_numeros_visiveis() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- SEC-04 · formulário do site: limite com e sem IP + teto global. Limite atingido → SQLSTATE PT429
-- (o PostgREST devolve HTTP 429; no supabase-js, error.code = 'PT429' e error.details diz qual balde).
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.registrar_lead_site(dados jsonb, ip text default null, user_agent text default null)
returns bigint
language plpgsql volatile security definer set search_path = '' as $$
declare
  novo  bigint;
  campo text;
  v_ip  text;
  -- limites (o banco está perto do teto do plano grátis: cada lead ocupa ~1 kB)
  por_ip_10min constant int := 15;
  por_ip_dia   constant int := 40;
  sem_ip_hora  constant int := 20;  -- todos os envios sem IP (ou com IP inválido) dividem este balde
  global_dia   constant int := 300; -- teto do site inteiro em 24 h
begin
  if coalesce(btrim(dados->>'nome'), '') = '' then
    raise exception 'nome obrigatório';
  end if;
  foreach campo in array array['nome','empresa','cnpj','email','whatsapp','segmento','origem','pagina'] loop
    if length(coalesce(dados->>campo, '')) > 300 then raise exception 'campo % muito longo', campo; end if;
  end loop;
  if length(coalesce(dados->>'mensagem', '')) > 4000 then raise exception 'mensagem muito longa'; end if;

  -- só vale IP de verdade; texto qualquer cai no balde "sem IP"
  begin
    v_ip := host(nullif(btrim(ip), '')::inet);
  exception when others then
    v_ip := null;
  end;

  -- um envio por vez: as contagens abaixo ficam exatas mesmo com rajada em paralelo
  perform pg_advisory_xact_lock(hashtext('public.registrar_lead_site'));

  if (select count(*) from public.leads_site l where l.criado_em > now() - interval '24 hours') >= global_dia then
    raise sqlstate 'PT429' using message = 'limite de envios atingido', detail = 'global_dia',
      hint = 'O site recebeu envios demais hoje. Tente novamente mais tarde.';
  end if;
  if v_ip is null then
    if (select count(*) from public.leads_site l
         where l.ip is null and l.criado_em > now() - interval '1 hour') >= sem_ip_hora then
      raise sqlstate 'PT429' using message = 'limite de envios atingido', detail = 'sem_ip_hora',
        hint = 'Tente novamente em alguns minutos.';
    end if;
  else
    if (select count(*) from public.leads_site l
         where l.ip = v_ip and l.criado_em > now() - interval '10 minutes') >= por_ip_10min then
      raise sqlstate 'PT429' using message = 'limite de envios atingido', detail = 'ip_10min',
        hint = 'Tente novamente em alguns minutos.';
    end if;
    if (select count(*) from public.leads_site l
         where l.ip = v_ip and l.criado_em > now() - interval '24 hours') >= por_ip_dia then
      raise sqlstate 'PT429' using message = 'limite de envios atingido', detail = 'ip_dia',
        hint = 'Tente novamente amanhã.';
    end if;
  end if;

  insert into public.leads_site (tipo, origem, pagina, nome, empresa, cnpj, email, whatsapp, mensagem, segmento, ip, user_agent)
  values (
    case when dados->>'tipo' = 'parceiro' then 'parceiro' else 'contato' end,
    nullif(btrim(dados->>'origem'), ''), nullif(btrim(dados->>'pagina'), ''),
    btrim(dados->>'nome'), nullif(btrim(dados->>'empresa'), ''), nullif(upper(regexp_replace(coalesce(dados->>'cnpj', ''), '[^0-9A-Za-z]', '', 'g')), ''),
    nullif(lower(btrim(dados->>'email')), ''), nullif(btrim(dados->>'whatsapp'), ''), nullif(btrim(dados->>'mensagem'), ''),
    nullif(btrim(dados->>'segmento'), ''), v_ip, left(user_agent, 300)
  )
  returning id into novo;
  return novo;
end $$;
revoke all on function public.registrar_lead_site(jsonb, text, text) from public;
grant execute on function public.registrar_lead_site(jsonb, text, text) to anon, authenticated, service_role;

-- SEC-08 · leads do site: só administradores leem (nenhuma tela lê pela sessão hoje)
drop policy if exists "app le leads do site" on public.leads_site;
drop policy if exists "admin le leads do site" on public.leads_site;
create policy "admin le leads do site" on public.leads_site for select to authenticated
  using ((select public.is_app_admin()));

-- ---------------------------------------------------------------------------------------------------------
-- SEC-07 · quem aparece no calendário: quem divide grupo comigo + quem marcou reunião num grupo meu.
-- A tela usa só user_id e nome; e-mail e papel ficam só para o admin.
-- ---------------------------------------------------------------------------------------------------------
create or replace function public.pessoas_dos_meus_grupos()
returns table (user_id uuid, nome text, email text, papel text)
language sql stable security definer set search_path = '' as $$
  with eu as (select (select auth.uid()) as uid, public.is_app_admin() as admin, public.meus_grupos() as grupos)
  select u.user_id,
         coalesce(nullif(btrim(u.nome), ''), case when eu.admin then split_part(u.email, '@', 1) else 'Sem nome' end),
         case when eu.admin then u.email end,
         case when eu.admin then u.papel end
    from public.app_usuarios u, eu
   where u.ativo
     and (eu.admin
          or (u.user_id = eu.uid and cardinality(eu.grupos) > 0)
          or exists (select 1 from public.grupo_membros m where m.user_id = u.user_id and m.grupo_id = any (eu.grupos))
          or exists (select 1 from public.reunioes r where r.criado_por = u.user_id and r.grupo_id = any (eu.grupos)))
   order by 2
$$;
revoke all on function public.pessoas_dos_meus_grupos() from public, anon;
grant execute on function public.pessoas_dos_meus_grupos() to authenticated;

-- Responsáveis por ramo (painel de Disparos, equipe interna): o nome basta; e-mail só para o admin.
create or replace function public.pessoas_equipe()
returns table (user_id uuid, nome text, email text, papel text)
language sql stable security definer set search_path = '' as $$
  select u.user_id, coalesce(nullif(u.nome, ''), split_part(u.email, '@', 1)),
         case when public.is_app_admin() then u.email end, u.papel
    from public.app_usuarios u
   where u.ativo and u.papel in ('admin', 'equipe', 'consulta') and public.is_app_user()
   order by 2
$$;
revoke all on function public.pessoas_equipe() from public, anon;
grant execute on function public.pessoas_equipe() to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- SEC-09 · reuniões: criado_por, criado_em e id não mudam pela sessão; o dono só edita nos grupos dele
-- ---------------------------------------------------------------------------------------------------------
revoke update on public.reunioes from authenticated;
grant update (titulo, inicio, fim, descricao, local, cnpj, disparo_id, grupo_id) on public.reunioes to authenticated;
drop policy if exists "dono ou admin altera" on public.reunioes;
create policy "dono ou admin altera" on public.reunioes for update to authenticated
  using ((select public.is_app_admin())
         or (criado_por = (select auth.uid()) and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))))
  with check ((select public.is_app_admin())
              or (criado_por = (select auth.uid()) and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))));

-- ---------------------------------------------------------------------------------------------------------
-- SEC-10 · limite de uso do agente de IA, por usuário (uma linha por pessoa: janela do minuto e do dia)
-- ---------------------------------------------------------------------------------------------------------
create table if not exists public.agente_uso (
  user_id  uuid primary key,
  minuto   timestamptz not null default date_trunc('minute', now()),
  n_minuto int not null default 0,
  dia      date not null default (now() at time zone 'America/Sao_Paulo')::date,
  n_dia    int not null default 0
);
alter table public.agente_uso enable row level security;
revoke all on public.agente_uso from public, anon, authenticated;

-- Conta 1 pergunta de quem chama. {ok:true, restam_minuto, restam_dia} ou {ok:false, motivo, espera_s}.
create or replace function public.agente_consumir(p_max_minuto int default 8, p_max_dia int default 200)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  uid  uuid := (select auth.uid());
  agora_min timestamptz := date_trunc('minute', now());
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  r    public.agente_uso;
begin
  if uid is null or not public.is_app_user() then
    return jsonb_build_object('ok', false, 'motivo', 'sem_acesso', 'espera_s', 0);
  end if;
  p_max_minuto := least(greatest(coalesce(p_max_minuto, 8), 1), 60);
  p_max_dia := least(greatest(coalesce(p_max_dia, 200), 1), 5000);
  insert into public.agente_uso (user_id) values (uid) on conflict (user_id) do nothing;
  select * into r from public.agente_uso where user_id = uid for update;
  if r.minuto < agora_min then r.minuto := agora_min; r.n_minuto := 0; end if;
  if r.dia < hoje then r.dia := hoje; r.n_dia := 0; end if;
  if r.n_dia >= p_max_dia then
    return jsonb_build_object('ok', false, 'motivo', 'dia',
      'espera_s', greatest(1, extract(epoch from (((hoje + 1)::timestamp at time zone 'America/Sao_Paulo') - now()))::int));
  end if;
  if r.n_minuto >= p_max_minuto then
    return jsonb_build_object('ok', false, 'motivo', 'minuto',
      'espera_s', greatest(1, ceil(extract(epoch from (r.minuto + interval '1 minute' - now())))::int));
  end if;
  update public.agente_uso
     set minuto = r.minuto, n_minuto = r.n_minuto + 1, dia = r.dia, n_dia = r.n_dia + 1
   where user_id = uid;
  return jsonb_build_object('ok', true, 'restam_minuto', p_max_minuto - r.n_minuto - 1, 'restam_dia', p_max_dia - r.n_dia - 1);
end $$;
revoke all on function public.agente_consumir(int, int) from public, anon;
grant execute on function public.agente_consumir(int, int) to authenticated;

-- ---------------------------------------------------------------------------------------------------------
-- SEC-12 · logos: o próprio Storage recusa o que não for JPG/PNG até 3 MB (o servidor já confere a assinatura)
-- ---------------------------------------------------------------------------------------------------------
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'image/png'], file_size_limit = 3145728
 where id = 'marcas';

-- ---------------------------------------------------------------------------------------------------------
-- Varredura de privilégios (09/11/2026). O padrão do Supabase dá TUDO a anon/authenticated em tabela e função
-- novas; o RLS barrava, mas fica só o que o código usa pela sessão:
--   escreve pela sessão: disparo_campanhas (ins/upd), disparo_grupos (ins/upd), disparo_numeros (ins/upd/del),
--   disparo_config (upd), disparo_bloqueios (ins/del), disparos (upd atencao), reunioes (ins/upd/del),
--   agente_conversas (ins/upd/del) — o RLS limita ao admin/dono.
--   usuários, ramos, grupos de pessoas, planos e pacotes: só pela chave secreta (Usuários).
-- ---------------------------------------------------------------------------------------------------------
revoke all on public.app_usuarios from anon;
revoke insert, update, delete, truncate, references, trigger on public.app_usuarios from authenticated;
grant select on public.app_usuarios to authenticated;

revoke insert, update, delete on public.clientes_acesso, public.clientes_pacotes from authenticated;
revoke delete on public.clientes_liberacoes from authenticated;
revoke insert, delete on public.equipe_ramos, public.grupo_membros from authenticated;
revoke insert on public.disparo_eventos from authenticated; -- eventos e mensagens manuais: servidor (chave secreta)
revoke insert, update, delete, truncate, references, trigger on public.disparo_plano from authenticated;

revoke all on public.empresas_completa, public.disparo_campanhas_numeros from anon, authenticated;
grant select on public.empresas_completa, public.disparo_campanhas_numeros to authenticated;

do $$
declare t text;
begin
  foreach t in array array['empresas', 'cnae', 'municipios', 'contadores_grupos', 'farmacias_manipulacao'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke references, trigger on public.%I from authenticated', t);
    end if;
  end loop;
end $$;

-- funções que ninguém chama pela API
revoke all on function public.disparo_token() from public, anon, authenticated;            -- default de disparos.token
grant execute on function public.disparo_token() to service_role;
revoke all on function public.disparo_campanha_limpa_fila() from public, anon, authenticated; -- gatilho
revoke all on function public.fone_norm(text) from public, anon;

notify pgrst, 'reload schema';

commit;
