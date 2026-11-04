/**
 * Radar tributário: notícias do dia sobre tributação, sempre dentro do tema.
 *
 * Fonte: Google Notícias (RSS público, sem chave), uma busca por tema, só dos últimos dias.
 * Três travas para não fugir do assunto:
 *   1. a busca já é temática (termos fiscais);
 *   2. o título precisa conter um termo fiscal e não pode conter termos fora do tema;
 *   3. o Nemotron confere a lista e descarta o que não é tributação/fisco (se a IA falhar,
 *      fica só a trava 2, que já é estrita).
 */
import { novaSessao } from '@/lib/agente/provedores'

export type Noticia = {
  id: string
  titulo: string
  fonte: string
  link: string
  data: string // ISO
  tema: string
}

export const TEMAS = [
  { tema: 'Reforma Tributária', busca: '"reforma tributária" OR "IBS e CBS" OR "imposto seletivo" OR "split payment"' },
  { tema: 'PIS/COFINS', busca: '"PIS/Cofins" OR "PIS e Cofins" OR "crédito de PIS" OR "crédito de Cofins"' },
  { tema: 'ICMS', busca: 'ICMS OR "ICMS-ST" OR "substituição tributária" OR "DIFAL"' },
  { tema: 'Receita Federal', busca: '"Receita Federal" (tributo OR imposto OR compensação OR autuação OR arrecadação OR "malha fiscal") -apreensão -apreende -droga -drogas -contrabando -cocaína -maconha' },
  { tema: 'Tribunais', busca: 'CARF OR "tese tributária" OR (STF tributário) OR (STJ tributário) OR "tema repetitivo" tributo' },
  { tema: 'Obrigações', busca: 'SPED OR "EFD-Reinf" OR "nota fiscal eletrônica" OR DCTFWeb OR "obrigação acessória"' },
  { tema: 'Patrimônio', busca: 'ITCMD OR "holding familiar" OR "planejamento sucessório" OR "planejamento tributário"' }
] as const

// trava 2 — o título (sem acento, minúsculo) precisa de pelo menos um destes…
const TEMA = new RegExp(
  [
    'tribut', 'imposto', 'icms', '\\bpis\\b', 'cofins', '\\bibs\\b', '\\bcbs\\b', 'receita federal', '\\bfisco\\b', 'fiscal',
    '\\bcarf\\b', '\\bsped\\b', 'nota fiscal', 'nf-e', 'itcmd', 'irpj', 'csll', '\\biss\\b', '\\bipi\\b', 'simples nacional',
    'lucro real', 'lucro presumido', 'contribuic', 'compensac', 'restituic', 'credito', 'holding', 'sucessori', 'aliquota',
    'arrecadac', 'imposto de renda', 'split payment', 'dctf', 'reinf', 'refis', 'transacao tributaria', 'divida ativa',
    'pgfn', 'difal', 'substituicao tributaria', 'desoneracao', 'regime especial', 'autuac', 'sonegac'
  ].join('|')
)
// …e nenhum destes (assuntos que aparecem por acaso nas buscas)
const FORA = /apreen|contraband|\bdroga|skunk|cocaina|maconha|futebol|\bbbb\b|novela|horoscopo|celebridade|loteria|mega-sena|receita de |culinaria|bolo|reality|show\b|cantor|atriz|ator\b|crime passional/

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function decodificar(s: string) {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .trim()
}

const campo = (item: string, tag: string) => decodificar(item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1] ?? '')

async function buscarTema(t: (typeof TEMAS)[number], dias: number): Promise<Noticia[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`${t.busca} when:${dias}d`)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (OficialCert radar)' }, signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`Google Notícias ${r.status}`)
  const xml = await r.text()
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, item]) => {
    const fonte = campo(item, 'source')
    let titulo = campo(item, 'title')
    if (fonte && titulo.endsWith(` - ${fonte}`)) titulo = titulo.slice(0, -(fonte.length + 3)).trim()
    const data = new Date(campo(item, 'pubDate'))
    return {
      id: campo(item, 'guid').slice(-24),
      titulo,
      fonte: fonte || 'Imprensa',
      link: campo(item, 'link'),
      data: isNaN(+data) ? new Date().toISOString() : data.toISOString(),
      tema: t.tema
    }
  })
}

