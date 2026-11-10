import { NextResponse, type NextRequest } from 'next/server'
import { segredoCiclo } from '@/lib/disparos/config'
import { iguais } from '@/lib/disparos/seguranca'
import { rodarCicloInstagram } from '@/lib/instagram/publicar'

// Chamado a cada 5 min pelo pg_cron do Supabase (migração 024) quando há post vencido ou processando,
// com "Authorization: Bearer <segredo do ciclo>" (o mesmo do ciclo de disparos). Público para o proxy
// (/api/sistema), protegido aqui pelo segredo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function ciclo(request: NextRequest) {
  const segredo = segredoCiclo()
  if (!segredo) return NextResponse.json({ erro: 'segredo do ciclo não configurado.' }, { status: 503 })
  if (!iguais(request.headers.get('authorization') ?? '', `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  try {
    return NextResponse.json(await rodarCicloInstagram())
  } catch (e) {
    console.error('[instagram] ciclo', e)
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const POST = ciclo
export const GET = ciclo
