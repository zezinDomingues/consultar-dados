import { randomBytes } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { supabaseAdmin, temChaveSecreta } from '@/lib/supabase/admin'

// Logo de um grupo de disparo → bucket público "marcas" do Storage (o WAHA/Z-API baixam a imagem pela URL).
export const dynamic = 'force-dynamic'

const TIPOS: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' }

/** O tipo pelo conteúdo (assinatura do arquivo), não pelo que o navegador declarou. */
function tipoReal(b: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (b.length >= png.length && png.every((v, i) => b[i] === v)) return 'image/png'
  return null
}

export async function POST(request: NextRequest) {
  if (!(await usuarioAtual())?.admin) return NextResponse.json({ erro: 'Somente administradores.' }, { status: 403 })
  if (!temChaveSecreta()) return NextResponse.json({ erro: 'Falta a SUPABASE_SECRET_KEY no servidor.' }, { status: 503 })
  // corpo maior que 3 MB + margem do multipart nem é lido
  if (Number(request.headers.get('content-length')) > 3.5 * 1024 * 1024) {
    return NextResponse.json({ erro: 'Imagem acima de 3 MB.' }, { status: 413 })
  }
  const fd = await request.formData().catch(() => null)
  const arquivo = fd?.get('arquivo')
  if (!(arquivo instanceof File)) return NextResponse.json({ erro: 'Envie uma imagem.' }, { status: 400 })
  if (!TIPOS[arquivo.type]) return NextResponse.json({ erro: 'Use JPG ou PNG (o WhatsApp não mostra outros formatos).' }, { status: 400 })
  if (arquivo.size > 3 * 1024 * 1024) return NextResponse.json({ erro: 'Imagem acima de 3 MB.' }, { status: 400 })
  const bytes = Buffer.from(await arquivo.arrayBuffer())
  const tipo = tipoReal(bytes)
  if (!tipo) return NextResponse.json({ erro: 'O arquivo não é uma imagem JPG ou PNG de verdade.' }, { status: 400 })
  const caminho = `grupos/${Date.now()}-${randomBytes(4).toString('hex')}.${TIPOS[tipo]}`
  const db = supabaseAdmin()
  const { error } = await db.storage.from('marcas').upload(caminho, bytes, { contentType: tipo, upsert: false })
  if (error) {
    console.error('[logo]', error.message)
    return NextResponse.json({ erro: 'Não foi possível guardar a imagem agora. Tente de novo.' }, { status: 500 })
  }
  return NextResponse.json({ url: db.storage.from('marcas').getPublicUrl(caminho).data.publicUrl })
}
