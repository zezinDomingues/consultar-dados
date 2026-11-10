import { NextResponse, type NextRequest } from 'next/server'
import { registrarEvento } from '@/lib/disparos/motor'
import { urlApp } from '@/lib/disparos/config'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

// Link de divulgação: conta o PRIMEIRO clique de verdade e manda para o site da campanha.
// Robôs de pré-visualização (o próprio WhatsApp/WAHA buscando a prévia, Facebook, curl…) seguem sem contar.
export const dynamic = 'force-dynamic'

const ROBO = /whatsapp|facebookexternalhit|facebot|bot\b|crawler|spider|preview|node-fetch|undici|axios|curl|wget|python|go-http|okhttp/i

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const fallback = urlApp()
  if (!/^[A-Za-z0-9]{10}$/.test(token) || !temChaveSecreta()) return NextResponse.redirect(fallback, 302)
  const db = supabaseAdmin()
  const { data: d } = await db
    .from('disparos')
    .select('id, link_aberto_em, campanha:disparo_campanhas(site_url, grupo:disparo_grupos(site_url))')
    .eq('token', token)
    .maybeSingle()
  if (!d) return NextResponse.redirect(fallback, 302)
  const campanha = d.campanha as unknown as { site_url?: string | null; grupo?: { site_url?: string | null } | null } | null
  // só http(s) (o banco já barra outra coisa; aqui é a segunda trava: nunca redireciona para javascript:/data:)
  const http = (u?: string | null) => (u && /^https?:\/\//i.test(u) ? u : null)
  const destino = http(campanha?.site_url) || http(campanha?.grupo?.site_url) || fallback
  const agente = request.headers.get('user-agent') ?? ''
  if (!d.link_aberto_em && agente && !ROBO.test(agente)) {
    const agora = new Date().toISOString()
    await db.from('disparos').update({ link_aberto_em: agora, atualizado_em: agora }).eq('id', d.id).is('link_aberto_em', null)
    await registrarEvento({ disparo_id: d.id, tipo: 'link', texto: 'clicou no link da divulgação' })
  }
  return NextResponse.redirect(destino, 302)
}
