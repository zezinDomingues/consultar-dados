// Cliente do WAHA (WhatsApp HTTP API) para os disparos. Cada número é uma sessão (no tier CORE, uma instância
// por número), com URL, nome de sessão e API key próprios — por isso tudo recebe o `canal`.
//
// Lições do WAHA NOWEB que já custaram caro no SmartRanch (src/lib/waha.ts de lá):
// - o envio NÃO devolve `id` no topo: devolve `{ key: { id } }` cru do Baileys → `chaveMensagem` aceita os dois;
// - conversa direta pode chegar endereçada por LID (`123@lid`), que não é telefone: o número real vem em
//   `_data.key.remoteJidAlt` ou sai de `/api/{sessão}/lids/{lid}` (este exige o store do NOWEB ligado);
// - com LID o voto da enquete às vezes chega ilegível (`poll.vote.failed`, sem a opção) → o webhook pede "SIM".
import 'server-only'

export type Canal = { url: string; sessao: string; apiKey: string | null }

/** `enviado: 'talvez'` = a requisição pode ter chegado ao WhatsApp (timeout/conexão caída no meio). */
export class ErroWaha extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly enviado: 'nao' | 'talvez' = 'nao'
  ) {
    super(message)
  }
}

// Falhas da fase de CONEXÃO: a requisição nem saiu daqui.
const ERROS_DE_CONEXAO = new Set([
  'ECONNREFUSED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'UND_ERR_CONNECT_TIMEOUT',
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'ERR_TLS_CERT_ALTNAME_INVALID'
])

async function chamar<T>(canal: Canal, metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown, timeoutMs = 20_000): Promise<T> {
  const url = canal.url.replace(/\/+$/, '') + caminho
  let res: Response
  try {
    res = await fetch(url, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(canal.apiKey ? { 'X-Api-Key': canal.apiKey } : {})
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    })
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    const codigo = err.cause?.code ?? ''
    // Não conectou = com certeza não saiu. Timeout ou queda no meio = pode ter saído.
    const certo = ERROS_DE_CONEXAO.has(codigo)
    throw new ErroWaha(`WAHA inacessível (${codigo || err.name}): ${err.message}`, undefined, certo ? 'nao' : 'talvez')
  }
  const texto = await res.text()
  if (!res.ok) throw new ErroWaha(`WAHA ${res.status}: ${texto.slice(0, 300) || res.statusText}`, res.status)
  if (!texto) return null as T
  try {
    return JSON.parse(texto) as T
  } catch {
    return texto as T
  }
}

const sessao = (canal: Canal) => encodeURIComponent(canal.sessao)

export type SessaoWaha = {
  name: string
  status: string
  me?: { id?: string; pushName?: string } | null
  config?: Record<string, unknown> | null
}

export const lerSessao = (canal: Canal) => chamar<SessaoWaha>(canal, 'GET', `/api/sessions/${sessao(canal)}`, undefined, 10_000)

/** Telefone (DDD + número, sem 55) → existe no WhatsApp? Devolve o chatId certo (com ou sem o 9). */
export async function verificarNumero(canal: Canal, telefone: string) {
  const r = await chamar<{ numberExists?: boolean; chatId?: string }>(
    canal,
    'GET',
    `/api/contacts/check-exists?phone=55${telefone}&session=${sessao(canal)}`,
    undefined,
    15_000
  )
  return { existe: !!r?.numberExists, chatId: r?.chatId ?? null }
}

/** Fim do id serializado (`true_5511…@c.us_3EB0…` → `3EB0…`) ou `key.id` do NOWEB. É o que os eventos repetem. */
export function chaveMensagem(resposta: unknown): string | null {
  if (!resposta || typeof resposta !== 'object') return typeof resposta === 'string' ? chaveDoId(resposta) : null
  const r = resposta as { id?: unknown; key?: { id?: string } }
  if (typeof r.id === 'string') return chaveDoId(r.id)
  const serial = (r.id as { _serialized?: string } | null)?._serialized
  if (serial) return chaveDoId(serial)
  return r.key?.id ?? null
}

export const chaveDoId = (id: string | null | undefined) => (id ? (id.split('_').pop() ?? id) : null)

const espera = (ms: number) => new Promise(r => setTimeout(r, ms))

/** "digitando…" por alguns segundos antes de mandar — como uma pessoa faria. Falha aqui não impede o envio. */
export async function digitar(canal: Canal, chatId: string, ms: number) {
  try {
    await chamar(canal, 'POST', '/api/startTyping', { session: canal.sessao, chatId }, 8_000)
    await espera(ms)
    await chamar(canal, 'POST', '/api/stopTyping', { session: canal.sessao, chatId }, 8_000)
  } catch {
    await espera(Math.min(ms, 1500))
  }
}

