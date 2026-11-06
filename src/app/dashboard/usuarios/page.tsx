import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight, UserPlus } from 'lucide-react'
import { FormUsuario } from '@/components/usuarios/form-usuario'
import { PAPEIS } from '@/lib/usuarios/papeis'
import { listarGrupos } from '@/lib/disparos/dados'
import { opcoesFiltros, usuarioAtual } from '@/lib/empresas/consulta'
import { fmtDataHora, fmtInt, fmtRelativo } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { listarUsuarios } from '@/lib/usuarios/dados'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Usuários' }

const COR_PAPEL: Record<string, string> = {
  admin: 'bg-marca-800 text-creme',
  equipe: 'bg-sky-50 text-sky-800',
  consulta: 'bg-slate-100 text-slate-700',
  cliente: 'bg-amber-50 text-amber-800'
}

export default async function UsuariosPage() {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.dashboard)
  const [usuarios, opcoes, gruposDisparo] = await Promise.all([listarUsuarios(), opcoesFiltros(), listarGrupos()])
  const opcoesGrupos = gruposDisparo.map(g => ({ chave: String(g.id), nome: g.nome, n: g.enviados }))
  const nomeRamo = new Map(opcoes.ramos.map(r => [r.chave, r.nome]))
  const grupos = PAPEIS.map(p => ({ ...p, lista: usuarios.filter(u => u.papel === p.valor) })).filter(g => g.lista.length)

  return (
    <div className='space-y-5 p-6'>
      <header className='max-w-2xl'>
        <span className='rotulo-secao'>Administrativo</span>
        <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Usuários</h1>
        <p className='text-sm text-slate-500'>
          Equipe interna e clientes do produto “Consulta de dados”. Cliente só enxerga os ramos e estados do plano, com os contatos
          liberados um a um dentro da cota.
        </p>
      </header>

      <details className='group rounded-2xl border border-slate-200 bg-white p-5'>
        <summary className='flex cursor-pointer list-none items-center gap-2 font-semibold text-marca-800'>
          <UserPlus className='size-4 text-ouro-escuro' /> Novo usuário
          <ChevronRight className='ml-auto size-4 text-slate-400 transition group-open:rotate-90' />
        </summary>
        <div className='mt-4'>
          <FormUsuario ramos={opcoes.ramos} ufs={opcoes.ufs} grupos={opcoesGrupos} />
        </div>
      </details>

      {grupos.map(g => (
        <section key={g.valor} className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          <p className='border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            {g.titulo} · {g.lista.length}
          </p>
          <ul className='divide-y divide-slate-100'>
            {g.lista.map(u => (
              <li key={u.user_id}>
                <Link href={ROTAS.usuario(u.user_id)} className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-marca-50/40', !u.ativo && 'opacity-50')}>
                  <span className='min-w-[220px] flex-1'>
                    <span className='block font-medium text-slate-800'>
                      {u.nome || u.email} {!u.ativo && <span className='text-xs font-normal text-red-600'>(desativado)</span>}
                    </span>
                    <span className='block text-xs text-slate-400'>{u.email}</span>
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_PAPEL[u.papel])}>{u.papel}</span>
                  <span className='min-w-[260px] flex-[2] text-xs text-slate-500'>
                    {u.papel === 'equipe' &&
                      (u.ramos.length ? `Ramos: ${u.ramos.map(r => nomeRamo.get(r) ?? r).join(', ')}` : 'Sem ramos — não vê disparos')}
                    {u.papel === 'cliente' && u.grupos.length > 0 && (
                      <span className='mr-1 font-semibold text-violet-700'>
                        Disparos: {u.grupos.map(g => gruposDisparo.find(x => x.id === g)?.nome ?? g).join(', ')} ·{' '}
                      </span>
                    )}
                    {u.papel === 'cliente' &&
                      (u.plano ? (
                        <>
                          {u.plano.ramos.map(r => nomeRamo.get(r) ?? r).join(', ')} · {u.plano.ufs?.join('/') ?? 'todos os estados'} ·{' '}
                          <strong className={u.plano.saldo ? 'text-emerald-700' : 'text-red-600'}>
                            {fmtInt(u.plano.saldo)} de {fmtInt(u.plano.limite)}
                          </strong>{' '}
                          {u.plano.modalidade === 'mensal' ? 'neste mês' : 'no saldo'}
                          {u.plano.vencido && <strong className='text-red-600'> · vencido</strong>}
                        </>
                      ) : (
                        !u.grupos.length && <strong className='text-red-600'>sem produto</strong>
                      ))}
                  </span>
                  <span className='text-xs text-slate-400' title={u.ultimo_acesso ? fmtDataHora(u.ultimo_acesso) : ''}>
                    {u.ultimo_acesso ? `entrou ${fmtRelativo(u.ultimo_acesso)}` : 'nunca entrou'}
                  </span>
                  <ChevronRight className='size-4 text-slate-300' />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
