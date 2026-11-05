import { after, NextResponse, type NextRequest } from 'next/server'
import { segredoDisparos } from '@/lib/disparos/config'
import { hmacWebhook, iguais } from '@/lib/disparos/seguranca'
import { processarEvento, type EventoWaha } from '@/lib/disparos/webhook'

// Webhook dos números de disparo no WAHA. URL: /api/sistema/whatsapp?n=<id do número>.
// Autenticação: assinatura HMAC-SHA512 (X-Webhook-Hmac) com o DISPAROS_SEGREDO — é como a plataforma configura o
// WAHA. Quem configurar à mão sem HMAC pode passar ?token=<DISPAROS_SEGREDO> na URL.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  const segredo = segredoDisparos()
  if (!segredo) return NextResponse.json({ erro: 'DISPAROS_SEGREDO não configurado.' }, { status: 503 })

  const corpo = await request.text()
  const assinatura = request.headers.get('x-webhook-hmac')?.trim().toLowerCase()
  const token = request.nextUrl.searchParams.get('token')
  const autorizado = assinatura ? iguais(assinatura, hmacWebhook(corpo, segredo)) : token ? iguais(token, segredo) : false
  if (!autorizado) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 })

  let evento: EventoWaha
  try {
    evento = JSON.parse(corpo) as EventoWaha
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 })
  }

  const numero = Number(request.nextUrl.searchParams.get('n')) || null
  try {
    // O livro é atualizado AGORA; as respostas ao contato (com "digitando…") saem depois do 200, sem segurar o WAHA.
    const resultado = await processarEvento(evento, numero, tarefa =>
      after(async () => {
        try {
          await tarefa()
        } catch (e) {
          console.error('[webhook] resposta ao contato falhou', e)
        }
      })
    )
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    // 500 faz o WAHA tentar de novo (os eventos repetidos são descartados pelo wa_id)
    console.error('[webhook] evento', evento.event, e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
}
