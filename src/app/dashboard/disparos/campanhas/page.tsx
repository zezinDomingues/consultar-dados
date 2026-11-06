import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { usuarioAtual } from '@/lib/empresas/consulta'
import Link from 'next/link'
import { CircleCheck, Megaphone, Pause, Pencil, Play, Square } from 'lucide-react'
import { BotaoAcao } from '@/components/disparos/botao-acao'
import { SeloCampanha } from '@/components/disparos/selos'
import { mudarStatusCampanha } from '@/app/dashboard/disparos/actions'
import { listarCampanhas } from '@/lib/disparos/dados'
import { opcoesFiltros } from '@/lib/empresas/consulta'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import { fmtDataHora, fmtInt, fmtPct, fmtRelativo } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'

export const metadata: Metadata = { title: 'Campanhas' }

export default async function CampanhasPage({ searchParams }: { searchParams: Promise<{ salva?: string }> }) {
  if (!(await usuarioAtual())?.admin) redirect(ROTAS.disparos)
  const { salva } = await searchParams
  const [campanhas, opcoes] = await Promise.all([listarCampanhas(), opcoesFiltros()])

  if (!campanhas.length) {
    return (
      <div className='rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center'>
        <Megaphone className='mx-auto size-10 text-ouro-escuro' strokeWidth={1.5} />
        <h2 className='mt-3 font-serif text-xl font-bold text-marca-800'>Nenhuma campanha ainda</h2>
        <p className='mx-auto mt-1 max-w-md text-sm text-slate-500'>
          Filtre as empresas na Consulta (setor, regime, região…) e clique em <strong>Criar campanha</strong>, ou comece pela base inteira.
        </p>
        <div className='mt-5 flex justify-center gap-2'>
          <Link href={ROTAS.dashboard} className='inline-flex h-10 items-center rounded-full border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700 hover:border-marca-400'>
            Escolher na Consulta
          </Link>
          <Link href={ROTAS.novaCampanha} className='inline-flex h-10 items-center rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950'>
            Nova campanha
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className='space-y-3'>
      {campanhas.map(c => {
        const n = c.numeros
        const enviados = n?.enviados ?? 0
        const rotulos = rotulosFiltros(c.filtros, opcoes).map(r => r.rotulo)
        return (
          <article
            key={c.id}
            className={`rounded-2xl border bg-white p-5 shadow-sm shadow-marca-900/[0.03] ${String(c.id) === salva ? 'border-emerald-300 ring-2 ring-emerald-100' : 'border-slate-200'}`}
          >
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h2 className='font-serif text-lg font-bold text-marca-800'>{c.nome}</h2>
                  <SeloCampanha status={c.status} />
                  {String(c.id) === salva && (
                    <span className='inline-flex items-center gap-1 text-xs font-semibold text-emerald-700'>
                      <CircleCheck className='size-3.5' /> salva
                    </span>
                  )}
                </div>
                <p className='mt-1 line-clamp-1 text-xs text-slate-500'>{rotulos.length ? rotulos.join(' · ') : 'Base inteira com WhatsApp'}</p>
                <p className='mt-0.5 text-[11px] text-slate-400'>
                  Criada {fmtDataHora(c.criada_em)}
                  {n?.ultimo_envio_em ? ` · último envio ${fmtRelativo(n.ultimo_envio_em)}` : ''}
                  {c.limite_total ? ` · limite ${fmtInt(c.limite_total)}` : ''}
                  {c.motivo_status ? ` · ${c.motivo_status}` : ''}
                </p>
              </div>
              <div className='flex flex-wrap gap-1.5'>
                {c.status !== 'ativa' && (
                  <BotaoAcao acao={mudarStatusCampanha.bind(null, c.id, 'ativa')} variante='primario'>
                    <Play className='size-3.5' /> Ativar
                  </BotaoAcao>
                )}
                {c.status === 'ativa' && (
                  <BotaoAcao acao={mudarStatusCampanha.bind(null, c.id, 'pausada')}>
                    <Pause className='size-3.5' /> Pausar
                  </BotaoAcao>
                )}
                <Link
                  href={ROTAS.campanha(c.id)}
                  className='inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-marca-300 hover:text-marca-800'
                >
                  <Pencil className='size-3.5' /> Editar textos
                </Link>
                {c.status !== 'concluida' && (
                  <BotaoAcao
                    acao={mudarStatusCampanha.bind(null, c.id, 'concluida')}
                    variante='texto'
                    confirmar='Encerrar a campanha? Ninguém mais recebe a 1ª mensagem por ela (as conversas abertas continuam).'
                  >
                    <Square className='size-3.5' /> Encerrar
                  </BotaoAcao>
                )}
              </div>
            </div>

            <dl className='mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6'>
              {[
                { r: 'Enviados', v: enviados, nota: '' },
                { r: 'Lidos', v: n?.lidos ?? 0, nota: fmtPct(n?.lidos ?? 0, enviados) },
                { r: 'Responderam', v: n?.responderam ?? 0, nota: fmtPct(n?.responderam ?? 0, enviados) },
                { r: 'Querem consulta', v: n?.interessados ?? 0, nota: fmtPct(n?.interessados ?? 0, enviados) },
                { r: 'Preencheram', v: n?.preencheram ?? 0, nota: fmtPct(n?.preencheram ?? 0, enviados) },
                { r: 'Recusaram', v: n?.recusaram ?? 0, nota: `${fmtInt(n?.nao_entregues ?? 0)} não entregues` }
              ].map(x => (
                <div key={x.r} className='rounded-xl bg-slate-50 px-3 py-2'>
                  <dt className='truncate text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500'>{x.r}</dt>
                  <dd className='mt-1 font-serif text-xl font-bold tabular-nums text-marca-800'>
                    <Link href={`${ROTAS.disparos}?campanha=${c.id}`} className='hover:underline'>
                      {fmtInt(x.v)}
                    </Link>
                  </dd>
                  {x.nota && <dd className='truncate text-[11px] text-slate-400'>{x.nota}</dd>}
                </div>
              ))}
            </dl>
          </article>
        )
      })}
    </div>
  )
}
