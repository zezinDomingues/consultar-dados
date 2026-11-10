import { FlaskConical } from 'lucide-react'
import { ROTULO_STATUS, type StatusCampanha, type StatusDisparo } from '@/lib/disparos/tipos'
import { cn } from '@/lib/utils'

/**
 * Cor do selo de cada situação, na paleta da marca: positivo = marinho/dourado, atenção = âmbar, erro = vermelho,
 * neutro = creme/tinta.
 */
const COR_SELO: Record<StatusDisparo, string> = {
  reservado: 'bg-slate-100 text-slate-600',
  enviado: 'bg-marca-50 text-marca-800',
  sem_whatsapp: 'bg-slate-100 text-slate-600',
  falhou: 'bg-red-50 text-red-700',
  interessado: 'bg-amber-50 text-amber-800',
  preencheu: 'bg-ouro/15 text-ouro-texto ring-1 ring-inset ring-ouro/50',
  sem_interesse: 'bg-slate-100 text-slate-600',
  respondeu: 'bg-marca-800 text-creme',
  descadastrado: 'bg-red-50 text-red-700'
}

export function SeloStatus({ status, className }: { status: StatusDisparo; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold',
        COR_SELO[status],
        className
      )}
    >
      {ROTULO_STATUS[status]}
    </span>
  )
}

/** Conversa de teste (fora do funil): neutro, tracejado, com o mesmo ícone do "Enviar teste". */
export function SeloTeste({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-slate-400 bg-white px-1.5 text-[10px] font-semibold text-slate-600',
        className
      )}
    >
      <FlaskConical className='size-3' aria-hidden /> teste
    </span>
  )
}

const CAMPANHA: Record<StatusCampanha, { rotulo: string; cor: string; ponto: string }> = {
  ativa: { rotulo: 'Ativa', cor: 'bg-marca-800 text-creme', ponto: 'bg-ouro animate-pulse' },
  pausada: { rotulo: 'Pausada', cor: 'bg-amber-50 text-amber-800', ponto: 'bg-amber-500' },
  concluida: { rotulo: 'Concluída', cor: 'bg-slate-100 text-slate-600', ponto: 'bg-slate-400' }
}

export function SeloCampanha({ status }: { status: StatusCampanha }) {
  const s = CAMPANHA[status]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', s.cor)}>
      <span className={cn('size-1.5 rounded-full', s.ponto)} aria-hidden />
      {s.rotulo}
    </span>
  )
}

/** Estados da sessão (Z-API e WAHA) em português: a tela nunca mostra o código cru (STOPPED, SCAN_QR_CODE…). */
const SESSAO: Record<string, string> = {
  WORKING: 'Conectado',
  DESCONECTADO: 'Desconectado',
  SCAN_QR_CODE: 'Aguardando o QR code',
  STARTING: 'Iniciando',
  STOPPED: 'Parado',
  FAILED: 'Com falha',
  ERRO: 'Inacessível'
}

export function rotuloSessao(status: string | null) {
  if (!status) return 'Não testado'
  return SESSAO[status] ?? 'Estado desconhecido'
}

/** Estado da sessão do número de WhatsApp. */
export function SeloSessao({ status }: { status: string | null }) {
  const ok = status === 'WORKING'
  const transitorio = status === 'STARTING' || status === 'SCAN_QR_CODE'
  return (
    <span
      title={status && !SESSAO[status] ? status : undefined}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        ok
          ? 'bg-marca-50 text-marca-800 ring-1 ring-inset ring-marca-200'
          : !status
            ? 'bg-slate-100 text-slate-600'
            : transitorio
              ? 'bg-amber-50 text-amber-800'
              : 'bg-red-50 text-red-700'
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          ok ? 'bg-ouro-escuro' : !status ? 'bg-slate-400' : transitorio ? 'bg-amber-500' : 'bg-red-500'
        )}
        aria-hidden
      />
      {rotuloSessao(status)}
    </span>
  )
}
