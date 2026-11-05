// Cliente com a chave SECRETA (service_role), só no servidor. Ignora o RLS: usar apenas onde não há usuário
// logado e o próprio código decide o acesso — ciclo de disparos (Bearer), webhook do WAHA (HMAC) e formulário
// público (token do link). Nunca importar em componente de cliente.
import 'server-only'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let cliente: SupabaseClient | null = null

export function temChaveSecreta() {
  return !!process.env.SUPABASE_SECRET_KEY
}

export function supabaseAdmin(): SupabaseClient {
  const chave = process.env.SUPABASE_SECRET_KEY
  if (!chave) throw new Error('SUPABASE_SECRET_KEY não está configurada no servidor.')
  cliente ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  return cliente
}
