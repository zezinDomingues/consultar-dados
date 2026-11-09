import { after, NextResponse, type NextRequest } from 'next/server'
import { segredoDisparos, segredoZapi } from '@/lib/disparos/config'
import { carregarNumero, numeroDaInstancia } from '@/lib/disparos/motor'
import { eventoForaDoPrazo, iguais, tokenWebhookNumero } from '@/lib/disparos/seguranca'
import type { NumeroComChave } from '@/lib/disparos/tipos'
import { processarEvento, type EventoWaha } from '@/lib/disparos/webhook'

// Webhook dos números da Z-API: /api/sistema/zapi?n=<id do número>&token=<token do número>.
// A Z-API não assina o webhook, por isso o token vai na URL — e é PRÓPRIO de cada número (HMAC do id com
// ZAPI_WEBHOOK_SEGREDO, ou DISPAROS_SEGREDO enquanto ela não existir): quem vê a URL de um número não fala por outro
// nem chama o ciclo. O token antigo (o próprio DISPAROS_SEGREDO) ainda vale para o número que não foi reconfigurado
// ("Reconfigurar webhook" grava o token novo na Z-API e encerra o antigo para aquele número).
// Também confere o instanceId do aviso contra o número e descarta aviso velho (replay).
// Cada aviso é traduzido para o formato do WAHA e segue pelo MESMO processamento (livro, coleta, respostas).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Zapi = {
  type?: string
  instanceId?: string
  messageId?: string
  phone?: string
  chatLid?: string
  momment?: number
  fromMe?: boolean
  isGroup?: boolean
  isNewsletter?: boolean
  broadcast?: boolean
  isStatusReply?: boolean
  isEdit?: boolean
  waitingMessage?: boolean
  text?: { message?: string }
  image?: { caption?: string }
  audio?: unknown
  video?: unknown
  document?: unknown
  sticker?: unknown
  location?: unknown
  contact?: unknown
  reaction?: { value?: string }
  notification?: string
  buttonsResponseMessage?: { buttonId?: string; message?: string }
  buttonReply?: { id?: string; buttonId?: string; message?: string; title?: string }
  templateButtonReplyMessage?: { selectedId?: string; selectedDisplayText?: string }
  listResponseMessage?: { selectedRowId?: string; title?: string; message?: string }
  status?: string
  ids?: string[]
  connected?: boolean
}

const ACK: Record<string, number> = { SENT: 1, RECEIVED: 2, READ: 3, PLAYED: 4 }
const HORA = 3_600_000
/** Idade máxima do aviso: mensagem/status atrasados por queda da plataforma ainda valem; conexão velha, não. */
const IDADE_MAXIMA: Record<string, number> = { ConnectedCallback: HORA / 2, DisconnectedCallback: HORA / 2 }
const IDADE_PADRAO = 72 * HORA

const digitos = (v: string | undefined) => (v ?? '').replace(/@.*$/, '').replace(/\D/g, '')

