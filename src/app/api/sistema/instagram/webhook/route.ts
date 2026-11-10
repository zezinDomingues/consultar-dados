import { NextResponse, type NextRequest } from 'next/server'
import { iguais } from '@/lib/disparos/seguranca'
import { assinaturaValida, tokenVerificacao, tratarWebhook } from '@/lib/instagram/webhook'

// Webhook do Instagram (Meta → nós). GET = verificação da assinatura ("Verificar e salvar" no painel da Meta);
// POST = comentários e directs, aceitos só com o X-Hub-Signature-256 certo (chave secreta do app).
export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams
  const esperado = tokenVerificacao()
  if (p.get('hub.mode') === 'subscribe' && esperado && iguais(p.get('hub.verify_token') ?? '', esperado)) {
    return new NextResponse(p.get('hub.challenge') ?? '', { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }
  return NextResponse.json({ erro: 'Não autorizado.' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  const corpo = await request.text()
  const assinatura = await assinaturaValida(corpo, request.headers.get('x-hub-signature-256'))
  if (!assinatura.ok) {
    console.warn('[instagram] webhook recusado:', assinatura.motivo)
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  try {
    const feitos = await tratarWebhook(JSON.parse(corpo))
    return NextResponse.json({ ok: true, feitos })
  } catch (e) {
    console.error('[instagram] webhook', e)
    return NextResponse.json({ erro: 'falha ao tratar' }, { status: 500 })
  }
}
