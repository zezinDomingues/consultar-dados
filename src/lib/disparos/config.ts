// Variáveis de ambiente e relógio dos disparos (só servidor).
import 'server-only'
import { tokenWebhookNumero } from './seguranca'
import type { ConfigDisparo, Numero } from './tipos'

/** Endereço público da plataforma (links do formulário e webhook). Runtime, não NEXT_PUBLIC_ (que é assado no build). */
export function urlApp() {
  const u = process.env.APP_URL?.trim().replace(/\/+$/, '')
  return u || 'https://www.oficialcert.com'
}

const env = (nome: string) => process.env[nome]?.trim() || null

/**
 * Segredo antigo, único para tudo (ciclo, HMAC do WAHA e token na URL da Z-API). Continua valendo onde a variável
 * própria de cada uso ainda não foi criada — com as variáveis de hoje nada muda.
 */
export function segredoDisparos() {
  return env('DISPAROS_SEGREDO')
}

/** Bearer do pg_cron → /api/sistema/disparos/ciclo. O MESMO valor fica no Vault do Supabase (`disparos_segredo`). */
export const segredoCiclo = () => env('DISPAROS_CICLO_SEGREDO') ?? segredoDisparos()

/** Chave do HMAC que o WAHA assina em X-Webhook-Hmac (e base do token por número de quem configurar sem HMAC). */
export const segredoWaha = () => env('WAHA_WEBHOOK_SEGREDO') ?? segredoDisparos()

/** Base dos tokens do webhook da Z-API: cada número recebe o seu, derivado desta base (HMAC do id). */
export const segredoZapi = () => env('ZAPI_WEBHOOK_SEGREDO') ?? segredoDisparos()

export const linkFormulario = (token: string) => `${urlApp()}/consulta-gratuita/${token}`
export const urlWebhook = (numeroId: number) => `${urlApp()}/api/sistema/whatsapp?n=${numeroId}`

/**
 * Webhook da Z-API de UM número. A Z-API não assina o webhook, então o token vai na URL (painel da Z-API, logs):
 * por isso é próprio do número — o vazamento de um não abre os outros nem o ciclo.
 */
export function urlWebhookZapi(numeroId: number) {
  const base = segredoZapi()
  if (!base) throw new Error('ZAPI_WEBHOOK_SEGREDO (ou DISPAROS_SEGREDO) não configurado.')
  return `${urlApp()}/api/sistema/zapi?n=${numeroId}&token=${tokenWebhookNumero(numeroId, base, 'zapi')}`
}

/** O que falta configurar no servidor para os disparos funcionarem. */
export function pendenciasServidor() {
  const faltam: string[] = []
  if (!process.env.SUPABASE_SECRET_KEY) faltam.push('SUPABASE_SECRET_KEY')
  if (!segredoCiclo() || !segredoZapi() || !segredoWaha()) faltam.push('DISPAROS_SEGREDO')
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
