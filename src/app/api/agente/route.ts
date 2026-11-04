import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { responder } from '@/lib/agente/agente'
import { usuarioAtual } from '@/lib/empresas/consulta'

export const maxDuration = 60

const Corpo = z.object({
  historico: z
    .array(z.object({ papel: z.enum(['usuario', 'agente']), texto: z.string().trim().min(1).max(12000) }))
    .min(1)
    .max(60)
})

export async function POST(request: NextRequest) {
  const usuario = await usuarioAtual()
  if (!usuario?.autorizado) return NextResponse.json({ erro: 'Sem acesso.' }, { status: 403 })

  const p = Corpo.safeParse(await request.json().catch(() => null))
  if (!p.success || p.data.historico.at(-1)?.papel !== 'usuario') {
    return NextResponse.json({ erro: 'Mensagem inválida.' }, { status: 400 })
  }

  try {
    const r = await responder(p.data.historico)
    console.log(`[agente] ${usuario.email} · ${r.motor} · ${r.ms} ms · ${r.ferramentas.join(',') || 'sem ferramentas'}`)
    return NextResponse.json(r)
  } catch (e) {
    console.error('[agente] falha', e)
    const msg = (e as Error).message
    const semChave = msg.includes('Nenhuma chave')
    return NextResponse.json(
      { erro: semChave ? 'O agente ainda não foi configurado (falta a chave da IA).' : 'O modelo de IA não respondeu agora. Tente de novo em instantes.' },
      { status: semChave ? 503 : 502 }
    )
  }
}
