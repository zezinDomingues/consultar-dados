import { NextResponse, type NextRequest } from 'next/server'
import { buscarEmpresas, SemAcessoError } from '@/lib/empresas/consulta'
import { lerConsulta } from '@/lib/empresas/filtros'

/** Página de empresas com os filtros da URL (usado pelo "Carregar mais" do agente). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const { filtros, ordem, pagina } = lerConsulta(k => sp.get(k))
  const por = Math.min(50, Math.max(1, parseInt(sp.get('por') ?? '10', 10) || 10))
  try {
    return NextResponse.json(await buscarEmpresas(filtros, ordem, pagina, por))
  } catch (e) {
    if (e instanceof SemAcessoError) return NextResponse.json({ erro: e.message }, { status: 403 })
    throw e
  }
}
