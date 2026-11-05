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
