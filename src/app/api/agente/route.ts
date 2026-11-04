import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { responder } from '@/lib/agente/agente'
import type { EventoAgente } from '@/lib/agente/tipos'
import { usuarioAtual } from '@/lib/empresas/consulta'

export const maxDuration = 60

const Corpo = z.object({
  historico: z
    .array(z.object({ papel: z.enum(['usuario', 'agente']), texto: z.string().trim().min(1).max(12000) }))
    .min(1)
    .max(60),
  contexto: z.string().max(20000).optional()
})

/** Responde em NDJSON: etapas, anexos (painéis) e o texto final chegam assim que ficam prontos. */
export async function POST(request: NextRequest) {
  const usuario = await usuarioAtual()
  if (!usuario?.autorizado) return NextResponse.json({ erro: 'Sem acesso.' }, { status: 403 })

  const p = Corpo.safeParse(await request.json().catch(() => null))
  if (!p.success || p.data.historico.at(-1)?.papel !== 'usuario') {
    return NextResponse.json({ erro: 'Mensagem inválida.' }, { status: 400 })
  }

  const codificador = new TextEncoder()
  const fluxo = new ReadableStream({
    async start(controle) {
      const emitir = (e: EventoAgente) => controle.enqueue(codificador.encode(JSON.stringify(e) + '\n'))
      try {
        const r = await responder(p.data.historico, emitir, p.data.contexto)
        console.log(`[agente] ${usuario.email} · ${r.motor} · ${r.ms} ms · ${r.ferramentas.join(',') || 'sem ferramentas'}`)
      } catch (e) {
        console.error('[agente] falha', e)
        const msg = (e as Error).message
        emitir({
          tipo: 'erro',
          texto: msg.includes('Nenhuma chave')
            ? 'O agente ainda não foi configurado (falta a chave da IA).'
            : 'O modelo de IA não respondeu agora. Tente de novo em instantes.'
        })
      } finally {
        controle.close()
      }
    }
  })

  return new Response(fluxo, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no'
    }
  })
}
