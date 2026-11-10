'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronDown, LoaderCircle, Shuffle } from 'lucide-react'
import { previaDivisao } from '@/app/dashboard/disparos/actions'
import type { Divisao, ItemDivisao } from '@/lib/disparos/tipos'
import type { Filtros, Ordem } from '@/lib/empresas/filtros'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'

/** Campanha sem quantidade anda em lotes de 1.000 (igual ao banco): a prévia mostra o 1º lote. */
export const LOTE_SEM_LIMITE = 1000

type Consulta = { filtros: Filtros; ordem: Ordem; excluir_compartilhados: boolean; grupo_id: number }
type Estado = { chave: string; divisao?: Divisao; erro?: string }

/**
 * Como os disparos se dividem. Regra do usuário: o que não foi filtrado divide por igual — nicho, depois estado,
 * regime, porte e localização (o banco faz o rodízio; ver migração 017).
 *  - campanha nova (`consulta`): recalcula a prévia a cada mudança de quantidade/ordem (~2–3 s no banco)
 *  - campanha salva (`salva`): o que já saiu + os próximos da fila
 */
export function DivisaoDisparos({
  quantidade,
  consulta,
  salva,
  alterada
}: {
  quantidade: number | null
  consulta?: Consulta
  salva?: Divisao | null
  /** campanha salva com quantidade/ordem mudada na tela e ainda não salva */
  alterada?: boolean
}) {
  const alvo = Math.min(quantidade ?? LOTE_SEM_LIMITE, 20000)
  const chave = consulta ? JSON.stringify([alvo, consulta]) : ''
  const [estado, setEstado] = useState<Estado | null>(null)
  const ultimo = useRef('')

  useEffect(() => {
    if (!consulta) return
    ultimo.current = chave
    const t = setTimeout(async () => {
      const r = await previaDivisao({ ...consulta, quantidade: alvo }).catch(e => ({ erro: String(e) }))
      if (ultimo.current === chave) setEstado({ chave, ...r })
    }, 600)
    return () => clearTimeout(t)
    // `chave` resume consulta + alvo (o objeto consulta muda de identidade a cada render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave])

  const carregando = !!consulta && estado?.chave !== chave
  const d = consulta ? estado?.divisao : salva
  const erro = consulta ? estado?.erro : null

  return (
    <div className='mt-4 rounded-xl border border-marca-100 bg-marca-50/40 p-4'>
      <div className='flex items-center justify-between gap-2'>
        <p className='flex items-center gap-2 text-sm font-semibold text-marca-900'>
          <Shuffle className='size-4 shrink-0 text-ouro-escuro' aria-hidden />
          {quantidade ? `Como os ${fmtInt(alvo)} disparos se dividem` : `Como se dividem (lotes de ${fmtInt(alvo)})`}
        </p>
        {carregando && <LoaderCircle className='size-4 animate-spin text-marca-400' />}
      </div>
      <p className='mt-1 text-xs text-slate-500'>
        O que você não filtrou é dividido por igual: <strong>nicho</strong>, depois <strong>estado</strong>, regime,
        porte e localização. Se filtrar vários valores, divide entre eles. Nicho ou estado com poucas empresas recebe o
        que tem, e a sobra vai para os outros. Os envios saem intercalados (um de cada nicho por vez).
      </p>

      {erro && (
        <p role='alert' className='mt-3 text-xs text-red-700'>
          Não deu para calcular a divisão: {erro}
        </p>
      )}

      {d && (
        <div className={cn('mt-3 space-y-2 transition-opacity', carregando && 'opacity-50')}>
          {salva && !consulta && (
            <p className='text-xs text-slate-600'>
              Já saíram <strong>{fmtInt(d.enviados ?? 0)}</strong> ·{' '}
              {d.na_fila ? (
                <>
                  na fila <strong>{fmtInt(d.na_fila)}</strong>
                </>
              ) : (
                'a fila é montada pelo ciclo de envio quando a campanha estiver ativa'
              )}
              {alterada && (
                <span className='ml-1 text-amber-800'>· ao salvar, a fila é refeita com a nova quantidade/ordem</span>
              )}
            </p>
          )}
          {consulta && d.total < alvo && (
            <p className='rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900'>
              Só <strong>{fmtInt(d.total)}</strong> empresas disponíveis com esses filtros: a campanha termina antes de
              chegar a {fmtInt(alvo)}.
            </p>
          )}
          <Nichos itens={d.ramo} />
          <Linha rotulo='Estados' itens={d.uf} />
          <Linha rotulo='Regime' itens={d.regime} />
          <Linha rotulo='Porte' itens={d.porte} />
          <Linha rotulo='Localização' itens={d.localizacao} />
          <p className='text-xs text-slate-500'>
            <span className='inline-block w-24 font-semibold text-slate-600'>Segmentos</span>
            {fmtInt(d.segmentos)} diferentes
          </p>
        </div>
      )}
      {!d && !erro && carregando && <p className='mt-3 text-xs text-slate-500'>Calculando a divisão…</p>}
    </div>
  )
}

function Linha({ rotulo, itens }: { rotulo: string; itens: ItemDivisao[] }) {
  return (
    <div className='flex flex-wrap items-baseline gap-x-1.5 gap-y-1 text-xs'>
      <span className='w-24 shrink-0 font-semibold text-slate-600'>{rotulo}</span>
      {itens.map(i => (
        <span key={i.v ?? '?'} className='rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600'>
          {i.v ?? 'sem informação'} <strong className='tabular-nums text-marca-800'>{fmtInt(i.n)}</strong>
        </span>
      ))}
    </div>
  )
}

function Nichos({ itens }: { itens: ItemDivisao[] }) {
  const ns = itens.map(i => i.n)
  const min = Math.min(...ns)
  const max = Math.max(...ns)
  return (
    <details className='group text-xs'>
      <summary className='flex cursor-pointer list-none flex-wrap items-baseline gap-x-1.5'>
        <span className='w-24 shrink-0 font-semibold text-slate-600'>Nichos</span>
        <span className='text-slate-700'>
          <strong className='text-marca-800'>{fmtInt(itens.length)}</strong> nichos ·{' '}
          {min === max ? `${fmtInt(max)} cada` : `de ${fmtInt(min)} a ${fmtInt(max)} cada`}
        </span>
        <span className='inline-flex items-center gap-0.5 font-semibold text-marca-700'>
          ver todos <ChevronDown className='size-3.5 transition group-open:rotate-180' />
        </span>
      </summary>
      <ul className='mt-2 grid max-h-64 gap-x-4 gap-y-0.5 overflow-y-auto rounded-lg bg-white p-2 sm:grid-cols-2'>
        {itens.map(i => (
          <li key={i.v ?? '?'} className='flex justify-between gap-2 text-slate-600'>
            <span className='truncate' title={i.nome}>
              <span className='font-mono text-slate-500'>{i.v ?? '??'}</span> {i.nome}
            </span>
            <strong className='tabular-nums text-marca-800'>{fmtInt(i.n)}</strong>
          </li>
        ))}
      </ul>
    </details>
  )
}
