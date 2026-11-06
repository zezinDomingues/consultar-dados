// Calendário de reuniões da equipe interna (só servidor). O RLS do banco decide quem vê e quem edita.
import 'server-only'
import { createClient } from '@/lib/supabase/server'

export type Reuniao = {
  id: number
  titulo: string
  inicio: string
  fim: string
  descricao: string | null
  local: string | null
  cnpj: string | null
  disparo_id: number | null
  grupo_id: number
  criado_por: string
  criado_em: string
}

export type Pessoa = { user_id: string; nome: string; email: string; papel: string }

/** Cores fixas por pessoa (mesma pessoa = mesma cor no mês inteiro). */
export const CORES = [
  'bg-marca-700 text-white',
  'bg-amber-500 text-marca-950',
  'bg-emerald-600 text-white',
  'bg-rose-600 text-white',
  'bg-sky-600 text-white',
  'bg-violet-600 text-white',
  'bg-orange-600 text-white',
  'bg-teal-700 text-white'
]

export async function reunioesEntre(inicioIso: string, fimIso: string, grupo?: number) {
  const supabase = await createClient()
  let q = supabase.from('reunioes').select('*')
  if (grupo) q = q.eq('grupo_id', grupo)
  const { data, error } = await q
    .lt('inicio', fimIso)
    .gt('fim', inicioIso)
    .order('inicio')
    .limit(1000)
  if (error) throw new Error(`reuniões: ${error.message}`)
  return (data ?? []) as Reuniao[]
}

export async function proximasReunioes(limite = 12, grupo?: number) {
  const supabase = await createClient()
  let q = supabase.from('reunioes').select('*').gte('fim', new Date().toISOString())
  if (grupo) q = q.eq('grupo_id', grupo)
  const { data } = await q.order('inicio').limit(limite)
  return (data ?? []) as Reuniao[]
}

export async function pessoasEquipe() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('pessoas_dos_meus_grupos')
  return (data ?? []) as Pessoa[]
}

/** Grupos cujo calendário a pessoa vê: o admin vê todos; os demais, só os grupos de que fazem parte. */
export async function meusGruposCalendario(admin: boolean, userId: string) {
  const supabase = await createClient()
  const { data: grupos } = await supabase.from('disparo_grupos').select('id, nome').order('id')
  if (admin) return (grupos ?? []) as { id: number; nome: string }[]
  const { data: membro } = await supabase.from('grupo_membros').select('grupo_id').eq('user_id', userId)
  const meus = new Set(((membro ?? []) as { grupo_id: number }[]).map(m => m.grupo_id))
  return ((grupos ?? []) as { id: number; nome: string }[]).filter(g => meus.has(g.id))
}