export async function marcarVisto(canal: Canal, chatId: string) {
  try {
    await chamar(canal, 'POST', '/api/sendSeen', { session: canal.sessao, chatId }, 8_000)
  } catch {
    // só cortesia
  }
}

export async function enviarTexto(canal: Canal, chatId: string, texto: string) {
  const r = await chamar<unknown>(canal, 'POST', '/api/sendText', { session: canal.sessao, chatId, text: texto, linkPreview: true }, 30_000)
  return chaveMensagem(r)
}

export async function enviarEnquete(canal: Canal, chatId: string, pergunta: string, opcoes: string[]) {
  const r = await chamar<unknown>(
    canal,
    'POST',
    '/api/sendPoll',
    { session: canal.sessao, chatId, poll: { name: pergunta, options: opcoes, multipleAnswers: false } },
    30_000
  )
  return chaveMensagem(r)
}

export type Botao = { tipo: 'resposta'; texto: string } | { tipo: 'link'; texto: string; url: string }
export type MensagemRica = { imagem?: string | null; texto: string; rodape?: string | null; botoes?: Botao[] }

const arquivo = (url: string) => ({
  url,
  mimetype: /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg',
  filename: /\.png(\?|$)/i.test(url) ? 'oficialcert.png' : 'oficialcert.jpg'
})

/** Imagem com legenda (o WAHA baixa a imagem pela URL — ela precisa ser pública). */
export async function enviarImagem(canal: Canal, chatId: string, url: string, legenda: string) {
  const r = await chamar<unknown>(canal, 'POST', '/api/sendImage', { session: canal.sessao, chatId, file: arquivo(url), caption: legenda }, 45_000)
  return chaveMensagem(r)
}

/**
 * Mensagem com botões (até 3): de RESPOSTA (o toque volta como mensagem com o texto do botão) ou de LINK (abre a
 * URL). Imagem opcional no topo. ATENÇÃO: o WAHA aceita (201) mesmo quando o aparelho não desenha os botões — só o
 * celular confirma; por isso a campanha tem o formato "texto" como alternativa.
 */
export async function enviarBotoes(canal: Canal, chatId: string, m: MensagemRica) {
  const r = await chamar<unknown>(
    canal,
    'POST',
    '/api/sendButtons',
    {
      session: canal.sessao,
      chatId,
      body: m.texto,
      ...(m.rodape ? { footer: m.rodape } : {}),
      ...(m.imagem ? { headerImage: arquivo(m.imagem) } : {}),
      buttons: (m.botoes ?? []).slice(0, 3).map(b => (b.tipo === 'link' ? { type: 'url', text: b.texto, url: b.url } : { type: 'reply', text: b.texto }))
    },
    45_000
  )
  return chaveMensagem(r)
}

/** `123@lid` → `5511999999999` (com 55). Só funciona com o store do NOWEB ligado. */
export async function telefoneDoLid(canal: Canal, lid: string) {
  try {
    const chave = lid.replace(/@.*$/, '')
    const r = await chamar<{ pn?: string }>(canal, 'GET', `/api/${sessao(canal)}/lids/${encodeURIComponent(`${chave}@lid`)}`, undefined, 10_000)
    return r?.pn ? r.pn.replace(/@.*$/, '') : null
  } catch {
    return null
  }
}

/** Eventos que a plataforma precisa. */
export const EVENTOS_WEBHOOK = ['message', 'poll.vote', 'poll.vote.failed', 'message.ack', 'session.status'] as const

/**
 * Aponta o webhook da sessão para a plataforma (com HMAC) e liga o store do NOWEB (tradução de LID).
 * Mantém outros webhooks que já existirem para outros destinos. ATENÇÃO: o WAHA reinicia a sessão ao trocar a
 * configuração — ela volta a WORKING em ~20 s, sem parear de novo.
 */
export async function configurarWebhook(canal: Canal, url: string, segredo: string) {
  const atual = await lerSessao(canal)
  const config = { ...(atual?.config ?? {}) } as Record<string, unknown>
  const destino = new URL(url)
  const outros = (Array.isArray(config.webhooks) ? (config.webhooks as { url?: string }[]) : []).filter(w => {
    try {
      const u = new URL(String(w.url))
      return !(u.host === destino.host && u.pathname === destino.pathname)
    } catch {
      return true
    }
  })
  const noweb = (config.noweb ?? {}) as Record<string, unknown>
  const novo = {
    ...config,
    noweb: { ...noweb, store: { ...((noweb.store as object) ?? {}), enabled: true, fullSync: false } },
    webhooks: [
      ...outros,
      {
        url,
        events: [...EVENTOS_WEBHOOK],
        hmac: { key: segredo },
        retries: { policy: 'exponential', delaySeconds: 2, attempts: 6 }
      }
    ]
  }
  await chamar(canal, 'PUT', `/api/sessions/${sessao(canal)}`, { config: novo }, 30_000)
}