/** Aviso da Z-API → eventos no formato do WAHA (um aviso de status pode trazer vários ids). */
function traduzir(z: Zapi): EventoWaha[] {
  if (z.type === 'MessageStatusCallback') {
    const ack = ACK[z.status ?? ''] ?? 0
    return (z.ids ?? []).map(id => ({ event: 'message.ack', payload: { id, fromMe: true, ack } }))
  }
  if (z.type === 'ConnectedCallback') return [{ event: 'session.status', payload: { status: 'WORKING' } }]
  if (z.type === 'DisconnectedCallback') return [{ event: 'session.status', payload: { status: 'DESCONECTADO' } }]
  if (z.type !== 'ReceivedCallback') return []
  if (z.fromMe || z.isGroup || z.isNewsletter || z.broadcast || z.isStatusReply || z.isEdit || !z.phone || !z.messageId) return []
  // "aguardando mensagem": o WhatsApp ainda não entregou o conteúdo; a Z-API manda de novo com o MESMO messageId.
  // Registrar agora faria a mensagem de verdade cair como "repetida".
  if (z.waitingMessage) return []
  // toque num botão: o rótulo é o que a coleta compara (ex.: "✅ Quero a consulta", "Usar este número")
  const botao =
    z.buttonsResponseMessage?.message ??
    z.buttonReply?.message ??
    z.buttonReply?.title ??
    z.templateButtonReplyMessage?.selectedDisplayText ??
    z.listResponseMessage?.title
  const corpo = botao ?? z.text?.message ?? z.image?.caption ?? ''
  const midia = !corpo && !!(z.audio || z.video || z.document || z.sticker || z.image || z.location || z.contact)
  // reação e aviso do WhatsApp: ficam na conversa sem contar como resposta
  const descricao = z.reaction
    ? z.reaction.value
      ? `reagiu com ${z.reaction.value}`
      : 'tirou a reação'
    : z.notification
      ? `aviso do WhatsApp: ${z.notification}`
      : undefined
  // LID (identificador interno do WhatsApp) não é telefone: vai como "…@lid", e o telefone (se vier) como c.us
  const ehLid = /@lid$/i.test(z.phone)
  const lid = ehLid ? digitos(z.phone) : digitos(z.chatLid)
  const from = ehLid ? `${lid}@lid` : `${digitos(z.phone)}@c.us`
  return [
    {
      event: 'message',
      payload: {
        id: z.messageId,
        from,
        fromMe: false,
        body: z.reaction || z.notification ? '' : corpo,
        hasMedia: !z.reaction && !z.notification && midia,
        ...(descricao ? { descricao } : {}),
        ...(lid ? { lid } : {})
      }
    }
  ]
}

export async function POST(request: NextRequest) {
  const base = segredoZapi()
  if (!base) return NextResponse.json({ erro: 'ZAPI_WEBHOOK_SEGREDO / DISPAROS_SEGREDO não configurado.' }, { status: 503 })
  const n = Number(request.nextUrl.searchParams.get('n')) || null
  const token = request.nextUrl.searchParams.get('token') ?? ''
  // 1º sem banco: token do número (novo) ou o segredo antigo
  const porNumero = !!n && iguais(token, tokenWebhookNumero(n, base, 'zapi'))
  const legado = segredoDisparos()
  const antigo = !porNumero && !!legado && iguais(token, legado)
  if (!porNumero && !antigo) return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })

  const z = (await request.json().catch(() => null)) as Zapi | null
  if (!z || typeof z !== 'object') return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 })

  let numero: NumeroComChave | null
  try {
    numero = n ? await carregarNumero(n) : z.instanceId ? await numeroDaInstancia(z.instanceId) : null
  } catch (e) {
    console.error('[zapi] número', e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
  if (n && !numero) return NextResponse.json({ ok: true, ignorado: 'número não cadastrado' })
  if (antigo && numero?.webhook_por_numero) {
    return NextResponse.json({ erro: 'Token antigo: este número já usa o token próprio (Reconfigurar webhook).' }, { status: 401 })
  }
  if (numero && z.instanceId && z.instanceId.trim().toUpperCase() !== numero.waha_sessao.trim().toUpperCase()) {
    console.error('[zapi] instanceId não confere com o número', numero.id)
    return NextResponse.json({ erro: 'Instância não confere com o número.' }, { status: 403 })
  }
  const velho = eventoForaDoPrazo(z.momment, IDADE_MAXIMA[z.type ?? ''] ?? IDADE_PADRAO)
  if (velho) return NextResponse.json({ ok: true, ignorado: velho })

  const resultados: unknown[] = []
  try {
    for (const evento of traduzir(z)) {
      resultados.push(
        await processarEvento(evento, numero, tarefa =>
          after(async () => {
            try {
              await tarefa()
            } catch (e) {
              console.error('[zapi] resposta ao contato falhou', e)
            }
          })
        )
      )
    }
    return NextResponse.json({ ok: true, resultados })
  } catch (e) {
    // 500 faz a Z-API reenviar; o evento que falhou foi desfeito, então o reenvio é processado de novo
    console.error('[zapi] evento', z.type, e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
}
