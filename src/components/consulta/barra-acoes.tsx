'use client'

import Link from 'next/link'
import { Download, Send } from 'lucide-react'
import { useConsulta } from './contexto'
import { hrefConsulta, LIMITE_EXPORTACAO, ORDENS, paraQuery, POR_PAGINA, type Consulta, type Ordem } from '@/lib/empresas/filtros'
import { ROTAS } from '@/lib/rotas'

export function BarraAcoes({ consulta, admin = false }: { consulta: Consulta; admin?: boolean }) {
  const { navegar } = useConsulta()
  const select =
    'h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-sm text-slate-700 outline-none focus:border-marca-400'

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
          className='inline-flex h-10 items-center gap-2 rounded-full border border-marca-800 bg-white px-5 text-sm font-bold tracking-wide text-marca-800 transition hover:bg-marca-50'
        >
          <Send className='size-4' /> Criar campanha
        </Link>
      )}
      <a
        href={`/api/exportar?${paraQuery({ filtros: consulta.filtros, ordem: consulta.ordem })}`}
        title={`Baixa até ${LIMITE_EXPORTACAO.toLocaleString('pt-BR')} empresas, na ordem atual`}
        className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950'
      >
        <Download className='size-4' /> Exportar CSV
      </a>
    </div>
  )
}
