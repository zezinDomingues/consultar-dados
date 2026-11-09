import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { FormPacote, RedefinirSenha } from '@/components/usuarios/acoes-usuario'
import { FormUsuario } from '@/components/usuarios/form-usuario'
import { listarGrupos } from '@/lib/disparos/dados'
import { opcoesFiltros, usuarioAtual } from '@/lib/empresas/consulta'
import { fmtDataHora, fmtInt } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { obterUsuario } from '@/lib/usuarios/dados'

export const metadata: Metadata = { title: 'Usuário' }

export default async function UsuarioPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.dashboard)
  const { id } = await params
  const [u, opcoes, gruposDisparo] = await Promise.all([obterUsuario(id), opcoesFiltros(), listarGrupos()])
  const opcoesGrupos = gruposDisparo.map(g => ({ chave: String(g.id), nome: g.nome, n: g.enviados }))
  if (!u) notFound()

  return (
    <div className='space-y-5 p-4 sm:p-6'>
      <Link
        href={ROTAS.usuarios}
        className='inline-flex items-center gap-1.5 rounded text-xs font-semibold text-slate-600 outline-none hover:text-marca-700 focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'
      >
        <ArrowLeft aria-hidden className='size-3.5' /> Usuários
      </Link>
      <header className='min-w-0'>
        <h1 className='break-words font-serif text-[2rem] font-bold leading-tight tracking-[-0.02em] text-marca-800'>{u.nome || u.email}</h1>
        <p className='break-words text-sm text-slate-500'>
          {u.email} · criado em {fmtDataHora(u.criado_em)} · {u.ultimo_acesso ? `último acesso ${fmtDataHora(u.ultimo_acesso)}` : 'nunca entrou'}
        </p>
      </header>

      <div className='grid min-w-0 gap-5 xl:grid-cols-[1.4fr_1fr]'>
        <section className='min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5'>
          <FormUsuario usuario={u} ramos={opcoes.ramos} ufs={opcoes.ufs} grupos={opcoesGrupos} />
        </section>

        <aside className='space-y-4'>
          {u.papel === 'cliente' && u.plano && (
            <div className='rounded-2xl border border-ouro/60 bg-white p-4 ring-1 ring-ouro/30'>
              <h2 className='text-[11px] font-bold uppercase tracking-[0.14em] text-marca-700'>Saldo</h2>
              <p className='mt-2 font-serif text-3xl font-bold text-marca-800'>
                {fmtInt(u.plano.saldo)} <span className='text-base font-normal text-slate-500'>de {fmtInt(u.plano.limite)}</span>
              </p>
              <p className='text-xs text-slate-500'>
                {u.plano.modalidade === 'mensal' ? `cota de ${fmtInt(u.plano.limite)} por mês · ${fmtInt(u.plano.usadas)} usadas neste mês` : `${fmtInt(u.plano.usadas)} usadas de todos os pacotes`}
                {' · '}
                {fmtInt(u.plano.total_liberadas)} empresas liberadas no total
              </p>
              {u.plano.vencido && <p className='mt-2 text-xs font-semibold text-red-700'>Plano vencido: o cliente não consegue consultar.</p>}
              {u.plano.modalidade === 'pacote' && (
                <div className='mt-4 border-t border-slate-100 pt-3'>
                  <h3 className='text-xs font-semibold text-slate-600'>Pacotes (levas de compra)</h3>
                  <ul className='mt-2 space-y-1 text-xs text-slate-500'>
                    {u.pacotes.map(p => (
                      <li key={p.id}>
                        +{fmtInt(p.quantidade)} · {fmtDataHora(p.criado_em)}
                        {p.observacao ? ` · ${p.observacao}` : ''}
                      </li>
                    ))}
                    {!u.pacotes.length && <li>Nenhum pacote ainda.</li>}
                  </ul>
                  <FormPacote userId={u.user_id} />
                </div>
              )}
            </div>
          )}
          <div className='rounded-2xl border border-slate-200 bg-white p-4'>
            <h2 className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Senha</h2>
            <p className='mt-1 text-xs text-slate-500'>Gera uma senha provisória nova para repassar à pessoa.</p>
            <div className='mt-3'>
              <RedefinirSenha userId={u.user_id} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
