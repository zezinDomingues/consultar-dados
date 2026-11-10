// Webhook do Instagram (@oficialcert): comentários e directs. Regra única, sem IA no meio:
// quem escreve DIAGNÓSTICO (num comentário ou no direct) recebe a resposta pronta com o link e o WhatsApp.
// O resto fica guardado em instagram_eventos para a equipe responder.
import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { segredoCiclo } from '@/lib/disparos/config'
import { supabaseAdmin } from '@/lib/supabase/admin'

const GRAPH = 'https://graph.facebook.com/v23.0'
const LINK = 'oficialcert.com/diagnostico?origem=instagram'
const WHATS = '(11) 5196-7114'
const PALAVRA = /\bdiagn[oó]stico\b/i

/** Token de verificação do webhook (o que vai no campo "Verificar token" da Meta): derivado do segredo do ciclo. */
export function tokenVerificacao() {
  const s = segredoCiclo()
  return s ? createHmac('sha256', s).update('instagram-webhook-verify').digest('hex').slice(0, 32) : null
}

type Cred = { token: string; userId: string; appSecret: string | null }
async function credenciais(): Promise<Cred | null> {
  const env = { token: process.env.IG_ACCESS_TOKEN?.trim(), userId: process.env.IG_USER_ID?.trim(), appSecret: process.env.IG_APP_SECRET?.trim() }
  if (env.token && env.userId && env.appSecret) return env as Cred
  const { data } = await supabaseAdmin().rpc('instagram_credenciais')
  const l = Array.isArray(data) ? data[0] : data
  const token = env.token || l?.token
  const userId = env.userId || l?.user_id
  return token && userId ? { token, userId, appSecret: env.appSecret || l?.app_secret || null } : null
}

/** Confere o X-Hub-Signature-256 (HMAC do corpo com a chave secreta do app). */
export async function assinaturaValida(corpo: string, cabecalho: string | null) {
  const c = await credenciais()
  if (!c?.appSecret || !cabecalho?.startsWith('sha256=')) return { ok: false, motivo: c?.appSecret ? 'sem assinatura' : 'chave secreta do app não configurada' }
  const esperado = Buffer.from('sha256=' + createHmac('sha256', c.appSecret).update(corpo).digest('hex'))
  const recebido = Buffer.from(cabecalho)
  return { ok: esperado.length === recebido.length && timingSafeEqual(esperado, recebido), motivo: 'assinatura não confere' }
}

async function graph(c: Cred, caminho: string, corpo: Record<string, unknown>) {
  const r = await fetch(`${GRAPH}/${caminho}?access_token=${encodeURIComponent(c.token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(15_000)
  })
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string } }
  if (!r.ok || j.error) throw new Error(`${caminho}: ${j.error?.message ?? `HTTP ${r.status}`}`)
  return j
}

// Resposta no comentário: variações, para não repetir a mesma frase em todo comentário (o Instagram trata como robô)
const RESPOSTAS = [
  (u: string) => `${u}, já está na sua DM! 📩`,
  (u: string) => `Pronto, ${u}! Te mandei tudo na DM 📩`,
  (u: string) => `${u}, confere sua DM: o link do diagnóstico está lá 📩`,
  (u: string) => `Enviado, ${u}! Dá uma olhada no seu direct 📩`,
  (u: string) => `${u}, te chamei na DM com o passo a passo 📩`
]
function respostaPublica(usuario: string | undefined, ref: string) {
  const u = usuario ? `@${usuario}` : 'Oi'
  let h = 0
  for (const ch of ref) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return RESPOSTAS[h % RESPOSTAS.length](u)
}

const textoDm = (nome?: string) =>
  `Oi${nome ? `, ${nome}` : ''}! Aqui é da OficialCert. Para o diagnóstico, é só preencher em 1 minuto: ${LINK}\n` +
  `Se preferir, fale direto no WhatsApp ${WHATS}. Um especialista vai te retornar.`

/** Registra o evento uma vez só (a Meta reenvia). Devolve false se já tinha sido tratado. */
async function registrar(campo: string, ref: string, de: string | undefined, texto: string | undefined, payload: unknown) {
  const { error } = await supabaseAdmin().from('instagram_eventos').insert({ campo, ref, de_usuario: de ?? null, texto: texto ?? null, payload })
  if (error?.code === '23505') return false
  if (error) throw new Error(`instagram_eventos: ${error.message}`)
  return true
}
async function concluir(campo: string, ref: string, acao: string, erro?: string) {
  await supabaseAdmin().from('instagram_eventos').update({ acao, erro: erro ?? null }).eq('campo', campo).eq('ref', ref)
}

type Mudanca = { field?: string; value?: { id?: string; text?: string; from?: { id?: string; username?: string } } }
type Mensagem = { sender?: { id?: string }; recipient?: { id?: string }; message?: { mid?: string; text?: string; is_echo?: boolean } }

export async function tratarWebhook(payload: { entry?: { changes?: Mudanca[]; messaging?: Mensagem[] }[] }) {
  const c = await credenciais()
  if (!c) throw new Error('sem credenciais do Instagram')
  const feitos: string[] = []
  for (const e of payload.entry ?? []) {
    // comentário nos nossos posts
    for (const m of e.changes ?? []) {
      if (m.field !== 'comments' || !m.value?.id) continue
      const v = m.value
      if (v.from?.id === c.userId) continue // nossa própria resposta
      if (!(await registrar('comments', v.id!, v.from?.username, v.text, m))) continue
      if (!PALAVRA.test(v.text ?? '')) {
        await concluir('comments', v.id!, 'guardado para a equipe')
        continue
      }
      try {
        await graph(c, `${v.id}/replies`, { message: respostaPublica(v.from?.username, v.id!) })
        await graph(c, `${c.userId}/messages`, { recipient: { comment_id: v.id }, message: { text: textoDm() } })
        await concluir('comments', v.id!, 'respondido + direct enviado')
        feitos.push(`comentário ${v.id}`)
      } catch (err) {
        await concluir('comments', v.id!, 'falhou', err instanceof Error ? err.message : String(err))
      }
    }
    // directs recebidos
    for (const m of e.messaging ?? []) {
      const mid = m.message?.mid
      if (!mid || m.message?.is_echo || m.sender?.id === c.userId) continue
      if (!(await registrar('messages', mid, m.sender?.id, m.message?.text, m))) continue
      if (!PALAVRA.test(m.message?.text ?? '')) {
        await concluir('messages', mid, 'guardado para a equipe')
        continue
      }
      try {
        await graph(c, `${c.userId}/messages`, { recipient: { id: m.sender!.id }, message: { text: textoDm() } })
        await concluir('messages', mid, 'direct respondido')
        feitos.push(`direct ${mid}`)
      } catch (err) {
        await concluir('messages', mid, 'falhou', err instanceof Error ? err.message : String(err))
      }
    }
  }
  return feitos
}
