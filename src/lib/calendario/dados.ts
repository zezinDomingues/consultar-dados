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

export async function reunioesEntre(inicioIso: string, fimIso: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('reunioes')
    .select('*')
    .lt('inicio', fimIso)
    .gt('fim', inicioIso)
    .order('inicio')
    .limit(1000)
  if (error) throw new Error(`reuniões: ${error.message}`)
  return (data ?? []) as Reuniao[]
}

export async function proximasReunioes(limite = 12) {
  const supabase = await createClient()
  const { data } = await supabase.from('reunioes').select('*').gte('fim', new Date().toISOString()).order('inicio').limit(limite)
  return (data ?? []) as Reuniao[]
}

export async function pessoasEquipe() {
  const supabase = await createClient()
  const { data } = await supabase.rpc('pessoas_equipe')
  return (data ?? []) as Pessoa[]
}
