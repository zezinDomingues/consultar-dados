-- 005 · Disparos de WhatsApp (05/11/2026)
--
-- Fluxo: CAMPANHA (filtros da Consulta + textos) → o CICLO (a cada minuto, chamado pelo pg_cron da migração 006)
-- escolhe a próxima empresa elegível, registra no livro `disparos` e envia pelo WAHA → a pessoa toca "Sim" na
-- enquete (ou responde SIM) → recebe o link do formulário → preenche → os dados voltam para o mesmo registro.
--
-- REGRA DE OURO: `disparos` tem UM registro por telefone e UM por CNPJ, para sempre (índices únicos). Ninguém
-- recebe a primeira mensagem duas vezes — nem com dois ciclos ao mesmo tempo, nem com duas campanhas de filtros
-- parecidos. Falhas e números sem WhatsApp também ficam registrados e não voltam para a fila. Não há DELETE para
-- a plataforma: o livro só cresce.
--
-- Acesso: só administradores (app_usuarios.papel = 'admin') leem e alteram pela plataforma. O ciclo, o webhook do
-- WAHA e o formulário público rodam no servidor com a chave secreta (service_role). A API key do WAHA não é legível
-- pelo papel authenticated (privilégio por coluna).
--
-- Sem chave estrangeira para `empresas`: a carga da base faz DROP ... CASCADE, e isso não pode apagar o livro.
-- Por isso o registro guarda um retrato da empresa (razão social, fantasia, município) no momento do envio.
--
-- Idempotente.

-- ---------------------------------------------------------------------
-- 0. Quem é administrador
-- ---------------------------------------------------------------------
create or replace function public.is_app_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.app_usuarios where user_id = (select auth.uid()) and papel = 'admin')
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

-- Telefone em qualquer formato → DDD + número (o formato de empresas.whatsapp). Celular antigo sem o 9 ganha o 9.
create or replace function public.fone_norm(t text) returns text
language sql immutable as $$
  with d as (select regexp_replace(coalesce(t, ''), '\D', '', 'g') as x),
       s as (select case when length(x) in (12, 13) and left(x, 2) = '55' then substr(x, 3) else x end as x from d)
  select case when length(x) = 10 and substr(x, 3, 1) in ('6', '7', '8', '9') then left(x, 2) || '9' || substr(x, 3)
              when length(x) in (10, 11) then x end
  from s
$$;

-- Código do link do formulário: 10 caracteres sem ambíguos (0/O, 1/l/I), ~58 bits de acaso.
-- Usa os bytes aleatórios do UUID v4 (pula os bytes 6 e 8, que carregam versão e variante).
create or replace function public.disparo_token() returns text
language sql volatile as $$
  select string_agg(substr('abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789', get_byte(b, i) % 56 + 1, 1), '' order by i)
  from (select uuid_send(gen_random_uuid()) as b) s, unnest(array[0, 1, 2, 3, 4, 5, 7, 9, 10, 11]) as i
$$;

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------

-- Regras gerais (uma linha só): janela de horário em Brasília e o botão de pausa geral.
create table if not exists public.disparo_config (
  id            smallint primary key default 1 check (id = 1),
  hora_inicio   smallint not null default 9 check (hora_inicio between 0 and 23),
  hora_fim      smallint not null default 18 check (hora_fim between 1 and 24),
  dias_semana   smallint[] not null default '{1,2,3,4,5}', -- ISO: 1 = segunda … 7 = domingo
  pausado       boolean not null default false,
  atualizado_em timestamptz not null default now(),
  check (hora_fim > hora_inicio)
);
insert into public.disparo_config (id) values (1) on conflict do nothing;

-- Números de WhatsApp = sessões do WAHA (no CORE, uma instância por número).
create table if not exists public.disparo_numeros (
  id               bigint generated always as identity primary key,
  rotulo           text not null check (char_length(rotulo) between 1 and 60),
  waha_url         text not null check (waha_url ~ '^https?://'),
  waha_sessao      text not null default 'default' check (char_length(waha_sessao) between 1 and 60),
  waha_api_key     text,                       -- só o servidor lê (ver os grants abaixo)
  telefone         text,                       -- preenchido pelo teste de conexão
  nome_perfil      text,
  ativo            boolean not null default true,
  limite_diario    int not null default 30 check (limite_diario between 1 and 2000),
  intervalo_min_s  int not null default 120 check (intervalo_min_s >= 20),
  intervalo_max_s  int not null default 300,
  status           text,                       -- WORKING, STOPPED, FAILED, SCAN_QR_CODE, STARTING ou ERRO
  status_detalhe   text,
  status_em        timestamptz,
  webhook_em       timestamptz,                -- quando a plataforma configurou o webhook no WAHA
  ultimo_evento_em timestamptz,                -- último webhook que chegou (prova de que a volta funciona)
  proximo_envio_em timestamptz not null default now(),
  ultimo_envio_em  timestamptz,
  criado_em        timestamptz not null default now(),
  check (intervalo_max_s >= intervalo_min_s)
);

