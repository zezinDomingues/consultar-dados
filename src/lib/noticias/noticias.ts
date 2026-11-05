/**
 * Radar tributário: notícias do dia sobre tributação, sempre dentro do tema.
 *
 * Fonte: Bing Notícias (RSS público, sem chave): traz o link direto da matéria, resumo e miniatura.
 * Imagem: a do PRÓPRIO portal (og:image da matéria); se não houver, a miniatura do Bing.
 * Regra: notícia sem imagem não entra.
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
  resumo: string
  imagem: string // og:image do portal (ou a miniatura, se o portal não tiver)
  imagemReserva: string // miniatura do Bing, usada se a do portal não carregar
}

export const TEMAS = [
  { tema: 'Reforma Tributária', buscas: ['"reforma tributária"', '"split payment" OR "imposto seletivo"', 'IBS CBS imposto'] },
  { tema: 'PIS/COFINS', buscas: ['"PIS/Cofins"', '"PIS e Cofins"'] },
  { tema: 'ICMS', buscas: ['ICMS imposto', '"substituição tributária" OR DIFAL ICMS'] },
  { tema: 'Receita Federal', buscas: ['"Receita Federal" imposto', '"Receita Federal" contribuintes'] },
  { tema: 'Tribunais', buscas: ['CARF tributário', 'STF tributário', 'STJ tributário'] },
  { tema: 'Obrigações', buscas: ['SPED fiscal OR DCTFWeb OR "EFD-Reinf"', '"nota fiscal eletrônica"'] },
  { tema: 'Patrimônio', buscas: ['ITCMD', '"holding familiar" OR "planejamento sucessório"', '"planejamento tributário"'] }
] as const
const MAX_DIAS = 5
const NAVEGADOR = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'

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

type Bruta = Omit<Noticia, 'imagem'> & { miniatura: string }

async function buscarBing(tema: string, q: string): Promise<Bruta[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&setlang=pt-BR&cc=BR&mkt=pt-BR&qft=sortbydate%3d%221%22`
  const r = await fetch(url, { headers: { 'User-Agent': NAVEGADOR }, signal: AbortSignal.timeout(10000) })
  if (!r.ok) throw new Error(`Bing Notícias ${r.status}`)
  const xml = await r.text()
  const limite = Date.now() - MAX_DIAS * 864e5
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].flatMap(([, item]) => {
    const clique = campo(item, 'link')
    let link = ''
    try {
      link = new URL(clique).searchParams.get('url') || clique
    } catch {
      return []
    }
    const data = new Date(campo(item, 'pubDate'))
    if (isNaN(+data) || +data < limite) return []
    const img = campo(item, 'News:Image').replace(/^http:/, 'https:')
    return [{
      id: link.replace(/[^a-z0-9]/gi, '').slice(-32),
      titulo: campo(item, 'title'),
      fonte: campo(item, 'News:Source') || new URL(link).hostname.replace(/^www\./, ''),
      link,
      data: data.toISOString(),
      tema,
      resumo: campo(item, 'description').replace(/\s*\.\.\.$/, '…'),
      miniatura: img ? `${img}&w=800&h=450&c=14` : '',
      imagemReserva: img ? `${img}&w=800&h=450&c=14` : ''
    }]
  })
}

/** og:image (ou twitter:image) da própria matéria; só https para não cair em conteúdo misto. */
async function imagemDoPortal(link: string): Promise<string> {
  try {
    const r = await fetch(link, { headers: { 'User-Agent': NAVEGADOR, Accept: 'text/html' }, redirect: 'follow', signal: AbortSignal.timeout(7000) })
    if (!r.ok || !r.body) return ''
    // lê só o começo da página (as metas ficam no <head>)
    const leitor = r.body.getReader()
    let html = ''
    while (html.length < 250_000) {
      const { done, value } = await leitor.read()
      if (done) break
      html += new TextDecoder().decode(value)
      if (html.includes('</head>')) break
    }
    leitor.cancel().catch(() => {})
    const meta = (nome: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${nome}["'][^>]*content=["']([^"']+)["']`, 'i'))?.[1] ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${nome}["']`, 'i'))?.[1]
    const bruto = meta('og:image:secure_url') || meta('og:image') || meta('twitter:image') || meta('twitter:image:src')
    if (!bruto) return ''
    const abs = new URL(decodificar(bruto), r.url || link).toString().replace(/^http:/, 'https:')
    return /logo|placeholder|default[-_]?(image|og)|favicon/i.test(abs) ? '' : abs
  } catch {
    return ''
  }
}

function dentroDoTema(n: { titulo: string; link: string }) {
  const t = sem(n.titulo)
  return TEMA.test(t) && !FORA.test(t) && n.link.startsWith('https://')
}

/** trava 3: o modelo devolve os números das manchetes que são de fato sobre tributação. */
async function conferirComIA<T extends { titulo: string }>(lista: T[]): Promise<T[]> {
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
  const pedidos = TEMAS.flatMap(t => t.buscas.map(q => ({ tema: t.tema, q })))
  const lotes = await Promise.allSettled(pedidos.map(p => buscarBing(p.tema, p.q)))
  if (lotes.every(l => l.status === 'rejected')) throw new Error('Nenhuma fonte respondeu')

  // junta as buscas de cada tema, mais recentes primeiro, sem o mesmo fato repetido
  const porTemaBruto = new Map<string, Bruta[]>()
  lotes.forEach((l, i) => {
    if (l.status !== 'fulfilled') return
    const t = pedidos[i].tema
    porTemaBruto.set(t, [...(porTemaBruto.get(t) ?? []), ...l.value])
  })
  const escolhidas: { n: Bruta; p: Set<string> }[] = []
  for (const t of TEMAS) {
    let doTema = 0
    const lista = (porTemaBruto.get(t.tema) ?? []).filter(dentroDoTema).sort((a, b) => b.data.localeCompare(a.data))
    for (const n of lista) {
      if (doTema >= porTema + 2) break // folga para as que caírem por falta de imagem
      const p = palavras(n.titulo)
      if (escolhidas.some(e => e.n.link === n.link || parecidas(e.p, p))) continue
      escolhidas.push({ n, p })
      doTema++
    }
  }
  let candidatas = escolhidas.map(e => e.n).sort((a, b) => b.data.localeCompare(a.data))

  let conferidoPorIA = false
  try {
    candidatas = await conferirComIA(candidatas)
    conferidoPorIA = true
  } catch {
    // sem IA, fica o filtro de termos (trava 2)
  }

  // regra: só entra notícia com imagem — a do portal; se não houver, a miniatura do Bing
  const comImagem = await Promise.all(
    candidatas.map(async ({ miniatura, ...n }) => {
      const doPortal = await imagemDoPortal(n.link)
      const imagem = doPortal || miniatura
      return imagem ? ({ ...n, imagem, imagemReserva: miniatura || '' } as Noticia) : null
    })
  )
  const contagem = new Map<string, number>()
  const noticias = comImagem
    .filter((n): n is Noticia => !!n)
    .filter(n => {
      const c = contagem.get(n.tema) ?? 0
      contagem.set(n.tema, c + 1)
      return c < porTema
    })
    .slice(0, limite)
  return {
    atualizadoEm: new Date().toISOString(),
    conferidoPorIA,
    temas: TEMAS.map(t => t.tema).filter(t => noticias.some(n => n.tema === t)),
    noticias
  }
}
