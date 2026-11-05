import { COR_STATUS, ROTULO_STATUS, type StatusCampanha, type StatusDisparo } from '@/lib/disparos/tipos'
import { cn } from '@/lib/utils'

export function SeloStatus({ status, className }: { status: StatusDisparo; className?: string }) {
  return (
    <span className={cn('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold', COR_STATUS[status], className)}>
      {ROTULO_STATUS[status]}
    </span>
  )
}

const CAMPANHA: Record<StatusCampanha, { rotulo: string; cor: string; ponto: string }> = {
  ativa: { rotulo: 'Ativa', cor: 'bg-emerald-50 text-emerald-800', ponto: 'bg-emerald-500 animate-pulse' },
  pausada: { rotulo: 'Pausada', cor: 'bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  concluida: { rotulo: 'Concluída', cor: 'bg-slate-100 text-slate-600', ponto: 'bg-slate-400' }
}

export function SeloCampanha({ status }: { status: StatusCampanha }) {
  const s = CAMPANHA[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', s.cor)}>
      <span className={cn('size-1.5 rounded-full', s.ponto)} />
      {s.rotulo}
    </span>
  )
}

/** Estado da sessão do WAHA. */
export function SeloSessao({ status }: { status: string | null }) {
  const ok = status === 'WORKING'
  const rotulo = !status ? 'Não testado' : ok ? 'Conectado' : status === 'SCAN_QR_CODE' ? 'Aguardando pareamento' : status === 'ERRO' ? 'Inacessível' : status
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        ok ? 'bg-emerald-50 text-emerald-800' : !status ? 'bg-slate-100 text-slate-600' : 'bg-red-50 text-red-700'
      )}
    >
      <span className={cn('size-1.5 rounded-full', ok ? 'bg-emerald-500' : !status ? 'bg-slate-400' : 'bg-red-500')} />
      {rotulo}
    </span>
  )
}
