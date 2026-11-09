-- 017 · Disparos divididos por igual (09/11/2026)
--
-- Regra do usuário: "escolho o número de disparos; o que eu não filtrar, divide entre todos" — nicho, estado e todo
-- o resto. O que tiver vários valores filtrados também divide por igual entre eles.
--
-- Como funciona:
--   * disparo_selecionar() escolhe N empresas por RODÍZIO HIERÁRQUICO: 1 de cada nicho (ramo = divisão CNAE) por
--     rodada; dentro do nicho, reveza os estados; dentro do estado, o regime; depois porte, localização e segmento.
--     Nicho que acaba sai do rodízio e a vaga vai para os outros. Dentro da última caixinha manda a "ordem" da
--     campanha (score, capital…). Qualquer começo da lista já sai dividido, então parar no meio não desequilibra.
--   * disparo_plano = a FILA da campanha (só o que ainda não saiu). disparo_replanejar() refaz a fila quando a
--     campanha é salva; disparo_reservar() consome a fila e a completa sozinho quando acaba.
--   * limite_total vira "quantidade de disparos" = mensagens que SAÍRAM (sem WhatsApp e recusadas não contam).
--   * custo: ~2,5 s para planejar 1.000 na base inteira (chaves inteiras em vez de texto nas partições).
-- Idempotente.

begin;

-- ---------------------------------------------------------------- fila
create table if not exists public.disparo_plano (
  campanha_id bigint not null references public.disparo_campanhas (id) on delete cascade,
  posicao     int    not null,
  cnpj        text   not null,
  telefone    text   not null,
  ramo        text,              -- divisão CNAE (2 dígitos) = nicho
  uf          text,
  regime      text,
  porte       text,
  localizacao text,
  segmento    text,              -- grupo CNAE (3 dígitos)
  criado_em   timestamptz not null default now(),
  primary key (campanha_id, posicao)
);
comment on table public.disparo_plano is
  'Fila de envio de cada campanha, já dividida por nicho/estado/regime/porte/localização/segmento. Linha sai da fila quando vira disparo.';
create index if not exists disparo_plano_cnpj_idx on public.disparo_plano (cnpj);
create index if not exists disparo_plano_tel_idx on public.disparo_plano (telefone);

alter table public.disparo_plano enable row level security;
drop policy if exists "admin le" on public.disparo_plano;
create policy "admin le" on public.disparo_plano for select to authenticated using ((select public.is_app_admin()));
revoke all on public.disparo_plano from anon;
grant select on public.disparo_plano to authenticated;

-- ---------------------------------------------------------------- quanto já saiu
create or replace function public.disparo_contados(p_campanha bigint) returns int
language sql stable as $$
  select count(*)::int from public.disparos d
   where d.campanha_id = p_campanha and not d.teste and (d.enviado_em is not null or d.status = 'reservado')
$$;
revoke all on function public.disparo_contados(bigint) from public, anon;
grant execute on function public.disparo_contados(bigint) to authenticated, service_role;

-- ---------------------------------------------------------------- seleção dividida
-- Rodízio hierárquico em 6 níveis. k1..k6 = hash da "caixinha" em cada nível (inteiro: partição por texto com
-- collation custava o dobro). r6 = posição dentro da caixinha mais fina (pela ordem da campanha); cada nível acima
-- intercala os filhos: todos os 1ºs (numa ordem embaralhada pela semente), depois todos os 2ºs... Como r1 >= r2 >=
-- ... >= r6, linha com r_j > quantidade nunca entra e é cortada cedo.
create or replace function public.disparo_selecionar(f jsonb, p_ordem text, p_excluir_compartilhados boolean,
                                                     p_grupo bigint, p_quantidade int, p_semente int default 0)
returns table (posicao int, cnpj text, telefone text, ramo text, uf text, regime text, porte text,
               localizacao text, segmento text)
language plpgsql stable set statement_timeout = '60s' as $$
declare
  ord text;
  q   int := least(greatest(coalesce(p_quantidade, 0), 0), 20000);
  s   int := coalesce(p_semente, 0);
