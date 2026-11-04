import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

// Recebe os formulários do site institucional (público, sem login).
// Grava pela função registrar_lead_site, que valida e limita envios por IP.
const texto = (max: number) => z.string().trim().max(max).optional().default('')

const Lead = z.object({
  tipo: z.enum(['contato', 'parceiro']),
  origem: texto(60),
  pagina: texto(200),
  nome: z.string().trim().min(1).max(200),
  empresa: texto(200),
  cnpj: texto(30),
  email: texto(200),
  whatsapp: texto(40),
  mensagem: texto(4000),
  segmento: texto(120)
})

export async function POST(request: NextRequest) {
  const p = Lead.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ erro: 'Dados inválidos.' }, { status: 400 })

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null
  const { error } = await supabase.rpc('registrar_lead_site', {
    dados: p.data,
    ip,
    user_agent: request.headers.get('user-agent')
  })
  if (error) {
    console.error('[lead do site]', error.message)
    return NextResponse.json({ erro: 'Não foi possível registrar agora.' }, { status: 400 })
  }
  return NextResponse.json({ ok: true })
}