create table if not exists public.disparo_campanhas (
  id                     bigint generated always as identity primary key,
  nome                   text not null check (char_length(nome) between 1 and 120),
  filtros                jsonb not null default '{}'::jsonb,   -- o mesmo JSON de buscar_empresas
  ordem                  text not null default 'score' check (ordem in ('score', 'capital', 'antigas', 'novas', 'nome')),
  excluir_compartilhados boolean not null default true,         -- celular que aparece em 2+ empresas (contador/grupo)
  usar_enquete           boolean not null default true,
  mensagem               text not null check (char_length(mensagem) between 1 and 3000),
  enquete_pergunta       text not null check (char_length(enquete_pergunta) between 1 and 250),
  opcao_sim              text not null check (char_length(opcao_sim) between 1 and 100),
  opcao_nao              text not null check (char_length(opcao_nao) between 1 and 100),
  mensagem_sim           text not null check (char_length(mensagem_sim) between 1 and 3000),
  mensagem_nao           text not null check (char_length(mensagem_nao) between 1 and 3000),
  mensagem_obrigado      text not null check (char_length(mensagem_obrigado) between 1 and 3000),
  limite_total           int check (limite_total > 0),
  status                 text not null default 'pausada' check (status in ('ativa', 'pausada', 'concluida')),
  motivo_status          text,
  ultima_reserva_em      timestamptz,                         -- rodízio entre campanhas ativas
  criada_por             uuid default auth.uid() references auth.users (id) on delete set null,
  criada_em              timestamptz not null default now(),
  atualizada_em          timestamptz not null default now(),
  check (opcao_sim <> opcao_nao)
);

-- O LIVRO: uma linha por pessoa contatada (ou tentada), para sempre.
create table if not exists public.disparos (
  id              bigint generated always as identity primary key,
  campanha_id     bigint not null references public.disparo_campanhas (id) on delete restrict,
  numero_id       bigint references public.disparo_numeros (id) on delete set null,
  cnpj            text not null,
  telefone        text not null,               -- DDD + número, igual a empresas.whatsapp
  razao_social    text,
  nome_fantasia   text,
  municipio       text,
  chat_id         text,                        -- JID que o WhatsApp devolveu (com ou sem o 9)
  lid             text,                        -- identificador interno do WhatsApp, quando aparece
  token           text not null default public.disparo_token(),
  status          text not null default 'reservado' check (status in (
                    'reservado', 'enviado', 'sem_whatsapp', 'falhou', 'interessado', 'preencheu',
                    'sem_interesse', 'respondeu', 'descadastrado')),
  atencao         boolean not null default false, -- mensagem escrita que alguém da equipe precisa ler
  erro            text,
  msg_id          text,                        -- id curto (key.id) da 1ª mensagem
  enquete_id      text,                        -- id curto da enquete
  criado_em       timestamptz not null default now(),
  enviado_em      timestamptz,
  entregue_em     timestamptz,
  lido_em         timestamptz,
  respondido_em   timestamptz,
  interessado_em  timestamptz,
  link_aberto_em  timestamptz,
  preenchido_em   timestamptz,
  encerrado_em    timestamptz,                 -- sem interesse ou pediu para sair
  ultima_resposta text,
  respostas       int not null default 0,
  lead_nome       text,
  lead_empresa    text,
  lead_email      text,
  lead_whatsapp   text,
  lead_ip         text,
  atualizado_em   timestamptz not null default now()
);
create unique index if not exists disparos_telefone_uk on public.disparos (telefone);
create unique index if not exists disparos_cnpj_uk on public.disparos (cnpj);
create unique index if not exists disparos_token_uk on public.disparos (token);
create index if not exists disparos_campanha_idx on public.disparos (campanha_id, status);
create index if not exists disparos_criado_idx on public.disparos (criado_em desc);
create index if not exists disparos_numero_envio_idx on public.disparos (numero_id, enviado_em);
create index if not exists disparos_chat_idx on public.disparos (chat_id);
create index if not exists disparos_lid_idx on public.disparos (lid) where lid is not null;
create index if not exists disparos_msg_idx on public.disparos (msg_id) where msg_id is not null;
create index if not exists disparos_enquete_idx on public.disparos (enquete_id) where enquete_id is not null;
create index if not exists disparos_atencao_idx on public.disparos (atualizado_em desc) where atencao;

