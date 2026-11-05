import { ChevronLeft, ChevronRight, SearchX } from 'lucide-react'
import { LinkNav } from './contexto'
import { TabelaEmpresas } from './tabela-empresas'
import { buscarEmpresas, resumoEmpresas } from '@/lib/empresas/consulta'
import { hrefConsulta, type Consulta } from '@/lib/empresas/filtros'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

export async function Resultados({ consulta }: { consulta: Consulta }) {
  const [empresas, resumo] = await Promise.all([
    buscarEmpresas(consulta.filtros, consulta.ordem, consulta.pagina, consulta.por),
    resumoEmpresas(JSON.stringify(consulta.filtros))
  ])
  const total = resumo.total.n

  if (total === 0) {
    return (
      <div className='rounded-xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center'>
        <SearchX className='mx-auto size-10 text-slate-300' />
        <p className='mt-3 font-medium'>Nenhuma empresa com esses filtros</p>
        <p className='mt-1 text-sm text-slate-500'>Tire algum filtro ou amplie a faixa de capital/idade.</p>
        <LinkNav href={ROTAS.dashboard} className='mt-4 inline-block text-sm font-medium text-marca-700 hover:underline'>
          Limpar todos os filtros
        </LinkNav>
      </div>
    )
  }

  const de = (consulta.pagina - 1) * consulta.por + 1
  const ate = de + empresas.length - 1
  const paginas = Math.ceil(total / consulta.por)

  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
      <TabelaEmpresas empresas={empresas} />

      <div className='flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm'>
        <p className='text-slate-500'>
          Mostrando <strong className='text-slate-700'>{fmtInt(de)}–{fmtInt(ate)}</strong> de{' '}
          <strong className='text-slate-700'>{fmtInt(total)}</strong>
        </p>
        <Paginacao consulta={consulta} paginas={paginas} />
      </div>
    </div>
  )
}

function Paginacao({ consulta, paginas }: { consulta: Consulta; paginas: number }) {
  const atual = consulta.pagina
  const href = (p: number) => hrefConsulta({ ...consulta, pagina: p })
  const janela = new Set([1, paginas, atual - 1, atual, atual + 1].filter(p => p >= 1 && p <= paginas))
  const lista = [...janela].sort((a, b) => a - b)
  const botao = 'grid h-8 min-w-8 place-items-center rounded-md px-2 text-sm transition'

  return (
    <nav className='flex items-center gap-1' aria-label='Paginação'>
      {atual > 1 ? (
        <LinkNav href={href(atual - 1)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')} title='Página anterior'>
          <ChevronLeft className='size-4' />
        </LinkNav>
      ) : (
        <span className={cn(botao, 'text-slate-300')}>
          <ChevronLeft className='size-4' />
        </span>
      )}
      {lista.map((p, i) => (
        <span key={p} className='flex items-center gap-1'>
          {i > 0 && p - lista[i - 1] > 1 && <span className='px-1 text-slate-400'>…</span>}
          {p === atual ? (
            <span className={cn(botao, 'bg-marca-800 font-medium text-white')}>{fmtInt(p)}</span>
          ) : (
            <LinkNav href={href(p)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')}>
              {fmtInt(p)}
            </LinkNav>
          )}
        </span>
      ))}
      {atual < paginas ? (
        <LinkNav href={href(atual + 1)} className={cn(botao, 'text-slate-600 hover:bg-slate-100')} title='Próxima página'>
          <ChevronRight className='size-4' />
        </LinkNav>
      ) : (
        <span className={cn(botao, 'text-slate-300')}>
          <ChevronRight className='size-4' />
        </span>
      )}
    </nav>
  )
}

export function ResultadosCarregando() {
  return (
    <div className='overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-marca-900/[0.03]'>
      <div className='h-9 bg-slate-50' />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className='flex gap-4 border-t border-slate-100 px-4 py-4'>
          <div className='size-6 animate-pulse rounded-md bg-slate-100' />
          <div className='flex-1 space-y-2'>
            <div className='h-3.5 w-1/3 animate-pulse rounded bg-slate-100' />
            <div className='h-3 w-1/5 animate-pulse rounded bg-slate-100' />
          </div>
          <div className='h-3.5 w-1/4 animate-pulse rounded bg-slate-100' />
        </div>
      ))}
    </div>
  )
}
