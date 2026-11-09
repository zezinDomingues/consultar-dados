// Variáveis de ambiente e relógio dos disparos (só servidor).
import 'server-only'
import type { ConfigDisparo, Numero } from './tipos'

/** Endereço público da plataforma (links do formulário e webhook). Runtime, não NEXT_PUBLIC_ (que é assado no build). */
export function urlApp() {
  const u = process.env.APP_URL?.trim().replace(/\/+$/, '')
  return u || 'https://www.oficialcert.com'
}

/** Segredo do ciclo (Bearer do pg_cron) e chave do HMAC do webhook do WAHA. */
export function segredoDisparos() {
  return process.env.DISPAROS_SEGREDO?.trim() || null
}

export const linkFormulario = (token: string) => `${urlApp()}/consulta-gratuita/${token}`
export const urlWebhook = (numeroId: number) => `${urlApp()}/api/sistema/whatsapp?n=${numeroId}`

/** O que falta configurar no servidor para os disparos funcionarem. */
export function pendenciasServidor() {
  const faltam: string[] = []
  if (!process.env.SUPABASE_SECRET_KEY) faltam.push('SUPABASE_SECRET_KEY')
  if (!segredoDisparos()) faltam.push('DISPAROS_SEGREDO')
  return faltam
}

/** Hora, minuto e dia da semana ISO (1 = segunda) em Brasília. */
export function agoraBrasilia(agora = new Date()) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
    hourCycle: 'h23'
  }).formatToParts(agora)
  const v = (t: string) => partes.find(p => p.type === t)?.value ?? ''
  const dias: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { hora: Number(v('hour')), minuto: Number(v('minute')), dia: dias[v('weekday')] ?? 1 }
}

/** Meia-noite de hoje em Brasília, em ISO (para contar os envios do dia). Brasil sem horário de verão desde 2019. */
export function inicioDoDiaBrasilia(agora = new Date()) {
  const data = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora) // AAAA-MM-DD
  return new Date(`${data}T00:00:00-03:00`).toISOString()
}

export function dentroDaJanela(cfg: Pick<ConfigDisparo, 'hora_inicio' | 'hora_fim' | 'dias_semana' | 'pausado'>, agora = new Date()) {
  if (cfg.pausado) return { ok: false, motivo: 'disparos pausados nas regras' }
  const { hora, dia } = agoraBrasilia(agora)
  if (!cfg.dias_semana.includes(dia)) return { ok: false, motivo: 'fora dos dias de envio' }
  if (hora < cfg.hora_inicio || hora >= cfg.hora_fim) return { ok: false, motivo: 'fora do horário de envio' }
  return { ok: true, motivo: null }
}

/**
 * Quantos disparos por dia os números conseguem: o menor entre o limite diário e o que cabe na janela de envio
 * com o intervalo médio sorteado (+ ~20 s de verificação e "digitando…" por envio).
 */
export function capacidadeDiaria(
  numeros: Pick<Numero, 'ativo' | 'limite_diario' | 'intervalo_min_s' | 'intervalo_max_s'>[],
  cfg: Pick<ConfigDisparo, 'hora_inicio' | 'hora_fim'>
) {
  const janela = Math.max(0, cfg.hora_fim - cfg.hora_inicio) * 3600
  return numeros
    .filter(n => n.ativo)
    .reduce((s, n) => s + Math.min(n.limite_diario, Math.floor(janela / ((n.intervalo_min_s + n.intervalo_max_s) / 2 + 20))), 0)
}
