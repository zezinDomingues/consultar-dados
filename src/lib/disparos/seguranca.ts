import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'

/** Comparação em tempo constante (não vaza, pelo tempo de resposta, quantos caracteres do segredo acertaram). */
export function iguais(a: string, b: string) {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

/** Assinatura que o WAHA manda em X-Webhook-Hmac: HMAC-SHA512 do corpo cru, em hexadecimal. */
export const hmacWebhook = (corpo: string, segredo: string) => createHmac('sha512', segredo).update(corpo).digest('hex')

/**
 * Token do webhook de UM número: HMAC-SHA256 de "<uso>:<id>" com a base (43 caracteres, base64url). Quem vê a URL
 * de um número (painel da Z-API, log) não consegue falar em nome de outro número nem chamar o ciclo.
 */
export const tokenWebhookNumero = (numeroId: number, base: string, uso: 'zapi' | 'waha') =>
  createHmac('sha256', base).update(`webhook-${uso}:${numeroId}`).digest('base64url')

/**
 * Evento com carimbo de tempo (ms) velho demais ou no futuro: replay de um aviso antigo. `null` = pode processar.
 * Sem carimbo, processa (o anti-repetição pelo id da mensagem continua valendo).
 */
export function eventoForaDoPrazo(carimbo: unknown, maxIdadeMs: number, agora = Date.now()) {
  const t = typeof carimbo === 'number' ? carimbo : typeof carimbo === 'string' && /^\d+$/.test(carimbo) ? Number(carimbo) : NaN
  if (!Number.isFinite(t) || t <= 0) return null
  const ms = t < 1e12 ? t * 1000 : t // segundos ou milissegundos
  if (ms > agora + 10 * 60_000) return 'carimbo de tempo no futuro'
  if (agora - ms > maxIdadeMs) return `evento de ${Math.round((agora - ms) / 3_600_000)} h atrás`
  return null
}
