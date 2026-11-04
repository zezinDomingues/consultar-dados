'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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

  const next = String(form.get('next') ?? '/')
  redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/')
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
