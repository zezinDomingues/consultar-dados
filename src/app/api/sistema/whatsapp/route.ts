import { after, NextResponse, type NextRequest } from 'next/server'
import { segredoDisparos, segredoWaha } from '@/lib/disparos/config'
import { carregarNumero } from '@/lib/disparos/motor'
import { eventoForaDoPrazo, hmacWebhook, iguais, tokenWebhookNumero } from '@/lib/disparos/seguranca'
import type { NumeroComChave } from '@/lib/disparos/tipos'
import { processarEvento, type EventoWaha } from '@/lib/disparos/webhook'

// Webhook dos números de disparo no WAHA. URL: /api/sistema/whatsapp?n=<id do número>.
// Autenticação: assinatura HMAC-SHA512 (X-Webhook-Hmac) com WAHA_WEBHOOK_SEGREDO (ou DISPAROS_SEGREDO enquanto ela
// não existir) — é como a plataforma configura o WAHA. Quem configurar à mão sem HMAC passa ?token=<token do número>.
// A chave/segredo antigos continuam valendo para o número que ainda não foi reconfigurado.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const IDADE_MAXIMA = 72 * 3_600_000

export async function POST(request: NextRequest) {
  const chave = segredoWaha()
  if (!chave) return NextResponse.json({ erro: 'WAHA_WEBHOOK_SEGREDO / DISPAROS_SEGREDO não configurado.' }, { status: 503 })
  const legado = segredoDisparos()

  const corpo = await request.text()
  const assinatura = request.headers.get('x-webhook-hmac')?.trim().toLowerCase()
  const token = request.nextUrl.searchParams.get('token')
  const n = Number(request.nextUrl.searchParams.get('n')) || null
  const novo = assinatura ? iguais(assinatura, hmacWebhook(corpo, chave)) : !!token && !!n && iguais(token, tokenWebhookNumero(n, chave, 'waha'))
  const antigo =
    !novo && !!legado && (assinatura ? legado !== chave && iguais(assinatura, hmacWebhook(corpo, legado)) : !!token && iguais(token, legado))
  if (!novo && !antigo) return NextResponse.json({ erro: 'Assinatura inválida.' }, { status: 401 })

  let evento: EventoWaha
  try {
    evento = JSON.parse(corpo) as EventoWaha
  } catch {
    return NextResponse.json({ erro: 'JSON inválido.' }, { status: 400 })
  }

  let numero: NumeroComChave | null
  try {
    numero = n ? await carregarNumero(n) : null
  } catch (e) {
    console.error('[webhook] número', e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
  if (n && !numero) return NextResponse.json({ ok: true, ignorado: 'número não cadastrado' })
  if (antigo && numero?.webhook_por_numero) return NextResponse.json({ erro: 'Assinatura antiga: reconfigure o webhook.' }, { status: 401 })
  if (numero && evento.session && evento.session !== numero.waha_sessao) {
    return NextResponse.json({ erro: 'Sessão não confere com o número.' }, { status: 403 })
  }
  const velho = eventoForaDoPrazo(evento.timestamp, IDADE_MAXIMA)
  if (velho) return NextResponse.json({ ok: true, ignorado: velho })

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
    // 500 faz o WAHA tentar de novo (o evento que falhou foi desfeito, então o reenvio é processado)
    console.error('[webhook] evento', evento.event, e)
    return NextResponse.json({ erro: 'Falha ao processar.' }, { status: 500 })
  }
}
