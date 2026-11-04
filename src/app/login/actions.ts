'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ROTAS } from '@/lib/rotas'

// O React 19 limpa o formulário depois da ação; devolvemos o e-mail para ele
// continuar preenchido quando a senha está errada.
export type EstadoLogin = { erro?: string; email?: string }

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim()
  const senha = String(form.get('senha') ?? '')
  if (!email || !senha) return { erro: 'Informe e-mail e senha.', email }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) return { erro: 'E-mail ou senha inválidos.', email }

  // Só volta para dentro do dashboard; qualquer outra coisa (vazio, landing, link externo) cai no início dele.
  const next = String(form.get('next') ?? '')
  redirect(next.startsWith(`${ROTAS.dashboard}`) ? next : ROTAS.dashboard)
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(ROTAS.login)
}
