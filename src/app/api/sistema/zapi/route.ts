import { after, NextResponse, type NextRequest } from 'next/server'
import { segredoDisparos } from '@/lib/disparos/config'
import { iguais } from '@/lib/disparos/seguranca'
import { processarEvento, type EventoWaha } from '@/lib/disparos/webhook'

// Webhook dos números da Z-API: /api/sistema/zapi?n=<id do número>&token=<DISPAROS_SEGREDO>.
// A Z-API não assina o webhook, por isso o segredo vai na URL. Cada aviso é traduzido para o formato do WAHA e
// segue pelo MESMO processamento (livro, coleta de nome/contato, respostas).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Zapi = {
  type?: string
  instanceId?: string
  messageId?: string
  phone?: string
  fromMe?: boolean
  isGroup?: boolean
  isNewsletter?: boolean
  broadcast?: boolean
  isStatusReply?: boolean
  isEdit?: boolean
  text?: { message?: string }
  image?: { caption?: string }
  audio?: unknown
  video?: unknown
  document?: unknown
  sticker?: unknown
  buttonsResponseMessage?: { buttonId?: string; message?: string }
  buttonReply?: { id?: string; buttonId?: string; message?: string; title?: string }
  templateButtonReplyMessage?: { selectedId?: string; selectedDisplayText?: string }
  listResponseMessage?: { selectedRowId?: string; title?: string; message?: string }
  status?: string
  ids?: string[]
  connected?: boolean
}

const ACK: Record<string, number> = { SENT: 1, RECEIVED: 2, READ: 3, PLAYED: 4 }

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
  // toque num botão: o rótulo é o que a coleta compara (ex.: "✅ Quero a consulta", "Usar este número")
  const botao =
    z.buttonsResponseMessage?.message ??
    z.buttonReply?.message ??
    z.buttonReply?.title ??
    z.templateButtonReplyMessage?.selectedDisplayText ??
    z.listResponseMessage?.title
  const corpo = botao ?? z.text?.message ?? z.image?.caption ?? ''
  const midia = !corpo && !!(z.audio || z.video || z.document || z.sticker || z.image)
  const telefone = z.phone.replace(/@.*$/, '').replace(/\D/g, '')
  return [
    {
      event: 'message',
      payload: { id: z.messageId, from: `${telefone}@c.us`, fromMe: false, body: corpo, hasMedia: midia }
    }
  ]
}

export async function POST(request: NextRequest) {
  const segredo = segredoDisparos()
  if (!segredo) return NextResponse.json({ erro: 'DISPAROS_SEGREDO não configurado.' }, { status: 503 })
  if (!iguais(request.nextUrl.searchParams.get('token') ?? '', segredo)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  const z = (await request.json().catch(() => null)) as Zapi | null
  if (!z) return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 })

  const numero = Number(request.nextUrl.searchParams.get('n')) || null
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
    console.error('[zapi] evento', z.type, e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
}
