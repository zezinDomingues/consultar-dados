// Cliente da Z-API (instância "Web", conectada por QR) para os disparos — mesma interface do cliente WAHA.
// Formatos conferidos no agente de cadastro do SmartRanch, onde os botões aparecem no celular desde 06/10/2026:
// - send-button-actions: até 3 REPLY *ou* até 2 URL (não misturar), com title/footer/image opcionais;
// - o toque num REPLY chega no webhook em `buttonsResponseMessage.message` (rótulo) / `.buttonId`;
// - a Z-API devolve ERRO COM HTTP 200: o que prova o envio é o `messageId` na resposta.
import 'server-only'
import { ErroEnvio } from './erro'

export type CanalZapi = { url: string; sessao: string; apiKey: string | null; clientToken?: string | null }

const ErroZapi = ErroEnvio

// ZAPI_BASE_URL só existe para testes com uma Z-API simulada; em produção é sempre a oficial
const RAIZ = () => process.env.ZAPI_BASE_URL?.trim().replace(/\/+$/, '') || 'https://api.z-api.io'
const base = (c: CanalZapi) => `${RAIZ()}/instances/${encodeURIComponent(c.sessao)}/token/${encodeURIComponent(c.apiKey ?? '')}`

async function chamar<T>(c: CanalZapi, metodo: 'GET' | 'POST' | 'PUT', caminho: string, corpo?: unknown, timeoutMs = 30_000): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${base(c)}/${caminho}`, {
      method: metodo,
      headers: {
        Accept: 'application/json',
        ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(c.clientToken ? { 'Client-Token': c.clientToken } : {})
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
      cache: 'no-store'
    })
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } }
    const naoSaiu = ['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_CONNECT_TIMEOUT'].includes(err.cause?.code ?? '')
    throw new ErroZapi(`Z-API inacessível (${err.cause?.code || err.name}): ${err.message}`, undefined, naoSaiu ? 'nao' : 'talvez')
  }
  const texto = await res.text()
  let dados: unknown = null
  try {
    dados = texto ? JSON.parse(texto) : null
  } catch {
    dados = texto
  }
  if (!res.ok) throw new ErroZapi(`Z-API ${res.status}: ${texto.slice(0, 300)}`, res.status)
  const erro = (dados as { error?: unknown } | null)?.error
  if (erro && metodo !== 'GET') throw new ErroZapi(`Z-API ${caminho}: ${String(erro).slice(0, 300)}`, 400)
  return dados as T
}

/** Envio = precisa voltar `messageId` (a Z-API responde 200 até quando falha). */
async function enviar(c: CanalZapi, caminho: string, corpo: Record<string, unknown>) {
  const r = await chamar<{ messageId?: string; zaapId?: string; id?: string }>(c, 'POST', caminho, corpo)
  const id = r?.messageId ?? r?.id ?? r?.zaapId
  if (!id) throw new ErroZapi(`Z-API ${caminho} sem messageId: ${JSON.stringify(r).slice(0, 200)}`, 400)
  return String(id)
}

/**
 * Estado da instância no formato do WAHA: WORKING quando o celular está conectado. `dispositivo: false` pula a 2ª
 * chamada (telefone/nome do aparelho), que o ciclo não usa — são até 10 s a menos no orçamento de 60 s.
 */
export async function lerSessao(c: CanalZapi, opcoes: { dispositivo?: boolean } = {}) {
  const s = await chamar<{ connected?: boolean; error?: string; smartphoneConnected?: boolean }>(c, 'GET', 'status', undefined, 10_000)
  let me: { id?: string; pushName?: string } | null = null
  if (s?.connected && opcoes.dispositivo !== false) {
    try {
      const d = await chamar<{ phone?: string; name?: string }>(c, 'GET', 'device', undefined, 10_000)
      if (d?.phone) me = { id: d.phone, pushName: d.name }
    } catch {
      // dados do celular são só cortesia
    }
  }
  return { name: c.sessao, status: s?.connected ? 'WORKING' : 'DESCONECTADO', me, config: null, detalhe: s?.error ?? null }
}

/** 11 dígitos (DDD + número) → existe? chatId = número como o WhatsApp o conhece (com 55, 9º dígito acertado). */
export async function verificarNumero(c: CanalZapi, telefone: string) {
  const r = await chamar<{ exists?: boolean; phone?: string } | { exists?: boolean; phone?: string }[]>(c, 'GET', `phone-exists/55${telefone}`, undefined, 15_000)
  const d = Array.isArray(r) ? r[0] : r
  return { existe: !!d?.exists, chatId: d?.exists ? (d.phone ?? `55${telefone}`) : null }
}

const fone = (chatId: string) => chatId.replace(/@.*$/, '').replace(/\D/g, '')

export const enviarTexto = (c: CanalZapi, chatId: string, texto: string) => enviar(c, 'send-text', { phone: fone(chatId), message: texto, delayTyping: 2 })

export const enviarImagem = (c: CanalZapi, chatId: string, url: string, legenda: string) =>
  enviar(c, 'send-image', { phone: fone(chatId), image: url, caption: legenda })

export type BotaoZapi = { tipo: 'resposta'; texto: string } | { tipo: 'link'; texto: string; url: string }

/** Botões de ação: REPLY (até 3) ou URL (até 2) — os dois tipos juntos dão erro no WhatsApp Web. */
export function enviarBotoes(c: CanalZapi, chatId: string, m: { imagem?: string | null; texto: string; rodape?: string | null; botoes?: BotaoZapi[] }) {
  const botoes = m.botoes ?? []
  const links = botoes.filter(b => b.tipo === 'link')
  const lista = links.length
    ? links.slice(0, 2).map((b, i) => ({ id: `url${i + 1}`, type: 'URL', label: b.texto.slice(0, 20), url: (b as { url: string }).url }))
    : botoes.slice(0, 3).map((b, i) => ({ id: `r${i + 1}`, type: 'REPLY', label: b.texto.slice(0, 20) }))
  return enviar(c, 'send-button-actions', {
    phone: fone(chatId),
    message: m.texto,
    buttonActions: lista,
    ...(m.rodape ? { footer: m.rodape.slice(0, 60) } : {}),
    ...(m.imagem ? { image: m.imagem } : {})
  })
}

/** Aponta os webhooks da instância para a plataforma (a Z-API não assina: o token do número vai na URL). */
export async function configurarWebhook(c: CanalZapi, url: string) {
  for (const rota of ['update-webhook-received', 'update-webhook-message-status', 'update-webhook-connected', 'update-webhook-disconnected']) {
    await chamar(c, 'PUT', rota, { value: url }, 15_000)
  }
}
