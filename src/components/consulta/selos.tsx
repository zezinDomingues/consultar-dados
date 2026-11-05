import { cn } from '@/lib/utils'

const COR_PRIORIDADE = {
  A: 'bg-ouro-escuro text-white',
  B: 'bg-marca-800 text-white',
  C: 'bg-marca-100 text-marca-900',
  D: 'bg-slate-100 text-slate-500'
} as const

export function SeloPrioridade({ prioridade, score, grande = false }: { prioridade: keyof typeof COR_PRIORIDADE; score?: number; grande?: boolean }) {
  return (
    <span className='inline-flex items-center gap-1.5' title={score != null ? `Prioridade ${prioridade} · score ${score}/100` : undefined}>
      <span
        className={cn(
          'grid place-items-center rounded-full font-serif font-bold',
          grande ? 'size-9 text-base' : 'size-6 text-xs',
          COR_PRIORIDADE[prioridade]
        )}
      >
        {prioridade}
      </span>
      {score != null && <span className={cn('tabular-nums text-slate-400', grande ? 'text-sm' : 'text-xs')}>{score}</span>}
    </span>
  )
}

const COR_SITUACAO: Record<string, string> = {
  'Recente (ECF 2024)': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  'ECF 2023': 'bg-sky-50 text-sky-700 ring-sky-200',
  'Antigo (ECF ≤ 2022)': 'bg-slate-50 text-slate-600 ring-slate-200',
  'Hoje no Simples': 'bg-amber-50 text-amber-700 ring-amber-200'
}

export function SeloSituacao({ situacao }: { situacao: string | null }) {
  if (!situacao) return null
  return (
    <span className={cn('inline-block rounded px-1.5 py-0.5 text-[11px] ring-1 ring-inset', COR_SITUACAO[situacao])}>
      {situacao}
    </span>
  )
}

export const PORTE_CURTO: Record<string, string> = {
  Microempresa: 'ME',
  'Empresa de pequeno porte': 'EPP',
  'Demais (médio/grande)': 'Médio/grande'
}
