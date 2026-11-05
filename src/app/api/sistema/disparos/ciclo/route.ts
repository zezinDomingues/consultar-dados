import { NextResponse, type NextRequest } from 'next/server'
import { segredoDisparos } from '@/lib/disparos/config'
import { rodarCiclo } from '@/lib/disparos/motor'
import { iguais } from '@/lib/disparos/seguranca'

// Chamado a cada minuto pelo pg_cron do Supabase (migração 006), com "Authorization: Bearer <DISPAROS_SEGREDO>".
// Público para o proxy (/api/sistema), protegido aqui pelo segredo.
export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function ciclo(request: NextRequest) {
  const segredo = segredoDisparos()
  if (!segredo) return NextResponse.json({ erro: 'DISPAROS_SEGREDO não configurado.' }, { status: 503 })
  if (!iguais(request.headers.get('authorization') ?? '', `Bearer ${segredo}`)) {
    return NextResponse.json({ erro: 'Não autorizado.' }, { status: 401 })
  }
  try {
    return NextResponse.json(await rodarCiclo())
  } catch (e) {
    console.error('[disparos] ciclo', e)
    return NextResponse.json({ erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const POST = ciclo
export const GET = ciclo
