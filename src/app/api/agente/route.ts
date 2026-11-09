import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { responder } from '@/lib/agente/agente'
import { consumirPergunta } from '@/lib/agente/limite'
import type { EventoAgente } from '@/lib/agente/tipos'
import { usuarioAtual } from '@/lib/empresas/consulta'

export const maxDuration = 60
// Prazo do turno inteiro (modelo + ferramentas). Uma consulta ao banco já iniciada termina em até 8 s
// (statement_timeout), então 45 s + 8 s ainda fica abaixo dos 60 s da função.
const PRAZO_TOTAL = 45_000

const Corpo = z.object({
  historico: z
    .array(z.object({ papel: z.enum(['usuario', 'agente']), texto: z.string().trim().min(1).max(12000) }))
    .min(1)
    .max(60),
  contexto: z.string().max(20000).optional()
})

const espera = (s: number) => (s >= 3600 ? `${Math.ceil(s / 3600)} h` : s >= 60 ? `${Math.ceil(s / 60)} min` : `${s} s`)

/** Responde em NDJSON: etapas, anexos (painéis) e o texto final chegam assim que ficam prontos. */
export async function POST(request: NextRequest) {
  const usuario = await usuarioAtual()
  if (!usuario?.autorizado) return NextResponse.json({ erro: 'Sem acesso.' }, { status: 403 })

  const p = Corpo.safeParse(await request.json().catch(() => null))
  if (!p.success || p.data.historico.at(-1)?.papel !== 'usuario') {
    return NextResponse.json({ erro: 'Mensagem inválida.' }, { status: 400 })
  }

  const uso = await consumirPergunta(usuario.id)
  if (!uso.ok) {
    if (uso.motivo === 'sem_acesso') return NextResponse.json({ erro: 'Sem acesso.' }, { status: 403 })
    const texto =
      uso.motivo === 'dia'
        ? `Você chegou ao limite de perguntas ao agente por hoje. Tente de novo em ${espera(uso.espera)}.`
        : `Muitas perguntas seguidas. Espere ${espera(uso.espera)} e tente de novo.`
    return NextResponse.json({ erro: texto }, { status: 429, headers: { 'Retry-After': String(uso.espera) } })
  }

  const desistiu = new AbortController() // o navegador fechou a conexão
  const prazo = AbortSignal.timeout(PRAZO_TOTAL)
  const sinal = AbortSignal.any([desistiu.signal, request.signal, prazo])
  const codificador = new TextEncoder()
  const fluxo = new ReadableStream({
    async start(controle) {
      let aberto = true
      const emitir = (e: EventoAgente) => {
        if (!aberto) return
        try {
          controle.enqueue(codificador.encode(JSON.stringify(e) + '\n'))
        } catch {
          aberto = false
        }
      }
      try {
        const r = await responder(p.data.historico, emitir, p.data.contexto, sinal)
        console.log(`[agente] ${usuario.email} · ${r.motor} · ${r.ms} ms · ${r.ferramentas.join(',') || 'sem ferramentas'}`)
      } catch (e) {
        if (desistiu.signal.aborted || request.signal.aborted) {
          console.log(`[agente] ${usuario.email} · cancelado pelo navegador`)
        } else if (prazo.aborted) {
          console.warn(`[agente] ${usuario.email} · passou de ${PRAZO_TOTAL / 1000} s`)
          emitir({ tipo: 'erro', texto: 'A resposta demorou demais e foi interrompida. Tente uma pergunta mais específica.' })
        } else {
          console.error('[agente] falha', e)
          const msg = (e as Error).message
          emitir({
            tipo: 'erro',
            texto: msg.includes('Nenhuma chave')
              ? 'O agente ainda não foi configurado (falta a chave da IA).'
              : 'O modelo de IA não respondeu agora. Tente de novo em instantes.'
          })
        }
      } finally {
        aberto = false
        try {
          controle.close()
        } catch {}
      }
    },
    cancel() {
      desistiu.abort()
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
