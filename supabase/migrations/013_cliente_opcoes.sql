-- 013 · Opções de filtro do cliente (06/11/2026)
-- O cliente não lê cnae/municipios (RLS da equipe interna). Estas funções devolvem só o que cabe no plano dele:
-- os ramos contratados com o nome e as cidades dos estados do plano (com quantas empresas do plano há em cada).
-- Idempotente.

create or replace function public.cliente_opcoes()
returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  a public.clientes_acesso;
  r jsonb;
begin
  if public.meu_papel() is distinct from 'cliente' then return null; end if;
  select * into a from public.clientes_acesso where user_id = (select auth.uid());
  if not found then return null; end if;
  select jsonb_build_object(
    'ramos', (select jsonb_agg(jsonb_build_object('chave', x.divisao, 'nome', x.ramo) order by x.ramo)
                from (select distinct c.divisao, c.ramo from public.cnae c where c.divisao = any (a.ramos)) x),
    'ufs', coalesce(to_jsonb(a.ufs),
                    (select jsonb_agg(distinct m.uf) from public.municipios m)),
    'municipios', (select jsonb_agg(jsonb_build_object('chave', m.municipio || '/' || m.uf, 'nome', m.municipio || ' – ' || m.uf, 'n', m.n)
                                    order by m.n desc)
                     from (select e.municipio, e.uf, count(*) as n
                             from public.empresas e join public.cnae c on c.cnae = e.cnae_principal
                            where c.divisao = any (a.ramos) and (a.ufs is null or e.uf = any (a.ufs))
                            group by 1, 2) m)
  ) into r;
  return r;
end $$;
revoke all on function public.cliente_opcoes() from public, anon;
grant execute on function public.cliente_opcoes() to authenticated;

notify pgrst, 'reload schema';