function dentroDoTema(n: Noticia) {
  const t = sem(n.titulo)
  return TEMA.test(t) && !FORA.test(t) && n.link.startsWith('https://')
}

/** trava 3: o modelo devolve os números das manchetes que são de fato sobre tributação. */
async function conferirComIA(lista: Noticia[]): Promise<Noticia[]> {
  if (!lista.length) return lista
  const sessao = novaSessao()
  const r = await Promise.race([
    sessao.completar(
      [
        {
          role: 'system',
          content:
            'Você é editor de um portal de notícias sobre tributação no Brasil para empresas. Receberá manchetes numeradas. ' +
            'Mantenha SOMENTE as que tratam diretamente de tributos, fisco, Receita Federal/estaduais, reforma tributária, ' +
            'obrigações fiscais, decisões judiciais/administrativas tributárias ou planejamento tributário/patrimonial. ' +
            'Descarte: política genérica; economia sem foco em tributo; apreensões e operações policiais/aduaneiras ' +
            '(drogas, contrabando, fronteira); repasses de verbas a municípios; selos, prêmios e rankings; cursos, ' +
            'eventos, seminários e capacitações; crimes comuns, esporte, entretenimento e anúncios. ' +
            'Responda apenas com JSON: {"manter":[números]}.'
        },
        { role: 'user', content: lista.map((n, i) => `${i + 1}. ${n.titulo}`).join('\n') }
      ],
      []
    ),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('tempo esgotado')), 25000))
  ])
  const json = r.texto?.match(/\{[\s\S]*\}/)?.[0]
  const manter = new Set<number>((json ? JSON.parse(json).manter : []) as number[])
  if (!manter.size) throw new Error('IA não devolveu a lista')
  return lista.filter((_, i) => manter.has(i + 1))
}

export type Radar = { atualizadoEm: string; conferidoPorIA: boolean; temas: string[]; noticias: Noticia[] }

// mesmo fato contado por vários veículos: palavras significativas muito parecidas
const VAZIAS = new Set('para pela pelo como com sem sobre entre apos ante desde mais menos que dos das nos nas uma uns umas de da do em na no e o a os as ao aos se sua seu suas seus diz pede pedem'.split(' '))
const palavras = (t: string) => new Set(sem(t).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !VAZIAS.has(w)))
function parecidas(a: Set<string>, b: Set<string>) {
  let comum = 0
  for (const w of a) if (b.has(w)) comum++
  return comum / Math.min(a.size, b.size || 1) >= 0.6
}

export async function montarRadar(limite = 36, porTema = 8): Promise<Radar> {
  const lotes = await Promise.allSettled(TEMAS.map(t => buscarTema(t, 3)))
  if (lotes.every(l => l.status === 'rejected')) throw new Error('Nenhuma fonte respondeu')
  const escolhidas: { n: Noticia; p: Set<string> }[] = []
  for (const l of lotes) {
    if (l.status !== 'fulfilled') continue
    let doTema = 0
    for (const n of l.value.filter(dentroDoTema).sort((a, b) => b.data.localeCompare(a.data))) {
      if (doTema >= porTema) break
      const p = palavras(n.titulo)
      if (escolhidas.some(e => parecidas(e.p, p))) continue
      escolhidas.push({ n, p })
      doTema++
    }
  }
  const todas = escolhidas.map(e => e.n).sort((a, b) => b.data.localeCompare(a.data))

  let noticias = todas
  let conferidoPorIA = false
  try {
    noticias = await conferirComIA(todas)
    conferidoPorIA = true
  } catch {
    // sem IA, fica o filtro de termos (trava 2)
  }
  noticias = noticias.slice(0, limite)
  return {
    atualizadoEm: new Date().toISOString(),
    conferidoPorIA,
    temas: TEMAS.map(t => t.tema).filter(t => noticias.some(n => n.tema === t)),
    noticias
  }
}
