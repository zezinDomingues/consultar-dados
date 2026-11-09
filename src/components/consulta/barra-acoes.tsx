'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Download, LoaderCircle, Send, TriangleAlert } from 'lucide-react'
import { useConsulta } from './contexto'
import { hrefConsulta, LIMITE_EXPORTACAO, ORDENS, paraQuery, POR_PAGINA, type Consulta, type Ordem } from '@/lib/empresas/filtros'
import { ROTAS } from '@/lib/rotas'

const fmt = (n: number) => n.toLocaleString('pt-BR')

/**
 * `total` (opcional): quantas empresas a consulta tem. Sem ele, o "Exportar CSV" pergunta ao servidor antes de
 * baixar (o mesmo resumo da tela, que já está em cache) e avisa quando o arquivo vai sair cortado.
 */
export function BarraAcoes({ consulta, admin = false, total }: { consulta: Consulta; admin?: boolean; total?: number }) {
  const { navegar } = useConsulta()
  const select =
    'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-marca-400 focus-visible:ring-2 focus-visible:ring-marca-400'
  const qs = paraQuery({ filtros: consulta.filtros, ordem: consulta.ordem })
  const href = `/api/exportar?${qs}`
  const [conferindo, setConferindo] = useState(false)
  const [corte, setCorte] = useState<number | null>(null)
  const baixarRef = useRef<HTMLButtonElement>(null)

  // outra consulta, outro total
  useEffect(() => setCorte(null), [qs])
  useEffect(() => {
    if (corte !== null) baixarRef.current?.focus()
  }, [corte])

  const baixar = () => {
    setCorte(null)
    window.location.href = href
  }

  async function exportar(e: React.MouseEvent<HTMLAnchorElement>) {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (conferindo) return
    let n = total
    if (n === undefined) {
      setConferindo(true)
      try {
        const r = await fetch(`${href}${qs ? '&' : ''}contar=1`, { cache: 'no-store' })
        if (r.ok) n = ((await r.json()) as { total?: number }).total
      } catch {
        // sem o total, baixa direto: o próprio arquivo avisa na última linha se foi cortado
      } finally {
        setConferindo(false)
      }
    }
    if (n !== undefined && n > LIMITE_EXPORTACAO) setCorte(n)
    else baixar()
  }

  return (
    <div className='flex flex-wrap items-center gap-2'>
      <label className='flex items-center gap-2 text-xs text-slate-500'>
        Ordenar
        <select
          value={consulta.ordem}
          onChange={e => navegar(hrefConsulta({ ...consulta, ordem: e.target.value as Ordem, pagina: 1 }))}
          className={select}
        >
          {Object.entries(ORDENS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </label>
      <select
        aria-label='Por página'
        value={consulta.por}
        onChange={e => navegar(hrefConsulta({ ...consulta, por: Number(e.target.value), pagina: 1 }))}
        className={select}
      >
        {POR_PAGINA.map(n => (
          <option key={n} value={n}>
            {n} por página
          </option>
        ))}
      </select>
      {admin && (
        <Link
          href={`${ROTAS.novaCampanha}?${paraQuery({ filtros: consulta.filtros, ordem: consulta.ordem })}`}
          title='Disparar WhatsApp para as empresas destes filtros (só quem tem celular e nunca foi contatado)'
          className='inline-flex h-10 items-center gap-2 rounded-full border border-marca-800 bg-white px-5 text-sm font-bold tracking-wide text-marca-800 transition hover:bg-marca-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400 focus-visible:ring-offset-2'
        >
          <Send className='size-4' /> Criar campanha
        </Link>
      )}
      <a
        href={href}
        onClick={exportar}
        aria-busy={conferindo}
        title={`Baixa até ${fmt(LIMITE_EXPORTACAO)} empresas, na ordem atual`}
        className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400 focus-visible:ring-offset-2'
      >
        {conferindo ? <LoaderCircle className='size-4 animate-spin' /> : <Download className='size-4' />} Exportar CSV
      </a>
      {corte !== null && (
        <div
          role='alertdialog'
          aria-labelledby='aviso-corte-titulo'
          aria-describedby='aviso-corte-texto'
          onKeyDown={e => e.key === 'Escape' && setCorte(null)}
          className='flex w-full flex-wrap items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
        >
          <TriangleAlert className='mt-0.5 size-4 shrink-0' aria-hidden />
          <div className='min-w-0 flex-1 basis-60'>
            <p id='aviso-corte-titulo' className='font-semibold'>
              O CSV traz no máximo {fmt(LIMITE_EXPORTACAO)} empresas
            </p>
            <p id='aviso-corte-texto' className='mt-0.5'>
              Esta consulta tem {fmt(corte)}. Saem as primeiras {fmt(LIMITE_EXPORTACAO)} na ordem atual; refine os filtros para
              baixar o restante.
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            <button
              ref={baixarRef}
              type='button'
              onClick={baixar}
              className='h-9 rounded-full bg-marca-800 px-4 text-xs font-bold text-creme hover:bg-marca-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400 focus-visible:ring-offset-2'
            >
              Baixar as primeiras {fmt(LIMITE_EXPORTACAO)}
            </button>
            <button
              type='button'
              onClick={() => setCorte(null)}
              className='h-9 rounded-full border border-amber-300 bg-white px-4 text-xs font-semibold text-amber-900 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca-400 focus-visible:ring-offset-2'
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