-- Tudo o que entrou e saiu (conversa, votos, formulário, erros). wa_id evita processar duas vezes o mesmo
-- evento quando o WAHA reenvia o webhook.
create table if not exists public.disparo_eventos (
  id         bigint generated always as identity primary key,
  disparo_id bigint references public.disparos (id) on delete cascade,
  numero_id  bigint references public.disparo_numeros (id) on delete set null,
  tipo       text not null check (tipo in ('enviada', 'recebida', 'voto', 'formulario', 'link', 'status', 'erro', 'nota')),
  direcao    text check (direcao in ('entrada', 'saida')),
  texto      text,
  wa_id      text,
  dados      jsonb,
  autor      text,                              -- e-mail de quem mandou pela plataforma (mensagem manual)
  criado_em  timestamptz not null default now()
);
-- sem WHERE: o upsert do PostgREST (on_conflict=tipo,wa_id) não casa com índice parcial; NULL não conflita.
create unique index if not exists disparo_eventos_wa_uk on public.disparo_eventos (tipo, wa_id);
create index if not exists disparo_eventos_disparo_idx on public.disparo_eventos (disparo_id, criado_em);

-- Nunca contatar (pedidos de saída + inclusões manuais: clientes, parceiros, números próprios).
create table if not exists public.disparo_bloqueios (
  telefone   text primary key check (telefone ~ '^\d{10,11}$'),
  motivo     text not null default 'manual',
  observacao text,
  criado_por uuid default auth.uid(),
  criado_em  timestamptz not null default now()
);

-- O "compartilhado" (mesmo celular em 2+ empresas) e o anti-join do livro precisam do celular indexado.
create index if not exists empresas_whatsapp_idx on public.empresas (whatsapp) where whatsapp is not null;

-- ---------------------------------------------------------------------
-- 2. Acesso: só administradores, pela plataforma
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['disparo_config', 'disparo_numeros', 'disparo_campanhas', 'disparos', 'disparo_eventos',
                           'disparo_bloqueios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists "admin gerencia" on public.%I', t);
    execute format('create policy "admin gerencia" on public.%I for all to authenticated
                    using ((select public.is_app_admin())) with check ((select public.is_app_admin()))', t);
  end loop;
end $$;

grant select, update on public.disparo_config to authenticated;
grant select, insert, update on public.disparo_campanhas to authenticated;
grant select, update on public.disparos to authenticated;          -- sem insert/delete: só o ciclo cria
grant select, insert on public.disparo_eventos to authenticated;   -- notas e mensagens manuais
grant select, insert, delete on public.disparo_bloqueios to authenticated;
-- números: lê tudo MENOS a API key; grava tudo (inclusive a key)
grant select (id, rotulo, waha_url, waha_sessao, telefone, nome_perfil, ativo, limite_diario, intervalo_min_s,
              intervalo_max_s, status, status_detalhe, status_em, webhook_em, ultimo_evento_em, proximo_envio_em,
              ultimo_envio_em, criado_em)
  on public.disparo_numeros to authenticated;
grant insert, update, delete on public.disparo_numeros to authenticated;

-- ---------------------------------------------------------------------
-- 3. Funções
-- ---------------------------------------------------------------------

-- Próxima empresa da fila para um número: percorre as campanhas ativas em RODÍZIO (a que está há mais tempo sem
-- reservar vem primeiro), escolhe a melhor empresa ainda não contatada e grava a reserva no livro. Os índices únicos decidem corrida entre dois ciclos: quem
-- perde tenta a próxima empresa. Campanha sem ninguém elegível (ou no limite) vira "concluida".
-- Só o servidor chama (service_role).
create or replace function public.disparo_reservar(p_numero bigint)
returns setof public.disparos
language plpgsql volatile as $$
declare
  c     public.disparo_campanhas;
  achou record;
  novo  public.disparos;
  ord   text;
  n     int;
  tent  int;
begin
  for c in select * from public.disparo_campanhas where status = 'ativa'
            order by ultima_reserva_em nulls first, criada_em, id loop
    if c.limite_total is not null
       and (select count(*) from public.disparos d where d.campanha_id = c.id) >= c.limite_total then
      update public.disparo_campanhas
         set status = 'concluida', motivo_status = 'limite de envios da campanha atingido', atualizada_em = now()
       where id = c.id;
      continue;
    end if;

    ord := case c.ordem
             when 'capital' then 'e.capital_social desc nulls last, e.cnpj'
             when 'antigas' then 'e.data_abertura asc nulls last, e.cnpj'
             when 'novas'   then 'e.data_abertura desc nulls last, e.cnpj'
             when 'nome'    then 'e.razao_social, e.cnpj'
             else 'e.score desc, e.cnpj' end;

    tent := 0;
    loop
      tent := tent + 1;
      execute format($q$
        select e.cnpj, substr(e.whatsapp_e164, 4) as telefone, e.razao_social, e.nome_fantasia, e.municipio
          from public.empresas_completa e
         where %s
           and e.whatsapp_e164 is not null
           and not exists (select 1 from public.disparos d where d.telefone = substr(e.whatsapp_e164, 4))
           and not exists (select 1 from public.disparos d where d.cnpj = e.cnpj)
           and not exists (select 1 from public.disparo_bloqueios b where b.telefone = substr(e.whatsapp_e164, 4))
           %s
         order by %s
         limit 1$q$,
        public.empresas_where(c.filtros),
        case when c.excluir_compartilhados
             then 'and not exists (select 1 from public.empresas o
                                    where o.whatsapp = substr(e.whatsapp_e164, 4) and o.cnpj <> e.cnpj)'
             else '' end,
        ord) into achou;
      get diagnostics n = row_count;
      exit when n = 0;

      insert into public.disparos (campanha_id, numero_id, cnpj, telefone, razao_social, nome_fantasia, municipio)
      values (c.id, p_numero, achou.cnpj, achou.telefone, achou.razao_social, achou.nome_fantasia, achou.municipio)
      on conflict do nothing
      returning * into novo;
      if novo.id is not null then
        update public.disparo_campanhas set ultima_reserva_em = now() where id = c.id;
        return next novo;
        return;
      end if;
      exit when tent >= 10; -- outros ciclos levaram as empresas; desiste desta campanha nesta rodada
    end loop;

    if n = 0 then
      update public.disparo_campanhas
         set status = 'concluida', motivo_status = 'todas as empresas elegíveis já foram contatadas',
             atualizada_em = now()
       where id = c.id;
    end if;
  end loop;
