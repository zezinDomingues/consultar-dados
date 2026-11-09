-- 020 · Disparos e saldo do cliente: correções da QA rodada 1 (09/11/2026)
--
-- Aplicar DEPOIS da 016 e da 019 e ANTES do deploy (README → "Ordem das migrações"). Compatível com o código que
-- está no ar (main 38120d1): nada aqui muda o que ele chama, só acrescenta.
--
--   BE-06  Ordem única de travas: GRUPO (advisory) → CAMPANHA (linha) → FILA. Antes o replanejar travava a campanha
--          e depois a fila, e o ciclo travava a fila e depois a campanha → deadlock possível ao salvar campanha com
--          o ciclo rodando (o replanejar perdia e a fila velha ficava).
--   BE-14  A reserva trava o GRUPO do número: N números no mesmo ciclo não passam juntos pela contagem da
--          quantidade total (faltando 1, saía até N). E só encerra a campanha quando não há reserva em voo — uma
--          reserva que virar "sem WhatsApp" libera a vaga em vez de deixar a campanha 1 abaixo da quantidade.
--   BE-07  disparo_reservar(p_numero, p_preparar): com p_preparar a reserva nasce marcada "preparando o envio"; o
--          motor tira a marca logo antes de mandar. Reserva parada COM a marca nunca chegou ao WhatsApp e volta
--          para a fila por disparo_devolver() (antes virava "falhou" e a empresa nunca era contatada).
--   BE-03  Porte antigo "Demais (médio/grande)" nos filtros vira Médio porte + Grande porte (disparo_filtros_norm),
--          no planejamento, na prévia e nos filtros já gravados (hoje nenhuma campanha tem — o UPDATE pega 0 linhas).
--   QA-13  Pausar também apaga a fila (o gatilho já apagava ao encerrar); a fila nasce na ativação. A divisão da
--          campanha pausada (sem fila) mostra uma prévia calculada na hora, sem gravar nada.
--   BE-13  Saldo do cliente: cada liberação guarda a modalidade em que foi feita. No pacote só contam as liberações
--          feitas no pacote; no mensal, as do mês feitas no mensal (trocar de mensal para pacote não zera o saldo).
--   SEC-03 disparo_numeros.webhook_por_numero: o webhook da Z-API passou a usar um token por número; enquanto o
--          número não for reconfigurado, o token antigo (DISPAROS_SEGREDO) continua valendo para ele.
--   BE-21  disparo_enviados_por_grupo(): os enviados de todos os grupos numa consulta (a tela fazia uma por grupo).
--
-- Tem blocos de função (cifrões duplos): o aplicar_sql.py roda o arquivo inteiro numa execução. Idempotente.

begin;

-- ---------------------------------------------------------------- colunas novas
alter table public.disparo_numeros add column if not exists webhook_por_numero boolean not null default false;
comment on column public.disparo_numeros.webhook_por_numero is
  'Webhook já reconfigurado com o token próprio do número (QA rodada 1). Enquanto false, o token antigo (DISPAROS_SEGREDO) vale.';

alter table public.clientes_liberacoes add column if not exists modalidade text;
do $$ begin
  alter table public.clientes_liberacoes add constraint clientes_liberacoes_modalidade_ck check (modalidade in ('mensal', 'pacote'));
exception when duplicate_object then null; end $$;
comment on column public.clientes_liberacoes.modalidade is 'Modalidade do plano no momento da liberação (mensal ou pacote): é o saldo que ela consumiu.';
-- liberações antigas: a modalidade atual do cliente (é o que o saldo já supunha)
update public.clientes_liberacoes l set modalidade = a.modalidade
  from public.clientes_acesso a
 where a.user_id = l.user_id and l.modalidade is null;

-- ---------------------------------------------------------------- porte antigo nos filtros (BE-03)
create or replace function public.disparo_filtros_norm(f jsonb) returns jsonb
language sql immutable as $$
  select case
           when jsonb_typeof(f -> 'portes') = 'array' and (f -> 'portes') ? 'Demais (médio/grande)' then
             jsonb_set(f, '{portes}', (
               select coalesce(jsonb_agg(distinct v), '[]'::jsonb)
                 from jsonb_array_elements_text(f -> 'portes') as x(p),
                      unnest(case when x.p = 'Demais (médio/grande)' then array['Médio porte', 'Grande porte'] else array[x.p] end) as v))
           else f
         end
