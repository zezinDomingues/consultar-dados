import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { chaveDeLimite, ipDoCliente } from '@/lib/ip-cliente'
import { interpretarRegistro, LeadSite, MAX_CORPO } from '@/lib/leads-site'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

// Recebe os formulários do site institucional (público, sem login) e grava pela função registrar_lead_site,
// que limita os envios por IP. Respostas: 200 gravou · 400 dado inválido (com a mensagem de cada campo) ·
// 429 limite de envios · 500 falha do banco. O site só diz "recebemos" com 200.
export const dynamic = 'force-dynamic'

const resposta = (status: number, corpo: Record<string, unknown>, headers?: HeadersInit) =>
  NextResponse.json(corpo, { status, headers: { 'Cache-Control': 'no-store', ...headers } })

export async function POST(request: NextRequest) {
  const bruto = await request.text().catch(() => '')
  if (bruto.length > MAX_CORPO) return resposta(413, { erro: 'Mensagem grande demais. Resuma o texto e envie de novo.' })
  let json: unknown = null
  try {
    json = JSON.parse(bruto)
  } catch {}
  const p = LeadSite.safeParse(json)
  if (!p.success) {
    const campos: Record<string, string> = {}
    for (const i of p.error.issues) {
      const k = String(i.path[0] ?? '')
      if (k && !campos[k]) campos[k] = i.message
    }
    const erro = Object.keys(campos).length ? 'Confira os campos destacados.' : 'Dados inválidos.'
    return resposta(400, { erro, campos })
  }

  // chave secreta quando houver (assim a Segurança pode tirar o execute do anon); senão, a pública de sempre
  const db = temChaveSecreta()
    ? supabaseAdmin()
    : createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
  const { data, error, status } = await db.rpc('registrar_lead_site', {
    dados: p.data,
    ip: chaveDeLimite(ipDoCliente(request.headers)),
    user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null
  })
  const r = interpretarRegistro(data, error, status)
  if (r === 'ok') return resposta(200, { ok: true })
  if (r === 'limite') {
    return resposta(
      429,
      { erro: 'Recebemos muitos envios da sua conexão nos últimos minutos. Aguarde uns 10 minutos e envie de novo.' },
      { 'Retry-After': '600' }
    )
  }
  if (r === 'invalido') return resposta(400, { erro: 'Confira os dados e envie de novo.' })
  console.error('[lead do site]', status, error?.code, error?.message)
  return resposta(500, { erro: 'Não foi possível registrar agora. Tente de novo em instantes.' })
}
