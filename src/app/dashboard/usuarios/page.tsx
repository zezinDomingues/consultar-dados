import { Fragment } from 'react'
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

// selos de papel só com a paleta da marca (marinho, creme e dourado)
const COR_PAPEL: Record<string, string> = {
  admin: 'bg-marca-800 text-creme',
  equipe: 'bg-marca-100 text-marca-900',
  consulta: 'bg-slate-100 text-slate-700',
  cliente: 'bg-ouro/35 text-marca-950'
}
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'

export default async function UsuariosPage() {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.dashboard)
  const [usuarios, opcoes, gruposDisparo] = await Promise.all([listarUsuarios(), opcoesFiltros(), listarGrupos()])
  const opcoesGrupos = gruposDisparo.map(g => ({ chave: String(g.id), nome: g.nome, n: g.enviados }))
  const nomeRamo = new Map(opcoes.ramos.map(r => [r.chave, r.nome]))
  const grupos = PAPEIS.map(p => ({ ...p, lista: usuarios.filter(u => u.papel === p.valor) })).filter(g => g.lista.length)
  const nomeGrupo = (id: number) => gruposDisparo.find(x => x.id === id)?.nome ?? String(id)
  /** Resumo do que a pessoa vê, em pedaços separados por " · " (ramos, grupos, plano). */
  const detalhes = (u: (typeof usuarios)[number]) => {
    const partes: React.ReactNode[] = []
    if (u.papel === 'equipe')
      partes.push(
        u.ramos.length ? `Ramos: ${u.ramos.map(r => nomeRamo.get(r) ?? r).join(', ')}` : <strong className='font-semibold text-amber-800'>Sem ramos — não vê disparos</strong>
      )
    if (u.grupos.length) partes.push(<span className='font-semibold text-marca-700'>Grupos: {u.grupos.map(nomeGrupo).join(', ')}</span>)
    if (u.papel === 'cliente') {
      if (u.plano) {
        partes.push(u.plano.ramos.map(r => nomeRamo.get(r) ?? r).join(', '), u.plano.ufs?.join('/') ?? 'todos os estados')
        partes.push(
          <>
            <strong className={u.plano.saldo ? 'text-marca-800' : 'text-red-700'}>
              {fmtInt(u.plano.saldo)} de {fmtInt(u.plano.limite)}
            </strong>{' '}
            {u.plano.modalidade === 'mensal' ? 'neste mês' : 'no saldo'}
          </>
        )
        if (u.plano.vencido) partes.push(<strong className='text-red-700'>vencido</strong>)
      } else if (!u.grupos.length) partes.push(<strong className='text-red-700'>sem produto</strong>)
    }
    return partes
  }

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <header className='max-w-2xl'>
        <span className='rotulo-secao'>Administrativo</span>
        <h1 className='mt-2 font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>Usuários</h1>
        <p className='text-sm text-slate-500'>
          Equipe interna e clientes (Consulta de dados e Disparos). Cliente da Consulta só enxerga os ramos e estados do plano, com
          os contatos liberados um a um dentro da cota.
        </p>
      </header>

      <details className='group rounded-2xl border border-slate-200 bg-white p-4 sm:p-5'>
        <summary className={cn('-m-1 flex cursor-pointer list-none items-center gap-2 rounded-lg p-1 font-semibold text-marca-800', FOCO)}>
          <UserPlus aria-hidden className='size-4 text-ouro-escuro' /> Novo usuário
          <ChevronRight aria-hidden className='ml-auto size-4 text-slate-500 transition group-open:rotate-90' />
        </summary>
        <div className='mt-4'>
          <FormUsuario ramos={opcoes.ramos} ufs={opcoes.ufs} grupos={opcoesGrupos} />
        </div>
      </details>

      {grupos.map(g => (
        <section key={g.valor} className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
          <h2 className='border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            {g.titulo} · {g.lista.length}
          </h2>
          <ul className='divide-y divide-slate-100'>
            {g.lista.map(u => (
              <li key={u.user_id}>
                <Link
                  href={ROTAS.usuario(u.user_id)}
                  className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-marca-50/40', FOCO, 'focus-visible:ring-inset focus-visible:ring-offset-0')}
                >
                  <span className={cn('min-w-0 flex-1 basis-52', !u.ativo && 'opacity-60')}>
                    <span className='block break-words font-medium text-slate-800'>
                      {u.nome || u.email} {!u.ativo && <span className='text-xs font-normal text-red-700'>(desativado)</span>}
                    </span>
                    <span className='block break-all text-xs text-slate-500'>{u.email}</span>
                  </span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_PAPEL[u.papel])}>{u.papel}</span>
                  <span className='min-w-0 flex-[2] basis-64 text-xs text-slate-600'>
                    {detalhes(u).map((parte, i) => (
                      <Fragment key={i}>
                        {i > 0 && ' · '}
                        {parte}
                      </Fragment>
                    ))}
                  </span>
                  <span className='text-xs text-slate-500' title={u.ultimo_acesso ? fmtDataHora(u.ultimo_acesso) : ''}>
                    {u.ultimo_acesso ? `entrou ${fmtRelativo(u.ultimo_acesso)}` : 'nunca entrou'}
                  </span>
                  <ChevronRight aria-hidden className='size-4 text-slate-400' />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