$$;
revoke all on function public.disparo_filtros_norm(jsonb) from public, anon;
grant execute on function public.disparo_filtros_norm(jsonb) to authenticated, service_role;

update public.disparo_campanhas
   set filtros = public.disparo_filtros_norm(filtros)
 where (filtros -> 'portes') ? 'Demais (médio/grande)';

-- Prévia de uma campanha nova (não grava nada) — agora com o porte antigo convertido.
create or replace function public.disparo_divisao_previa(f jsonb, p_ordem text, p_excluir_compartilhados boolean,
                                                         p_grupo bigint, p_quantidade int)
returns jsonb
language sql stable set statement_timeout = '60s' as $$
  select public.disparo_agregar(coalesce(jsonb_agg(to_jsonb(s)), '[]'))
    from public.disparo_selecionar(public.disparo_filtros_norm(f), p_ordem, p_excluir_compartilhados, p_grupo, p_quantidade, 0) s
$$;
revoke all on function public.disparo_divisao_previa(jsonb, text, boolean, bigint, int) from public, anon, authenticated;
grant execute on function public.disparo_divisao_previa(jsonb, text, boolean, bigint, int) to service_role;

-- ---------------------------------------------------------------- travas: grupo → campanha → fila (BE-06/BE-14)
-- Trava do grupo: uma reserva/planejamento por vez em cada grupo (são milissegundos; planejar leva ~3 s).
create or replace function public.disparo_travar_grupo(p_grupo bigint) returns void
language sql volatile as $$
  select pg_advisory_xact_lock(hashtext('disparo_grupo'), p_grupo::int)
$$;
revoke all on function public.disparo_travar_grupo(bigint) from public, anon, authenticated;
grant execute on function public.disparo_travar_grupo(bigint) to service_role;

-- Acrescenta até p_quantidade empresas no fim da fila (chamada com o grupo e a campanha já travados pelo
-- replanejar/reservar; as travas aqui são reentrantes, então chamá-la sozinha também segue a ordem).
create or replace function public.disparo_planejar(p_campanha bigint, p_quantidade int) returns int
language plpgsql volatile set statement_timeout = '60s' set lock_timeout = '20s' as $$
declare
  c      public.disparo_campanhas;
  inicio int;
  n      int;
