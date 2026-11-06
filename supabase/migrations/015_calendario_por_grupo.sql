-- 015 · Calendário por grupo (06/11/2026)
--
-- Regra do usuário: cada pessoa só vê o calendário dos grupos de que faz parte, e dentro do grupo todos veem as
-- reuniões de todos. O admin vê todos os grupos. Pertencer a um grupo = grupo_membros (agora para qualquer papel:
-- equipe, consulta ou cliente). A OficialCert é o grupo 1; as reuniões que já existiam vão para ele.
-- Ser membro de um grupo NÃO dá acesso aos disparos dele para a equipe interna (a equipe continua vendo os disparos
-- pelos ramos): as políticas de disparo "do grupo" passam a valer só para o papel cliente.
-- Idempotente.

alter table public.reunioes add column if not exists grupo_id bigint references public.disparo_grupos (id) on delete cascade;
update public.reunioes set grupo_id = (select min(id) from public.disparo_grupos) where grupo_id is null;
alter table public.reunioes alter column grupo_id set not null;
create index if not exists reunioes_grupo_idx on public.reunioes (grupo_id, inicio);

drop policy if exists "equipe ve" on public.reunioes;
drop policy if exists "equipe cria" on public.reunioes;
drop policy if exists "dono ou admin altera" on public.reunioes;
drop policy if exists "dono ou admin apaga" on public.reunioes;
drop policy if exists "grupo ve" on public.reunioes;
create policy "grupo ve" on public.reunioes for select to authenticated
  using ((select public.is_app_admin()) or grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "grupo cria" on public.reunioes;
create policy "grupo cria" on public.reunioes for insert to authenticated
  with check (criado_por = (select auth.uid())
              and ((select public.is_app_admin()) or grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))));
drop policy if exists "dono ou admin altera" on public.reunioes;
create policy "dono ou admin altera" on public.reunioes for update to authenticated
  using ((select public.is_app_admin())
         or (criado_por = (select auth.uid()) and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))))
  with check ((select public.is_app_admin()) or grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "dono ou admin apaga" on public.reunioes;
create policy "dono ou admin apaga" on public.reunioes for delete to authenticated
  using ((select public.is_app_admin())
         or (criado_por = (select auth.uid()) and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))));

-- Grupos que a pessoa enxerga (admin: todos) — calendário e seletor de grupo
drop policy if exists "membro le o seu" on public.disparo_grupos;
create policy "membro le o seu" on public.disparo_grupos for select to authenticated
  using (id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));

-- Disparos "do grupo" só para o papel cliente (a equipe interna segue pelos ramos)
do $$
declare t text;
begin
  foreach t in array array['disparos', 'disparo_campanhas', 'disparo_numeros'] loop
    execute format('drop policy if exists "cliente le seu grupo" on public.%I', t);
    execute format('create policy "cliente le seu grupo" on public.%I for select to authenticated
                    using ((select public.meu_papel()) = ''cliente''
                           and grupo_id = any (coalesce((select public.meus_grupos()), ''{}''::bigint[])))', t);
  end loop;
end $$;
drop policy if exists "cliente marca seu grupo" on public.disparos;
create policy "cliente marca seu grupo" on public.disparos for update to authenticated
  using ((select public.meu_papel()) = 'cliente' and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])))
  with check ((select public.meu_papel()) = 'cliente' and grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[])));
drop policy if exists "cliente le conversas" on public.disparo_eventos;
create policy "cliente le conversas" on public.disparo_eventos for select to authenticated
  using ((select public.meu_papel()) = 'cliente'
         and exists (select 1 from public.disparos d where d.id = disparo_id
                       and d.grupo_id = any (coalesce((select public.meus_grupos()), '{}'::bigint[]))));
drop policy if exists "cliente le regras" on public.disparo_config;
create policy "cliente le regras" on public.disparo_config for select to authenticated
  using ((select public.meu_papel()) = 'cliente' and cardinality(coalesce((select public.meus_grupos()), '{}'::bigint[])) > 0);

-- Quem aparece no calendário: as pessoas que dividem algum grupo comigo (admin: todos os ativos)
create or replace function public.pessoas_dos_meus_grupos()
returns table (user_id uuid, nome text, email text, papel text)
language sql stable security definer set search_path = '' as $$
  select distinct u.user_id, coalesce(nullif(u.nome, ''), split_part(u.email, '@', 1)), u.email, u.papel
    from public.app_usuarios u
   where u.ativo
     and (public.is_app_admin()
          or u.papel = 'admin'
          or exists (select 1 from public.grupo_membros m
                      where m.user_id = u.user_id and m.grupo_id = any (public.meus_grupos())))
   order by 2
$$;
revoke all on function public.pessoas_dos_meus_grupos() from public, anon;
grant execute on function public.pessoas_dos_meus_grupos() to authenticated;

notify pgrst, 'reload schema';
