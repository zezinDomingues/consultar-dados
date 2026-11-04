// Indicadores e barras de distribuição. Componentes puros: servem à página de
// Consulta (servidor) e aos cartões de resultado do agente (navegador).
import Link from 'next/link'
import { Building, Landmark, Mail, MessageCircle, Star, TrendingUp } from 'lucide-react'
import type { ItemResumo, Resumo } from '@/lib/empresas/tipos'
import { fmtInt, fmtPct } from '@/lib/formatar'
import { cn } from '@/lib/utils'

type LinkComp = React.ComponentType<{ href: string; className?: string; title?: string; children: React.ReactNode }>

export function CartoesIndicadores({
  total: t,
  base,
  compacto = false
}: {
  total: Resumo['total']
  base: number
  compacto?: boolean
}) {
  const cards = [
    { rotulo: 'Empresas encontradas', valor: t.n, nota: `${fmtPct(t.n, base)} da base`, icone: Building, destaque: true },
    { rotulo: 'Lucro Real', valor: t.lucro_real, nota: `${fmtPct(t.lucro_real, t.n)} do resultado`, icone: Landmark },
    { rotulo: 'Regime recente', valor: t.regime_recente, nota: 'ECF 2024, fora do Simples', icone: TrendingUp },
    { rotulo: 'Com WhatsApp', valor: t.com_whatsapp, nota: `${fmtPct(t.com_whatsapp, t.n)} com celular`, icone: MessageCircle },
    { rotulo: 'E-mail próprio', valor: t.email_proprio, nota: 'não é do contador', icone: Mail },
    { rotulo: 'Prioridade A', valor: t.prioridade_a, nota: 'score ≥ 75', icone: Star }
  ]
  return (
    <div className={cn('grid gap-3', compacto ? 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 2xl:grid-cols-6')}>
      {cards.map(c => (
        <div
          key={c.rotulo}
          className={cn(
            'rounded-xl border',
            compacto ? 'p-3' : 'p-4',
            c.destaque ? 'border-marca-800 bg-marca-900 text-white' : 'border-slate-200 bg-white'
          )}
        >
          <div className={cn('flex items-center gap-1.5 text-xs', c.destaque ? 'text-marca-100' : 'text-slate-500')}>
            <c.icone className='size-3.5 shrink-0' />
            <span className='truncate'>{c.rotulo}</span>
          </div>
          <p className={cn('font-semibold tabular-nums', compacto ? 'mt-1.5 text-xl' : 'mt-2 text-2xl', c.destaque ? 'text-white' : 'text-slate-900')}>
            {fmtInt(c.valor)}
          </p>
          <p className={cn('mt-0.5 truncate text-xs', c.destaque ? 'text-marca-200' : 'text-slate-400')}>{c.nota}</p>
        </div>
      ))}
    </div>
  )
}

export function BarrasDistribuicao({
  titulo,
  itens = [],
  hrefDe,
  selecionados = [],
  limite = 6,
  nota = 'clique para filtrar',
  Componente = Link
}: {
  titulo: string
  itens?: ItemResumo[]
  hrefDe: (item: ItemResumo) => string
  selecionados?: string[]
  limite?: number
  nota?: string
  Componente?: LinkComp
}) {
  const visiveis = itens.slice(0, limite)
  const max = Math.max(1, ...visiveis.map(i => i.n))
  const resto = itens.length - visiveis.length

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4'>
      <div className='mb-3 flex items-baseline justify-between gap-2'>
        <h3 className='text-sm font-semibold text-slate-700'>{titulo}</h3>
        <span className='truncate text-[11px] text-slate-400'>{nota}</span>
      </div>
      <ul className='space-y-1'>
        {visiveis.map(item => {
          const ativo = selecionados.includes(item.chave)
          return (
            <li key={item.chave}>
              <Componente
                href={hrefDe(item)}
                title={ativo ? `Remover filtro: ${item.nome}` : `Filtrar por ${item.nome}`}
                className='group relative block overflow-hidden rounded-md px-2 py-1.5'
              >
                <span
                  className={cn(
                    'absolute inset-y-0 left-0 rounded-md transition-colors',
                    ativo ? 'bg-marca-200' : 'bg-marca-50 group-hover:bg-marca-100'
                  )}
                  style={{ width: `${(item.n / max) * 100}%` }}
                />
                <span className='relative flex items-center justify-between gap-3 text-sm'>
                  <span className={cn('truncate', ativo ? 'font-medium text-marca-900' : 'text-slate-700')}>{item.nome}</span>
                  <span className='shrink-0 text-xs tabular-nums text-slate-500'>{fmtInt(item.n)}</span>
                </span>
              </Componente>
            </li>
          )
        })}
      </ul>
      {resto > 0 && <p className='mt-2 px-2 text-xs text-slate-400'>+ {fmtInt(resto)} outros</p>}
    </div>
  )
}

export const ORDEM_PORTE = ['Demais (médio/grande)', 'Empresa de pequeno porte', 'Microempresa']
export const ordenarPorte = (itens: ItemResumo[] = []) =>
  [...itens].sort((a, b) => ORDEM_PORTE.indexOf(a.chave) - ORDEM_PORTE.indexOf(b.chave))
