// Limite de uso do agente por pessoa (SEC-10/BE-20): cada pergunta custa cota dos provedores de IA e consultas
// pesadas ao banco. Fica no banco (agente_consumir, migração 019) para valer em todas as instâncias da Vercel;
// sem a migração aplicada (ou com o banco fora), cai num limite em memória desta instância — pior, mas não deixa
// a porta aberta.
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export const LIMITE_MINUTO = Number(process.env.AGENTE_LIMITE_MINUTO) || 8
export const LIMITE_DIA = Number(process.env.AGENTE_LIMITE_DIA) || 200

export type Consumo = { ok: true } | { ok: false; motivo: 'minuto' | 'dia' | 'sem_acesso'; espera: number }

const memoria = new Map<string, number[]>()

function emMemoria(userId: string): Consumo {
  const agora = Date.now()
  const lista = (memoria.get(userId) ?? []).filter(t => agora - t < 86_400_000)
  const noMinuto = lista.filter(t => agora - t < 60_000)
  if (lista.length >= LIMITE_DIA) return { ok: false, motivo: 'dia', espera: Math.ceil((lista[0] + 86_400_000 - agora) / 1000) }
  if (noMinuto.length >= LIMITE_MINUTO) return { ok: false, motivo: 'minuto', espera: Math.ceil((noMinuto[0] + 60_000 - agora) / 1000) }
  lista.push(agora)
  memoria.set(userId, lista)
  if (memoria.size > 1000) memoria.delete(memoria.keys().next().value!)
  return { ok: true }
}

type Resposta = { ok: boolean; motivo?: 'minuto' | 'dia' | 'sem_acesso'; espera_s?: number }

/** Conta uma pergunta de quem está logado. */
export async function consumirPergunta(userId: string): Promise<Consumo> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.rpc('agente_consumir', { p_max_minuto: LIMITE_MINUTO, p_max_dia: LIMITE_DIA })
    if (!error && data && typeof data === 'object') {
      const r = data as Resposta
      return r.ok ? { ok: true } : { ok: false, motivo: r.motivo ?? 'minuto', espera: Math.max(1, Number(r.espera_s) || 60) }
    }
    if (error) console.warn('[agente] limite no banco indisponível, usando o da memória:', error.code, error.message)
  } catch (e) {
    console.warn('[agente] limite no banco indisponível, usando o da memória:', (e as Error).message)
  }
  return emMemoria(userId)
}
