import { cn } from '@/lib/utils'

// A: letra marinho no dourado (6:1); branco no dourado ficava em 3,1:1
const COR_PRIORIDADE = {
  A: 'bg-ouro-escuro text-marca-950',
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
      {score != null && <span className={cn('tabular-nums text-slate-500', grande ? 'text-sm' : 'text-xs')}>{score}</span>}
    </span>
  )
}

// paleta da marca: o mais recente em dourado, o ano anterior em marinho, o antigo neutro, Simples em âmbar (atenção)
const COR_SITUACAO: Record<string, string> = {
  'Recente (ECF 2024)': 'bg-ouro/15 text-ouro-texto ring-ouro/50',
  'ECF 2023': 'bg-marca-50 text-marca-800 ring-marca-200',
  'Antigo (ECF ≤ 2022)': 'bg-slate-50 text-slate-600 ring-slate-200',
  'Hoje no Simples': 'bg-amber-50 text-amber-800 ring-amber-200'
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
  'Médio porte': 'Médio',
  'Grande porte': 'Grande',
  'Demais (médio/grande)': 'Médio/grande'
}
