'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { ipDoCliente, chaveDeLimite } from '@/lib/ip-cliente'
import { createClient } from '@/lib/supabase/server'
import { ROTAS } from '@/lib/rotas'
import { chavesDoLogin, esperaDoLogin, registrarFalha, registrarSucesso, tempoPorExtenso } from './bloqueio'

// O React 19 limpa o formulário depois da ação; devolvemos o e-mail para ele
// continuar preenchido quando a senha está errada.
export type EstadoLogin = { erro?: string; email?: string }

const INVALIDO = 'E-mail ou senha inválidos.'

/** Só volta para dentro do dashboard; qualquer outra coisa (vazio, landing, outro site, "..") cai no início dele. */
function destino(next: string) {
  if (!next.startsWith('/') || next.startsWith('//') || /[\\\s]/.test(next)) return ROTAS.dashboard
  try {
    const u = new URL(next, 'http://interno')
    if (u.origin === 'http://interno' && (u.pathname === ROTAS.dashboard || u.pathname.startsWith(`${ROTAS.dashboard}/`))) {
      return u.pathname + u.search + u.hash
    }
  } catch {}
  return ROTAS.dashboard
}

export async function entrar(_anterior: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '').trim().slice(0, 254)
  const senha = String(form.get('senha') ?? '')
  if (!email || !senha) return { erro: 'Informe e-mail e senha.', email }

  // bloqueio próprio (022): a mesma resposta para e-mail que existe e que não existe
  const chaves = chavesDoLogin(email, chaveDeLimite(ipDoCliente(await headers())))
  const espera = await esperaDoLogin(chaves)
  if (espera > 0) {
    return { erro: `Muitas tentativas com senha errada. Por segurança, aguarde ${tempoPorExtenso(espera)} e tente de novo.`, email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
  if (error) {
    // limite do próprio Supabase: não é senha errada, não conta como falha
    if (error.status === 429 || error.code === 'over_request_rate_limit') {
      return { erro: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.', email }
    }
    // Supabase fora do ar / sem rede: dizer "senha inválida" faria a pessoa duvidar da senha certa
    if (!error.status || error.status >= 500) {
      console.error('[login]', error.status, error.code, error.message)
      return { erro: 'Não foi possível entrar agora. Tente de novo em instantes.', email }
    }
    const novaEspera = await registrarFalha(chaves)
    if (novaEspera > 0) {
      return { erro: `${INVALIDO} Por segurança, aguarde ${tempoPorExtenso(novaEspera)} para tentar de novo.`, email }
    }
    return { erro: INVALIDO, email }
  }

  await registrarSucesso(chaves)
  redirect(destino(String(form.get('next') ?? '')))
}

export async function sair() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect(ROTAS.login)
}
