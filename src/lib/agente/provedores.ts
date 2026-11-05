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
  extraSe?: (modelo: string) => boolean
}

function provedores(): Provedor[] {
  const lista: Provedor[] = [
    {
      nome: 'nvidia',
      rotulo: 'Nemotron (NVIDIA)',
      base: process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1',
      chave: process.env.NVIDIA_API_KEY,
      // Medido de novo em 04/11/2026 (noite) com o prompt e as ferramentas reais, 6 perguntas (bench do scratchpad):
      //   nemotron-3.5-super-vl-120b   6/6 acertos, mediana 1,4 s, pior 5,8 s   ← principal
      //   mistral-large-4-1t-a52b      6/6, mediana 7,6 s, pior 16 s            ← reserva (corrida após 5 s)
      //   minimax-m3.1-flash 5/6 (8 s) · nemotron-3.5-lightning 2/6 (args quebrados)
      //   nemotron-3-ultra-550b: 0/6 — não respondeu nenhuma em 25 s na cota gratuita (era o padrão e
      //   fazia o agente esperar 2×30 s e estourar o limite de 60 s da função: "resposta interrompida")
      //   deepseek-v4.1-flash, glm-5.3-flash, gpt-oss-20b, gemma-4: timeout · kimi-k2.6, nemotron-3-super, nano-3: 404
      modelos: (process.env.NVIDIA_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b,mistralai/mistral-large-4-1t-a52b')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
      // só os Nemotron 3.x entendem este parâmetro (desliga o raciocínio longo)
      extra: { chat_template_kwargs: { enable_thinking: false } },
      extraSe: (modelo: string) => modelo.startsWith('nvidia/nemotron-3')
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

const TEMPO_CHAMADA = 20_000 // nenhuma chamada fica pendurada mais que isso
const TEMPO_CORRIDA = 5_000 // se o principal não respondeu até aqui, o reserva entra em paralelo

async function chamar(
  p: Provedor,
  modelo: string,
  mensagens: Mensagem[],
  ferramentas: readonly unknown[],
  cancelar?: AbortSignal
): Promise<RespostaModelo> {
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
        ...(p.extra && (!p.extraSe || p.extraSe(modelo)) ? p.extra : {})
      }),
      signal: cancelar ? AbortSignal.any([cancelar, AbortSignal.timeout(TEMPO_CHAMADA)]) : AbortSignal.timeout(TEMPO_CHAMADA)
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

type Candidato = { p: Provedor; modelo: string }

/**
 * Corrida escalonada: começa no 1º candidato; a cada TEMPO_CORRIDA sem resposta (ou na hora, se ele falhar),
 * entra o próximo em paralelo. Vale a primeira resposta boa; as outras são canceladas.
 */
async function correr(fila: Candidato[], mensagens: Mensagem[], ferramentas: readonly unknown[], falhas: string[]) {
  const controles = fila.map(() => new AbortController())
  return new Promise<{ r: RespostaModelo; c: Candidato }>((resolve, reject) => {
    let proximo = 0
    let pendentes = 0
    let terminou = false
    let relogio: ReturnType<typeof setTimeout> | undefined
    const lancar = () => {
      if (terminou || proximo >= fila.length) return
      const i = proximo++
      const c = fila[i]
      pendentes++
      clearTimeout(relogio)
      relogio = setTimeout(lancar, TEMPO_CORRIDA)
      chamar(c.p, c.modelo, mensagens, ferramentas, controles[i].signal).then(
        r => {
          if (terminou) return
          terminou = true
          clearTimeout(relogio)
          controles.forEach((ctl, j) => j !== i && ctl.abort())
          resolve({ r, c })
        },
        e => {
          pendentes--
          if (terminou) return
          falhas.push((e as Error).message)
          if (proximo < fila.length) lancar()
          else if (pendentes === 0) {
            terminou = true
            clearTimeout(relogio)
            reject(new Error(`Nenhum modelo respondeu: ${falhas.join(' | ')}`))
          }
        }
      )
    }
    lancar()
  })
}

/**
 * "Sessão" de modelo para um turno: a 1ª chamada escolhe, por corrida, o modelo mais rápido disponível e o
 * turno continua nele (trocar no meio misturaria duas vozes). Se ele falhar depois, a corrida recomeça com ele
 * na frente.
 */
export function novaSessao() {
  const fila: Candidato[] = provedores().flatMap(p => p.modelos.map(modelo => ({ p, modelo })))
  if (!fila.length) throw new Error('Nenhuma chave de IA configurada (NVIDIA_API_KEY ou GEMINI_API_KEY).')
  let escolhido: Candidato | null = null
  const falhas: string[] = []

  return {
    get motor() {
      return escolhido ? `${escolhido.p.rotulo} · ${escolhido.modelo}` : null
    },
    falhas,
    async completar(mensagens: Mensagem[], ferramentas: readonly unknown[]): Promise<RespostaModelo> {
      const ordem = escolhido ? [escolhido, ...fila.filter(c => c !== escolhido)] : fila
      const { r, c } = await correr(ordem, mensagens, ferramentas, falhas)
      escolhido = c
      return r
    }
  }
}
