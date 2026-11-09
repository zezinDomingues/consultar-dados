// Bloqueio progressivo do login (migração 022): conta as senhas erradas por e-mail+IP (e, com folga maior, só
// por IP, contra quem testa muitos e-mails) e manda esperar 30 s, 1 min, 2 min… até 15 min. Vale igual para
// e-mail que existe e que não existe, então não revela nada. Sem a 022 aplicada (ou sem a chave secreta), não
// bloqueia e o login segue normal — sobra o limite do próprio Supabase.
import 'server-only'
import { createHash } from 'node:crypto'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

/** Falhas seguidas (sem 30 min de pausa) antes da 1ª espera. */
export const LIMITE_EMAIL_IP = 5
export const LIMITE_IP = 30

type Chave = { chave: string; limite: number }

const hash = (t: string) => createHash('sha256').update(t).digest('hex')

/** Chaves guardadas no banco: só hashes, nunca o e-mail em claro. */
export function chavesDoLogin(email: string, ip: string): Chave[] {
  return [
    { chave: `ei:${hash(`${email.trim().toLowerCase()}|${ip}`)}`, limite: LIMITE_EMAIL_IP },
    { chave: `ip:${hash(ip)}`, limite: LIMITE_IP }
  ]
}

/** "30 segundos", "2 minutos" */
export function tempoPorExtenso(segundos: number) {
  if (segundos < 60) return `${segundos} segundos`
  const min = Math.ceil(segundos / 60)
  return min === 1 ? '1 minuto' : `${min} minutos`
}

let avisou = false
/** Falha do banco (022 não aplicada, rede, tempo) nunca derruba o login: segue sem o bloqueio próprio. */
async function chamar(fn: string, args: Record<string, unknown>): Promise<number> {
  if (!temChaveSecreta()) return 0
  try {
    const { data, error } = await supabaseAdmin().rpc(fn, args).abortSignal(AbortSignal.timeout(3000))
    if (error) throw new Error(`${error.code} ${error.message}`)
    return Math.max(0, Math.ceil(Number(data) || 0))
  } catch (e) {
    if (!avisou) console.error('[login] bloqueio próprio indisponível (migração 022 aplicada?):', String(e))
    avisou = true
    return 0
  }
}

/** Segundos que ainda faltam para poder tentar (0 = pode). */
export const esperaDoLogin = (chaves: Chave[]) => chamar('login_espera', { chaves: chaves.map(c => c.chave) })

/** Registra a senha errada em cada chave; devolve a maior espera que começou agora. */
export async function registrarFalha(chaves: Chave[]) {
  const esperas = await Promise.all(chaves.map(c => chamar('login_falhou', { chave: c.chave, limite: c.limite })))
  return Math.max(0, ...esperas)
}

/** Entrou: zera a contagem do e-mail+IP (a do IP sozinho só expira com o tempo). */
export async function registrarSucesso(chaves: Chave[]) {
  await chamar('login_sucesso', { chave: chaves[0].chave })
}