begin
  perform public.disparo_travar_grupo((select grupo_id from public.disparo_campanhas where id = p_campanha));
  select * into c from public.disparo_campanhas where id = p_campanha for update;
  if not found then raise exception 'campanha % não existe', p_campanha; end if;
  select coalesce(max(posicao), 0) into inicio from public.disparo_plano where campanha_id = p_campanha;
  insert into public.disparo_plano (campanha_id, posicao, cnpj, telefone, ramo, uf, regime, porte, localizacao, segmento)
  select p_campanha, inicio + s.posicao, s.cnpj, s.telefone, s.ramo, s.uf, s.regime, s.porte, s.localizacao, s.segmento
    from public.disparo_selecionar(public.disparo_filtros_norm(c.filtros), c.ordem, c.excluir_compartilhados, c.grupo_id,
                                   p_quantidade, hashint8(p_campanha) # hashint4(inicio + 7919 * public.disparo_contados(p_campanha))) s;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.disparo_planejar(bigint, int) from public, anon, authenticated;
grant execute on function public.disparo_planejar(bigint, int) to service_role;

-- Refaz a fila (campanha salva/ativada). Encerrada, pausada ou que já bateu a quantidade fica sem fila.
create or replace function public.disparo_replanejar(p_campanha bigint) returns int
language plpgsql volatile set statement_timeout = '60s' set lock_timeout = '20s' as $$
declare
  c public.disparo_campanhas;
begin
  perform public.disparo_travar_grupo((select grupo_id from public.disparo_campanhas where id = p_campanha));
  select * into c from public.disparo_campanhas where id = p_campanha for update;
  if not found then raise exception 'campanha % não existe', p_campanha; end if;
  delete from public.disparo_plano where campanha_id = p_campanha;
  if c.status <> 'ativa'
     or (c.limite_total is not null and public.disparo_contados(c.id) >= c.limite_total) then
    return 0;
  end if;
  return public.disparo_planejar(p_campanha, public.disparo_lote(p_campanha));
end $$;
revoke all on function public.disparo_replanejar(bigint) from public, anon, authenticated;
grant execute on function public.disparo_replanejar(bigint) to service_role;

-- ---------------------------------------------------------------- reservar = consumir a fila
-- A assinatura ganhou p_preparar (com valor padrão): o código no ar chama só com p_numero e continua igual.
drop function if exists public.disparo_reservar(bigint);
create or replace function public.disparo_reservar(p_numero bigint, p_preparar boolean default false)
returns setof public.disparos
language plpgsql volatile set statement_timeout = '60s' set lock_timeout = '20s' as $$
declare
  c        public.disparo_campanhas;
  cid      bigint;
  item     public.disparo_plano;
  emp      record;
  novo     public.disparos;
  n        int;
  tent     int;
  planejou boolean;
  grp      bigint := (select grupo_id from public.disparo_numeros where id = p_numero);
begin
  if grp is null then return; end if;
  perform public.disparo_travar_grupo(grp);   -- 1º o grupo: as reservas do grupo passam uma de cada vez

  for cid in select dc.id from public.disparo_campanhas dc
               join public.disparo_grupos g on g.id = dc.grupo_id and g.ativo
              where dc.status = 'ativa' and dc.grupo_id = grp
              order by dc.ultima_reserva_em nulls first, dc.criada_em, dc.id loop
    -- 2º a campanha, ANTES de tocar na fila (mesma ordem do replanejar e do pausar/encerrar)
    select * into c from public.disparo_campanhas where id = cid and status = 'ativa' for update;
    continue when not found;

    if c.limite_total is not null and public.disparo_contados(c.id) >= c.limite_total then
      -- reserva em voo ainda pode virar "sem WhatsApp" e liberar a vaga: só encerra quando nada está em voo
      if not exists (select 1 from public.disparos d where d.campanha_id = c.id and d.status = 'reservado' and not d.teste) then
        update public.disparo_campanhas
           set status = 'concluida', motivo_status = 'quantidade de disparos atingida', atualizada_em = now()
         where id = c.id;
        delete from public.disparo_plano where campanha_id = c.id;
      end if;
      continue;
    end if;

    tent := 0;
    planejou := false;
    loop
      tent := tent + 1;
      exit when tent > 40;

      -- próximo da fila (SKIP LOCKED fica de reserva: com a trava do grupo, ninguém mais mexe nesta fila agora)
      delete from public.disparo_plano p
       where (p.campanha_id, p.posicao) = (select q.campanha_id, q.posicao from public.disparo_plano q
                                             where q.campanha_id = c.id
                                             order by q.posicao limit 1 for update skip locked)
      returning p.* into item;
      get diagnostics n = row_count;

      if n = 0 then
        exit when planejou;          -- já completou a fila neste ciclo e não veio nada utilizável
        planejou := true;
        if public.disparo_planejar(c.id, public.disparo_lote(c.id)) = 0 then
          update public.disparo_campanhas
             set status = 'concluida', motivo_status = 'todas as empresas elegíveis já foram contatadas',
                 atualizada_em = now()
           where id = c.id;
          exit;
        end if;
        continue;
      end if;

      -- bloqueado depois de entrar na fila?
      continue when exists (select 1 from public.disparo_bloqueios b
                             where b.telefone = item.telefone and (b.grupo_id is null or b.grupo_id = c.grupo_id));

      select e.razao_social, e.nome_fantasia, e.municipio, e.divisao, e.ramo, e.uf
        into emp from public.empresas_completa e where e.cnpj = item.cnpj;
      continue when not found;       -- saiu da base numa carga nova

      insert into public.disparos (grupo_id, campanha_id, numero_id, cnpj, telefone, razao_social, nome_fantasia,
                                   municipio, ramo, ramo_nome, uf, erro)
      values (c.grupo_id, c.id, p_numero, item.cnpj, item.telefone, emp.razao_social, emp.nome_fantasia,
              emp.municipio, emp.divisao, emp.ramo, emp.uf, case when p_preparar then 'preparando o envio' end)
      on conflict do nothing          -- já contatado pelo grupo (outra campanha): pula
      returning * into novo;
      if novo.id is not null then
        update public.disparo_campanhas set ultima_reserva_em = now() where id = c.id;
        return next novo;
        return;
      end if;
    end loop;
  end loop;
end $$;
revoke all on function public.disparo_reservar(bigint, boolean) from public, anon, authenticated;
grant execute on function public.disparo_reservar(bigint, boolean) to service_role;

-- Reserva que NÃO chegou ao WhatsApp: sai do livro e volta para o COMEÇO da fila da campanha (se ela ainda
-- estiver ativa; senão a empresa só volta a ser elegível). Teste do administrador só é apagado.
create or replace function public.disparo_devolver(p_disparo bigint) returns boolean
language plpgsql volatile set statement_timeout = '15s' set lock_timeout = '10s' as $$
declare
  r  public.disparos;
  st text;
begin
  perform public.disparo_travar_grupo((select grupo_id from public.disparos where id = p_disparo));
  delete from public.disparos where id = p_disparo and status = 'reservado' returning * into r;
  if not found then return false; end if;
  if r.teste then return true; end if;
  select status into st from public.disparo_campanhas where id = r.campanha_id;
  if st = 'ativa' then
    insert into public.disparo_plano (campanha_id, posicao, cnpj, telefone, ramo, uf, regime, porte, localizacao, segmento)
    select r.campanha_id, coalesce((select min(p.posicao) from public.disparo_plano p where p.campanha_id = r.campanha_id), 1) - 1,
           r.cnpj, r.telefone, e.divisao, e.uf, e.regime::text, e.porte::text, e.localizacao, e.grupo
      from public.empresas_completa e
     where e.cnpj = r.cnpj
    on conflict do nothing;
  end if;
  return true;
end $$;
revoke all on function public.disparo_devolver(bigint) from public, anon, authenticated;
grant execute on function public.disparo_devolver(bigint) to service_role;

-- ---------------------------------------------------------------- fila só de campanha ativa (QA-13)
create or replace function public.disparo_campanha_limpa_fila() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status in ('concluida', 'pausada') and old.status is distinct from new.status then
    delete from public.disparo_plano where campanha_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists disparo_campanha_limpa_fila on public.disparo_campanhas;
create trigger disparo_campanha_limpa_fila after update of status on public.disparo_campanhas
  for each row execute function public.disparo_campanha_limpa_fila();

-- Divisão de uma campanha salva: o que já saiu + os próximos da fila até completar a quantidade. Sem fila (pausada,
-- ou ativa esperando o ciclo), mostra a prévia do que sairia — calculada na hora, nada é gravado.
create or replace function public.disparo_divisao(p_campanha bigint) returns jsonb
language plpgsql stable set statement_timeout = '60s' as $$
declare
  c       public.disparo_campanhas;
  feitos  int;
  falta   int;
  na_fila int;
  saiu    jsonb;
  fila    jsonb;
begin
  select * into c from public.disparo_campanhas where id = p_campanha;
  if not found then return null; end if;
  feitos := public.disparo_contados(c.id);
  falta := case when c.limite_total is null then 1000 else greatest(c.limite_total - feitos, 0) end;
  select count(*) into na_fila from public.disparo_plano where campanha_id = c.id;
  select coalesce(jsonb_agg(to_jsonb(x)), '[]') into saiu
    from (select d.ramo, d.uf, e.regime::text as regime, e.porte::text as porte, e.localizacao, e.grupo as segmento
            from public.disparos d left join public.empresas_completa e on e.cnpj = d.cnpj
           where d.campanha_id = c.id and not d.teste and (d.enviado_em is not null or d.status = 'reservado')) x;
  if na_fila > 0 then
    select coalesce(jsonb_agg(to_jsonb(x)), '[]') into fila
      from (select p.ramo, p.uf, p.regime, p.porte, p.localizacao, p.segmento
              from public.disparo_plano p where p.campanha_id = c.id
             order by p.posicao limit falta) x;
  elsif c.status <> 'concluida' and falta > 0 then
    select coalesce(jsonb_agg(to_jsonb(s)), '[]') into fila
      from public.disparo_selecionar(public.disparo_filtros_norm(c.filtros), c.ordem, c.excluir_compartilhados,
                                     c.grupo_id, least(falta, 1000), 0) s;
  else
    fila := '[]';
  end if;
  return public.disparo_agregar(saiu || fila) || jsonb_build_object('enviados', feitos, 'na_fila', na_fila);
end $$;
revoke all on function public.disparo_divisao(bigint) from public, anon, authenticated;
grant execute on function public.disparo_divisao(bigint) to service_role;

-- ---------------------------------------------------------------- enviados por grupo (BE-21)
-- Roda como quem chama (RLS): admin soma todos, o cliente só o grupo dele.
create or replace function public.disparo_enviados_por_grupo()
returns table (grupo_id bigint, enviados bigint)
language sql stable as $$
  select d.grupo_id, count(*) from public.disparos d
   where not d.teste and d.enviado_em is not null
   group by d.grupo_id
$$;
revoke all on function public.disparo_enviados_por_grupo() from public, anon;
grant execute on function public.disparo_enviados_por_grupo() to authenticated, service_role;

-- ---------------------------------------------------------------- saldo do cliente (BE-13)
create or replace function public.cliente_saldo(p_user uuid default null)
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  alvo   uuid := coalesce(p_user, (select auth.uid()));
  a      public.clientes_acesso;
  limite int;
  usadas int;
begin
  if p_user is not null and p_user <> (select auth.uid()) and not public.is_app_admin() then
    raise exception 'apenas administradores';
  end if;
  select * into a from public.clientes_acesso where user_id = alvo;
  if not found then return null; end if;
  if a.modalidade = 'mensal' then
    limite := a.cota_mensal;
    select count(*) into usadas from public.clientes_liberacoes l
     where l.user_id = alvo and coalesce(l.modalidade, 'mensal') = 'mensal'
       and l.liberada_em >= (date_trunc('month', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo');
  else
    -- pacote: todos os pacotes comprados menos o que foi liberado NO PACOTE (o mensal não consome pacote)
    select coalesce(sum(quantidade), 0) into limite from public.clientes_pacotes where user_id = alvo;
    select count(*) into usadas from public.clientes_liberacoes l
     where l.user_id = alvo and coalesce(l.modalidade, 'pacote') = 'pacote';
  end if;
  return jsonb_build_object(
    'modalidade', a.modalidade, 'limite', limite, 'usadas', usadas, 'saldo', greatest(limite - usadas, 0),
    'ramos', a.ramos, 'ufs', a.ufs, 'validade', a.validade,
    'vencido', a.validade is not null and a.validade < (now() at time zone 'America/Sao_Paulo')::date,
    'total_liberadas', (select count(*) from public.clientes_liberacoes where user_id = alvo));
end $$;
revoke all on function public.cliente_saldo(uuid) from public, anon;
grant execute on function public.cliente_saldo(uuid) to authenticated;

-- Liberar: agora grava a modalidade do momento (é o saldo que a liberação consumiu).
create or replace function public.cliente_liberar(p_cnpj text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
declare
  esc   text := public.cliente_escopo();
  uid   uuid := (select auth.uid());
  ok    boolean;
  saldo int;
begin
  if esc is null then raise exception 'sem plano ativo'; end if;
  perform pg_advisory_xact_lock(hashtext('cliente_liberar:' || uid::text)); -- dois cliques ao mesmo tempo não furam a cota
  if exists (select 1 from public.clientes_liberacoes where user_id = uid and cnpj = p_cnpj) then
    return jsonb_build_object('ok', true, 'ja_liberada', true, 'saldo', (public.cliente_saldo())->>'saldo');
  end if;
  execute format('select exists (select 1 from public.empresas_completa e where e.cnpj = %L and %s)', p_cnpj, esc) into ok;
  if not ok then raise exception 'empresa fora do seu plano'; end if;
  saldo := ((public.cliente_saldo())->>'saldo')::int;
  if saldo <= 0 then raise exception 'saldo esgotado'; end if;
  insert into public.clientes_liberacoes (user_id, cnpj, modalidade)
  values (uid, p_cnpj, (select modalidade from public.clientes_acesso where user_id = uid));
  return jsonb_build_object('ok', true, 'ja_liberada', false, 'saldo', saldo - 1);
end $$;
revoke all on function public.cliente_liberar(text) from public, anon;
grant execute on function public.cliente_liberar(text) to authenticated;

notify pgrst, 'reload schema';

commit;
