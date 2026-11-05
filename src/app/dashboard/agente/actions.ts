'use server'

// Histórico de conversas do agente (tabela agente_conversas, RLS: cada usuário só vê as próprias).
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

export type ResumoConversa = { id: string; titulo: string; atualizada_em: string }

const Id = z.string().uuid()
const LIMITE_TURNOS_BYTES = 1_500_000 // conversas enormes: guarda só o fim

export async function listarConversas(): Promise<ResumoConversa[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agente_conversas')
    .select('id, titulo, atualizada_em')
    .order('atualizada_em', { ascending: false })
    .limit(100)
  if (error) throw new Error('Não foi possível carregar o histórico.')
  return data ?? []
}

export async function abrirConversa(id: string): Promise<{ id: string; titulo: string; turnos: unknown[] } | null> {
  if (!Id.safeParse(id).success) return null
  const supabase = await createClient()
  const { data } = await supabase.from('agente_conversas').select('id, titulo, turnos').eq('id', id).maybeSingle()
  return data ? { id: data.id, titulo: data.titulo, turnos: Array.isArray(data.turnos) ? data.turnos : [] } : null
}

/** Cria (sem id) ou atualiza a conversa. Devolve o id. */
export async function salvarConversa(id: string | null, titulo: string, turnos: unknown[]): Promise<string> {
  const supabase = await createClient()
  let lista = turnos
  while (lista.length > 2 && JSON.stringify(lista).length > LIMITE_TURNOS_BYTES) lista = lista.slice(2)
  const t = titulo.replace(/\s+/g, ' ').trim().slice(0, 120) || 'Conversa'
  if (id && Id.safeParse(id).success) {
    const { data, error } = await supabase
      .from('agente_conversas')
      .update({ turnos: lista, atualizada_em: new Date().toISOString() })
      .eq('id', id)
      .select('id')
      .maybeSingle()
    if (!error && data) return data.id
  }
  const { data, error } = await supabase.from('agente_conversas').insert({ titulo: t, turnos: lista }).select('id').single()
  if (error || !data) throw new Error('Não foi possível salvar a conversa.')
  return data.id
}

export async function apagarConversa(id: string): Promise<void> {
  if (!Id.safeParse(id).success) return
  const supabase = await createClient()
  await supabase.from('agente_conversas').delete().eq('id', id)
}
