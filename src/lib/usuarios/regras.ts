// Regras de cadastro de usuários (só servidor, depois de exigirAdmin()). Lê com a chave secreta.
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'

export { dataValida } from '@/lib/calendario/datas'

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** "AAAA-MM-DD" de hoje em Brasília (UTC-3, sem horário de verão). */
export const hojeBrasilia = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)

/** Login (Auth) com esse e-mail, ou null. O Auth não filtra por e-mail na API de admin: percorre as páginas. */
export async function acharLogin(email: string): Promise<{ id: string; criadoEm: string } | null> {
  const alvo = email.trim().toLowerCase()
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(`logins: ${error.message}`)
    const achado = data.users.find(u => u.email?.toLowerCase() === alvo)
    if (achado) return { id: achado.id, criadoEm: achado.created_at }
    if (data.users.length < 200) return null
  }
  return null
}

/** Admins ativos (sem contar `exceto`). */
export async function contarAdminsAtivos(exceto?: string) {
  let q = supabaseAdmin().from('app_usuarios').select('user_id', { count: 'exact', head: true }).eq('papel', 'admin').eq('ativo', true)
  if (exceto) q = q.neq('user_id', exceto)
  const { count, error } = await q
  if (error) throw new Error(`admins: ${error.message}`)
  return count ?? 0
}
