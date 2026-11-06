import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

// Logo de um grupo de disparo → bucket público "marcas" do Storage (o WAHA/Z-API baixam a imagem pela URL).
export const dynamic = 'force-dynamic'

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

export async function POST(request: NextRequest) {
  if (!(await usuarioAtual())?.admin) return NextResponse.json({ erro: 'Somente administradores.' }, { status: 403 })
  if (!temChaveSecreta()) return NextResponse.json({ erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }, { status: 503 })
  const fd = await request.formData().catch(() => null)
  const arquivo = fd?.get('arquivo')
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Envie uma imagem.' }, { status: 400 })
  const ext = TIPOS[arquivo.type]
  if (!ext) return NextResponse.json({ erro: 'Use JPG ou PNG (o WhatsApp não mostra outros formatos).' }, { status: 400 })
  if (arquivo.size > 3 * 1024 * 1024) return NextResponse.json({ erro: 'Imagem acima de 3 MB.' }, { status: 400 })
  const caminho = `grupos/${Date.now()}-${randomBytes(4).toString('hex')}.${ext}`
  const db = supabaseAdmin()
  const { error } = await db.storage.from('marcas').upload(caminho, Buffer.from(await arquivo.arrayBuffer()), { contentType: arquivo.type, upsert: false })
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  return NextResponse.json({ url: db.storage.from('marcas').getPublicUrl(caminho).data.publicUrl })
}
