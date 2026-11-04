// Provedores de modelo. Os dois falam a API de chat da OpenAI, então o laço do
// agente é um só e trocar de motor é trocar de configuração.
//   NVIDIA NIM  → Nemotron (padrão, como no Saúde Inteligente)
//   Google      → Gemini, pelo endpoint compatível com OpenAI
// Lições trazidas do Saúde Inteligente (core/chatbot.py):
//   • Nemotron raciocina por padrão: sem enable_thinking=false o texto vem vazio
//     e a resposta fica ~7 s mais lenta sem mudar o conteúdo.
//   • A cota gratuita da NVIDIA recusa ~2 de cada 3 chamadas (503/429 em <1 s):
//     tentar de novo UMA vez, rápido, e passar para o Gemini.
//   • Modelos do Gemini mudam de velocidade sem aviso: lista de reserva.
import 'server-only'

export type Mensagem =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: ChamadaFerramenta[] }
  | { role: 'tool'; tool_call_id: string; content: string }

export type ChamadaFerramenta = { id: string; type: 'function'; function: { name: string; arguments: string } }

export type RespostaModelo = { texto: string | null; chamadas: ChamadaFerramenta[] }

type Provedor = {
  nome: 'nvidia' | 'gemini'
  rotulo: string
  base: string
  chave: string | undefined
  modelos: string[]
  extra?: Record<string, unknown>
}

function provedores(): Provedor[] {
  const lista: Provedor[] = [
    {
      nome: 'nvidia',
      rotulo: 'Nemotron (NVIDIA)',
      base: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      chave: process.env.NVIDIA_API_KEY,
      modelos: [process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b'],
      extra: { chat_template_kwargs: { enable_thinking: false } }
    },
    {
      nome: 'gemini',
      rotulo: 'Gemini (Google)',
      base: 'https://generativelanguage.googleapis.com/v1beta/openai',
      chave: process.env.GEMINI_API_KEY,
      modelos: (process.env.GEMINI_MODELOS || 'gemini-3.5-flash-lite,gemini-3-flash-preview,gemini-3.6-flash')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
    }
  ]
  const ordem = (process.env.AGENTE_PROVEDORES || 'nvidia,gemini').split(',').map(s => s.trim())
  return ordem.map(n => lista.find(p => p.nome === n)).filter((p): p is Provedor => !!p?.chave)
}

export function provedoresDisponiveis() {
  return provedores().map(p => p.rotulo)
}

class Recusa extends Error {} // fila cheia / cota / modelo fora: vale tentar outro

async function chamar(p: Provedor, modelo: string, mensagens: Mensagem[], ferramentas: readonly unknown[]): Promise<RespostaModelo> {
  let resp: Response
  try {
    resp = await fetch(`${p.base}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${p.chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelo,
        messages: mensagens,
        ...(ferramentas.length ? { tools: ferramentas, tool_choice: 'auto' } : {}),
        temperature: 0.2,
        max_tokens: 2000,
        ...p.extra
      }),
      signal: AbortSignal.timeout(30_000)
    })
  } catch (e) {
    throw new Recusa(`${p.nome}/${modelo}: sem resposta (${(e as Error).name})`)
  }
  if (!resp.ok) {
    const corpo = (await resp.text()).slice(0, 300)
    if ([408, 429, 500, 502, 503, 504].includes(resp.status) || resp.status === 404) {
      throw new Recusa(`${p.nome}/${modelo}: HTTP ${resp.status} ${corpo}`)
    }
    throw new Error(`${p.nome}/${modelo}: HTTP ${resp.status} ${corpo}`)
  }
  const json = await resp.json()
  const msg = json?.choices?.[0]?.message
  if (!msg) throw new Recusa(`${p.nome}/${modelo}: resposta sem mensagem`)
  const chamadas: ChamadaFerramenta[] = (msg.tool_calls ?? []).map((c: ChamadaFerramenta, i: number) => ({
    id: c.id || `chamada_${Date.now()}_${i}`,
    type: 'function',
    function: { name: c.function?.name, arguments: c.function?.arguments ?? '{}' }
  }))
  return { texto: typeof msg.content === 'string' ? msg.content : null, chamadas }
}

/**
 * Cria uma "sessão" de modelo para um turno: escolhe o primeiro provedor/modelo
 * que aceitar a primeira chamada e mantém o mesmo até o fim do turno (trocar no
 * meio misturaria duas vozes na mesma resposta).
 */
export function novaSessao() {
  const fila = provedores()
  if (!fila.length) throw new Error('Nenhuma chave de IA configurada (NVIDIA_API_KEY ou GEMINI_API_KEY).')
  let escolhido: { p: Provedor; modelo: string } | null = null
  const falhas: string[] = []

  return {
    get motor() {
      return escolhido ? `${escolhido.p.rotulo} · ${escolhido.modelo}` : null
    },
    falhas,
    async completar(mensagens: Mensagem[], ferramentas: readonly unknown[]): Promise<RespostaModelo> {
      if (escolhido) {
        try {
          return await chamar(escolhido.p, escolhido.modelo, mensagens, ferramentas)
        } catch (e) {
          if (!(e instanceof Recusa)) throw e
          await new Promise(r => setTimeout(r, 700))
          return await chamar(escolhido.p, escolhido.modelo, mensagens, ferramentas)
        }
      }
      for (const p of fila) {
        for (const modelo of p.modelos) {
          const tentativas = p.nome === 'nvidia' ? 2 : 1
          for (let t = 0; t < tentativas; t++) {
            try {
              const r = await chamar(p, modelo, mensagens, ferramentas)
              escolhido = { p, modelo }
              return r
            } catch (e) {
              if (!(e instanceof Recusa)) throw e
              falhas.push((e as Error).message)
              if (t + 1 < tentativas) await new Promise(r => setTimeout(r, 700))
            }
          }
        }
      }
      throw new Error(`Todos os provedores recusaram: ${falhas.join(' | ')}`)
    }
  }
}
