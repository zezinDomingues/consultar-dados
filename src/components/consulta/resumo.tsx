import { Building, Landmark, Mail, MessageCircle, Star, TrendingUp } from 'lucide-react'
import { LinkNav } from './contexto'
import { resumoEmpresas } from '@/lib/empresas/consulta'
import { alternar, hrefConsulta, type ChaveFiltro, type Consulta, type Filtros } from '@/lib/empresas/filtros'
import type { ItemResumo, Opcoes } from '@/lib/empresas/tipos'
import { fmtInt, fmtPct } from '@/lib/formatar'
import { cn } from '@/lib/utils'

const ORDEM_PORTE = ['Demais (médio/grande)', 'Empresa de pequeno porte', 'Microempresa']

export async function Resumo({ consulta, opcoes }: { consulta: Consulta; opcoes: Opcoes }) {
  const { total: t, dims } = await resumoEmpresas(JSON.stringify(consulta.filtros))

  const cards = [
    { rotulo: 'Empresas encontradas', valor: t.n, nota: `${fmtPct(t.n, opcoes.total_base)} da base`, icone: Building, destaque: true },
    { rotulo: 'Lucro Real', valor: t.lucro_real, nota: `${fmtPct(t.lucro_real, t.n)} do resultado`, icone: Landmark },
    { rotulo: 'Regime recente', valor: t.regime_recente, nota: 'ECF 2024, fora do Simples', icone: TrendingUp },
    { rotulo: 'Com WhatsApp', valor: t.com_whatsapp, nota: `${fmtPct(t.com_whatsapp, t.n)} com celular`, icone: MessageCircle },
    { rotulo: 'E-mail próprio', valor: t.email_proprio, nota: 'não é do contador', icone: Mail },
    { rotulo: 'Prioridade A', valor: t.prioridade_a, nota: 'score ≥ 75', icone: Star }
  ]

  const porte = [...(dims.porte ?? [])].sort((a, b) => ORDEM_PORTE.indexOf(a.chave) - ORDEM_PORTE.indexOf(b.chave))

  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6'>
        {cards.map(c => (
          <div
            key={c.rotulo}
            className={cn(
              'rounded-xl border p-4',
              c.destaque ? 'border-marca-800 bg-marca-900 text-white' : 'border-slate-200 bg-white'
            )}
          >
            <div className={cn('flex items-center gap-2 text-xs', c.destaque ? 'text-marca-100' : 'text-slate-500')}>
              <c.icone className='size-3.5' />
              {c.rotulo}
            </div>
            <p className={cn('mt-2 text-2xl font-semibold tabular-nums', c.destaque ? 'text-white' : 'text-slate-900')}>
              {fmtInt(c.valor)}
            </p>
            <p className={cn('mt-0.5 text-xs', c.destaque ? 'text-marca-200' : 'text-slate-400')}>{c.nota}</p>
          </div>
        ))}
      </div>

      {t.n > 0 && (
        <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-4'>
          <ListaBarras titulo='Setores' itens={dims.setor} chave='setores' consulta={consulta} />
          <ListaBarras titulo='Ramos' itens={dims.ramo} chave='ramos' consulta={consulta} />
          <ListaBarras titulo='Municípios' itens={dims.municipio} chave='municipios' consulta={consulta} />
          <ListaBarras titulo='Porte' itens={porte} chave='portes' consulta={consulta} limite={3} />
        </div>
      )}
    </div>
  )
}

function ListaBarras({
  titulo,
  itens = [],
  chave,
  consulta,
  limite = 6
}: {
  titulo: string
  itens?: ItemResumo[]
  chave: ChaveFiltro
  consulta: Consulta
  limite?: number
}) {
  const visiveis = itens.slice(0, limite)
  const max = Math.max(1, ...visiveis.map(i => i.n))
  const selecionados = (consulta.filtros[chave] as string[] | undefined) ?? []
  const resto = itens.length - visiveis.length

  return (
    <div className='rounded-xl border border-slate-200 bg-white p-4'>
      <div className='mb-3 flex items-baseline justify-between'>
        <h3 className='text-sm font-semibold text-slate-700'>{titulo}</h3>
        <span className='text-[11px] text-slate-400'>clique para filtrar</span>
      </div>
      <ul className='space-y-1'>
        {visiveis.map(item => {
          const ativo = selecionados.includes(item.chave)
          const filtros = { ...consulta.filtros, [chave]: alternar(selecionados, item.chave) } as Filtros
          return (
            <li key={item.chave}>
              <LinkNav
                href={hrefConsulta({ filtros, ordem: consulta.ordem, por: consulta.por })}
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
                  <span className='shrink-0 tabular-nums text-xs text-slate-500'>{fmtInt(item.n)}</span>
                </span>
              </LinkNav>
            </li>
          )
        })}
      </ul>
      {resto > 0 && <p className='mt-2 px-2 text-xs text-slate-400'>+ {fmtInt(resto)} outros</p>}
    </div>
  )
}

export function ResumoCarregando() {
  return (
    <div className='space-y-4'>
      <div className='grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className='h-[106px] animate-pulse rounded-xl border border-slate-200 bg-white' />
        ))}
      </div>
      <div className='grid gap-3 md:grid-cols-2 2xl:grid-cols-4'>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className='h-56 animate-pulse rounded-xl border border-slate-200 bg-white' />
        ))}
      </div>
    </div>
  )
}
