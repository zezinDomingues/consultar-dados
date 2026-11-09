// IP do visitante para os limites de uso das superfícies públicas (formulário do site e login).
import 'server-only'
import { isIP } from 'node:net'

/** Balde comum de quem chega sem IP reconhecível: o limite vale para todos esses juntos, nunca "sem limite". */
export const SEM_IP = 'sem-ip'

/**
 * Na Vercel, x-vercel-forwarded-for e x-real-ip são gravados pela borda (o valor mandado pelo cliente é
 * descartado). O x-forwarded-for só entra em último caso, e só o PRIMEIRO valor (o resto é a cadeia de proxies).
 * Nunca devolve vazio: sem IP válido, cai em SEM_IP.
 */
export function ipDoCliente(h: Headers): string {
  for (const nome of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const ip = limpar(h.get(nome)?.split(',')[0])
    if (ip) return ip
  }
  return SEM_IP
}

/**
 * Chave do limite: o IPv4 inteiro; no IPv6, o prefixo /64 (a operadora entrega um /64 por cliente, então trocar
 * os últimos 64 bits não pode virar um balde novo a cada envio).
 */
export function chaveDeLimite(ip: string): string {
  if (isIP(ip) !== 6) return ip
  const [esq, dir = ''] = ip.split('::')
  const a = esq ? esq.split(':') : []
  const b = ip.includes('::') && dir ? dir.split(':') : []
  const grupos = ip.includes('::') ? [...a, ...Array(8 - a.length - b.length).fill('0'), ...b] : a
  return `${grupos.slice(0, 4).map(g => (parseInt(g, 16) || 0).toString(16)).join(':')}::/64`
}

function limpar(v: string | undefined) {
  let ip = (v ?? '').trim().toLowerCase()
  ip = ip.replace(/^\[([^\]]+)\](?::\d+)?$/, '$1') // [2804::1]:443
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, '') // 1.2.3.4:5678
  if (ip.startsWith('::ffff:') && isIP(ip.slice(7)) === 4) ip = ip.slice(7)
  ip = ip.replace(/%.*$/, '') // zona do IPv6 (fe80::1%eth0)
  return ip.length <= 45 && isIP(ip) ? ip : ''
}