end $$;
revoke all on function public.disparo_reservar(bigint) from public, anon, authenticated;
grant execute on function public.disparo_reservar(bigint) to service_role;

-- Quantas empresas dos filtros têm celular e quantas ainda podem receber (tela de nova campanha).
create or replace function public.disparo_contar_elegiveis(f jsonb default '{}'::jsonb,
                                                            excluir_compartilhados boolean default true)
returns jsonb
language plpgsql stable as $$
declare r jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'apenas administradores';
  end if;
  execute format($q$
    select jsonb_build_object(
      'com_whatsapp', count(*),
      'elegiveis', count(*) filter (where
          not exists (select 1 from public.disparos d where d.telefone = substr(e.whatsapp_e164, 4))
          and not exists (select 1 from public.disparos d where d.cnpj = e.cnpj)
          and not exists (select 1 from public.disparo_bloqueios b where b.telefone = substr(e.whatsapp_e164, 4))
          %s))
      from public.empresas_completa e
     where %s and e.whatsapp_e164 is not null$q$,
    case when excluir_compartilhados
         then 'and not exists (select 1 from public.empresas o where o.whatsapp = substr(e.whatsapp_e164, 4) and o.cnpj <> e.cnpj)'
         else '' end,
    public.empresas_where(f)) into r;
  return r;
end $$;
revoke all on function public.disparo_contar_elegiveis(jsonb, boolean) from public, anon;
grant execute on function public.disparo_contar_elegiveis(jsonb, boolean) to authenticated, service_role;

-- Funil (geral ou de uma campanha). Roda como quem chama: sem ser admin, o RLS zera tudo.
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
  where p_campanha is null or campanha_id = p_campanha
$$;
revoke all on function public.disparo_resumo(bigint) from public, anon;
grant execute on function public.disparo_resumo(bigint) to authenticated, service_role;

-- Números por campanha (tela de campanhas).
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
group by campanha_id;
revoke all on public.disparo_campanhas_numeros from anon;
grant select on public.disparo_campanhas_numeros to authenticated;

-- O pg_cron só chama o ciclo quando há o que fazer (dentro do horário, sem pausa, com campanha e número prontos).
create or replace function public.disparo_precisa_ciclo() returns boolean
language sql stable as $$
  select coalesce((
    select not c.pausado
       and extract(isodow from now() at time zone 'America/Sao_Paulo')::smallint = any (c.dias_semana)
       and extract(hour from now() at time zone 'America/Sao_Paulo') >= c.hora_inicio
       and extract(hour from now() at time zone 'America/Sao_Paulo') < c.hora_fim
       and exists (select 1 from public.disparo_campanhas where status = 'ativa')
       and exists (select 1 from public.disparo_numeros where ativo and proximo_envio_em <= now())
      from public.disparo_config c
     where c.id = 1), false)
$$;
revoke all on function public.disparo_precisa_ciclo() from public, anon, authenticated;

notify pgrst, 'reload schema';