begin
  if q = 0 then return; end if;
  ord := case p_ordem
           when 'capital' then 'capital_social desc nulls last'
           when 'antigas' then 'data_abertura asc nulls last'
           when 'novas'   then 'data_abertura desc nulls last'
           when 'nome'    then 'razao_social'
           else 'score desc' end;
  return query execute format($q$
    with base as materialized (
      select e.cnpj, substr(e.whatsapp_e164, 4) as tel,
             coalesce(e.divisao, '?') as d1, e.uf as d2, coalesce(e.regime::text, '?') as d3,
             coalesce(e.porte::text, '?') as d4, coalesce(e.localizacao, '?') as d5, coalesce(e.grupo, '?') as d6,
             e.score, e.capital_social, e.data_abertura, e.razao_social
        from public.empresas_completa e
       where %1$s and e.whatsapp_e164 is not null
         and substr(e.whatsapp_e164, 4) not in (select d.telefone from public.disparos d
                                                  where d.grupo_id = %2$s and d.telefone is not null)
         and e.cnpj not in (select d.cnpj from public.disparos d where d.grupo_id = %2$s and d.cnpj is not null)
         and substr(e.whatsapp_e164, 4) not in (select b.telefone from public.disparo_bloqueios b
                                                  where (b.grupo_id is null or b.grupo_id = %2$s) and b.telefone is not null)
         and e.cnpj not in (select p.cnpj from public.disparo_plano p
                              join public.disparo_campanhas c on c.id = p.campanha_id where c.grupo_id = %2$s)
         and substr(e.whatsapp_e164, 4) not in (select p.telefone from public.disparo_plano p
                              join public.disparo_campanhas c on c.id = p.campanha_id where c.grupo_id = %2$s)
         %3$s
    ), k as (
      select b.*,
             hashtext(d1) as k1,
             hashtext(concat_ws('|', d1, d2)) as k2,
             hashtext(concat_ws('|', d1, d2, d3)) as k3,
             hashtext(concat_ws('|', d1, d2, d3, d4)) as k4,
             hashtext(concat_ws('|', d1, d2, d3, d4, d5)) as k5,
             hashtext(concat_ws('|', d1, d2, d3, d4, d5, d6)) as k6
        from base b
    ), l6 as (
      select k.*, row_number() over (partition by k6 order by %4$s, cnpj collate "C") as r6 from k
    ), l5 as (
      select *, row_number() over (partition by k5 order by r6, hashint4(k6 # %5$s)) as r5 from l6 where r6 <= %6$s
    ), l4 as (
      select *, row_number() over (partition by k4 order by r5, hashint4(k5 # %5$s)) as r4 from l5 where r5 <= %6$s
    ), l3 as (
      select *, row_number() over (partition by k3 order by r4, hashint4(k4 # %5$s)) as r3 from l4 where r4 <= %6$s
    ), l2 as (
      select *, row_number() over (partition by k2 order by r3, hashint4(k3 # %5$s)) as r2 from l3 where r3 <= %6$s
    ), l1 as (
      select *, row_number() over (partition by k1 order by r2, hashint4(k2 # %5$s)) as r1 from l2 where r2 <= %6$s
    ), topo as (
      select l1.*, row_number() over (order by r1, hashint4(k1 # %5$s)) as pos
        from l1 where r1 <= %6$s
       order by r1, hashint4(k1 # %5$s)
       limit %7$s
    ), unico as (   -- o mesmo celular em 2 CNPJs (quando não exclui compartilhados): fica o primeiro
      select topo.*, row_number() over (partition by tel order by pos) as rt from topo
    )
    select (row_number() over (order by pos))::int, cnpj, tel, nullif(d1, '?'), d2, nullif(d3, '?'), nullif(d4, '?'),
           nullif(d5, '?'), nullif(d6, '?')
      from unico where rt = 1
     order by pos
     limit %6$s$q$,
    public.empresas_where(f), p_grupo,
    case when p_excluir_compartilhados
         then 'and substr(e.whatsapp_e164, 4) not in (select o.whatsapp from public.empresas o where o.whatsapp is not null
                                                       group by o.whatsapp having count(*) > 1)'
         else '' end,
    ord, s, q, q + q / 5 + 50);
end $$;
revoke all on function public.disparo_selecionar(jsonb, text, boolean, bigint, int, int) from public, anon, authenticated;
grant execute on function public.disparo_selecionar(jsonb, text, boolean, bigint, int, int) to service_role;

-- ---------------------------------------------------------------- divisão (para a tela)
-- Agrega uma lista de empresas (jsonb [{ramo, uf, regime, porte, localizacao, segmento}]) por dimensão.
create or replace function public.disparo_agregar(j jsonb) returns jsonb
language sql stable as $$
  with s as (
    select * from jsonb_to_recordset(coalesce(j, '[]')) as x(ramo text, uf text, regime text, porte text,
                                                            localizacao text, segmento text)
  ), nomes as (
    select divisao, max(ramo) as nome from public.cnae group by divisao
  )
  select jsonb_build_object(
    'total', (select count(*) from s),
    'segmentos', (select count(distinct segmento) from s),
    'ramo', coalesce((select jsonb_agg(jsonb_build_object('v', x.ramo, 'nome', coalesce(n.nome, x.ramo), 'n', x.n)
                                       order by x.n desc, x.ramo)
                        from (select ramo, count(*) n from s group by ramo) x
                        left join nomes n on n.divisao = x.ramo), '[]'),
    'uf', coalesce((select jsonb_agg(jsonb_build_object('v', uf, 'n', n) order by n desc)
                      from (select uf, count(*) n from s group by uf) x), '[]'),
    'regime', coalesce((select jsonb_agg(jsonb_build_object('v', regime, 'n', n) order by n desc)
                          from (select regime, count(*) n from s group by regime) x), '[]'),
    'porte', coalesce((select jsonb_agg(jsonb_build_object('v', porte, 'n', n) order by n desc)
                         from (select porte, count(*) n from s group by porte) x), '[]'),
    'localizacao', coalesce((select jsonb_agg(jsonb_build_object('v', localizacao, 'n', n) order by n desc)
                               from (select localizacao, count(*) n from s group by localizacao) x), '[]'))
$$;
revoke all on function public.disparo_agregar(jsonb) from public, anon;
grant execute on function public.disparo_agregar(jsonb) to authenticated, service_role;

-- Prévia de uma campanha nova (não grava nada).
create or replace function public.disparo_divisao_previa(f jsonb, p_ordem text, p_excluir_compartilhados boolean,
                                                         p_grupo bigint, p_quantidade int)
returns jsonb
language sql stable set statement_timeout = '60s' as $$
  select public.disparo_agregar(coalesce(jsonb_agg(to_jsonb(s)), '[]'))
    from public.disparo_selecionar(f, p_ordem, p_excluir_compartilhados, p_grupo, p_quantidade, 0) s
$$;
revoke all on function public.disparo_divisao_previa(jsonb, text, boolean, bigint, int) from public, anon, authenticated;
grant execute on function public.disparo_divisao_previa(jsonb, text, boolean, bigint, int) to service_role;

-- Divisão de uma campanha salva: o que já saiu + os próximos da fila até completar a quantidade.
create or replace function public.disparo_divisao(p_campanha bigint) returns jsonb
language sql stable as $$
  with c as (
    select id, limite_total, public.disparo_contados(id) as feitos from public.disparo_campanhas where id = p_campanha
  ), saiu as (
    select d.ramo, d.uf, e.regime::text as regime, e.porte::text as porte, e.localizacao, e.grupo as segmento
      from public.disparos d left join public.empresas_completa e on e.cnpj = d.cnpj
     where d.campanha_id = p_campanha and not d.teste and (d.enviado_em is not null or d.status = 'reservado')
  ), fila as (
    select p.ramo, p.uf, p.regime, p.porte, p.localizacao, p.segmento
      from public.disparo_plano p where p.campanha_id = p_campanha
     order by p.posicao
     limit (select case when limite_total is null then 1000 else greatest(limite_total - feitos, 0) end from c)
  )
  select public.disparo_agregar((select coalesce(jsonb_agg(to_jsonb(x)), '[]')
                                   from (select * from saiu union all select * from fila) x))
         || jsonb_build_object('enviados', (select feitos from c),
                               'na_fila', (select count(*) from public.disparo_plano where campanha_id = p_campanha))
$$;
revoke all on function public.disparo_divisao(bigint) from public, anon, authenticated;
grant execute on function public.disparo_divisao(bigint) to service_role;

-- ---------------------------------------------------------------- planejar / replanejar
-- Acrescenta até p_quantidade empresas no fim da fila. A semente muda a cada lote (o rodízio começa em outro nicho;
-- senão a última rodada, que é parcial, favoreceria sempre os mesmos nichos em campanha longa).
create or replace function public.disparo_planejar(p_campanha bigint, p_quantidade int) returns int
language plpgsql volatile set statement_timeout = '60s' as $$
declare
  c      public.disparo_campanhas;
  inicio int;
  n      int;
begin
  select * into c from public.disparo_campanhas where id = p_campanha for update;   -- um planejamento por vez
  if not found then raise exception 'campanha % não existe', p_campanha; end if;
  select coalesce(max(posicao), 0) into inicio from public.disparo_plano where campanha_id = p_campanha;
  insert into public.disparo_plano (campanha_id, posicao, cnpj, telefone, ramo, uf, regime, porte, localizacao, segmento)
  select p_campanha, inicio + s.posicao, s.cnpj, s.telefone, s.ramo, s.uf, s.regime, s.porte, s.localizacao, s.segmento
    from public.disparo_selecionar(c.filtros, c.ordem, c.excluir_compartilhados, c.grupo_id, p_quantidade,
                                   hashint8(p_campanha) # hashint4(inicio + 7919 * public.disparo_contados(p_campanha))) s;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.disparo_planejar(bigint, int) from public, anon, authenticated;
grant execute on function public.disparo_planejar(bigint, int) to service_role;

-- Quanto planejar de uma vez: o que falta + 30% de folga (celular sem WhatsApp, recusa), até 5.000 por lote.
-- Campanha sem quantidade anda em lotes de 1.000.
create or replace function public.disparo_lote(p_campanha bigint) returns int
language sql stable as $$
  select case when c.limite_total is null then 1000
              else least(greatest(c.limite_total - public.disparo_contados(c.id), 0) * 13 / 10 + 20, 5000) end
    from public.disparo_campanhas c where c.id = p_campanha
$$;
revoke all on function public.disparo_lote(bigint) from public, anon, authenticated;
grant execute on function public.disparo_lote(bigint) to service_role;

-- Refaz a fila (campanha salva/editada). Campanha encerrada ou que já bateu a quantidade fica sem fila.
create or replace function public.disparo_replanejar(p_campanha bigint) returns int
language plpgsql volatile set statement_timeout = '60s' as $$
declare
  c public.disparo_campanhas;
begin
  select * into c from public.disparo_campanhas where id = p_campanha for update;
  if not found then raise exception 'campanha % não existe', p_campanha; end if;
  delete from public.disparo_plano where campanha_id = p_campanha;
  if c.status = 'concluida'
     or (c.limite_total is not null and public.disparo_contados(c.id) >= c.limite_total) then
    return 0;
  end if;
  return public.disparo_planejar(p_campanha, public.disparo_lote(p_campanha));
end $$;
revoke all on function public.disparo_replanejar(bigint) from public, anon, authenticated;
grant execute on function public.disparo_replanejar(bigint) to service_role;

-- ---------------------------------------------------------------- reservar = consumir a fila
create or replace function public.disparo_reservar(p_numero bigint)
returns setof public.disparos
language plpgsql volatile set statement_timeout = '60s' as $$
declare
  c        public.disparo_campanhas;
  item     public.disparo_plano;
  emp      record;
  novo     public.disparos;
  n        int;
  tent     int;
  planejou boolean;
  grp      bigint := (select grupo_id from public.disparo_numeros where id = p_numero);
begin
  for c in select dc.* from public.disparo_campanhas dc
             join public.disparo_grupos g on g.id = dc.grupo_id and g.ativo
            where dc.status = 'ativa' and dc.grupo_id = grp
            order by dc.ultima_reserva_em nulls first, dc.criada_em, dc.id loop
    if c.limite_total is not null and public.disparo_contados(c.id) >= c.limite_total then
      update public.disparo_campanhas
         set status = 'concluida', motivo_status = 'quantidade de disparos atingida', atualizada_em = now()
       where id = c.id;
      delete from public.disparo_plano where campanha_id = c.id;
      continue;
    end if;

    tent := 0;
    planejou := false;
    loop
      tent := tent + 1;
      exit when tent > 40;

      -- próximo da fila; SKIP LOCKED = dois números ao mesmo tempo nunca pegam a mesma empresa
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
                                   municipio, ramo, ramo_nome, uf)
      values (c.grupo_id, c.id, p_numero, item.cnpj, item.telefone, emp.razao_social, emp.nome_fantasia,
              emp.municipio, emp.divisao, emp.ramo, emp.uf)
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
revoke all on function public.disparo_reservar(bigint) from public, anon, authenticated;
grant execute on function public.disparo_reservar(bigint) to service_role;

-- campanha encerrada não guarda fila
create or replace function public.disparo_campanha_limpa_fila() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'concluida' and old.status is distinct from 'concluida' then
    delete from public.disparo_plano where campanha_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists disparo_campanha_limpa_fila on public.disparo_campanhas;
create trigger disparo_campanha_limpa_fila after update of status on public.disparo_campanhas
  for each row execute function public.disparo_campanha_limpa_fila();

commit;
