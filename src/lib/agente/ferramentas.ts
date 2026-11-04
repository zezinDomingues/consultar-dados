// Ferramentas do agente. Cada uma chama a MESMA camada de consulta da tela
// (src/lib/empresas/consulta.ts), com a sessão do usuário logado — o agente
// enxerga exatamente o que o usuário enxergaria na Consulta.
import 'server-only'
import { z } from 'zod'
import { buscarEmpresas, listarContadores, obterEmpresa, opcoesFiltros, resumoEmpresas } from '@/lib/empresas/consulta'
import { FiltrosSchema, hrefConsulta, ORDENS, type Filtros, type Ordem } from '@/lib/empresas/filtros'
import type { Opcao } from '@/lib/empresas/tipos'

// ---------------------------------------------------------------- esquemas
/** JSON Schema "enxuto": só type/description/enum/items/properties.
 *  O Gemini (endpoint compatível com OpenAI) recusa pattern, maxItems etc. */
function enxugar(no: unknown): unknown {
  if (Array.isArray(no)) return no.map(enxugar)
  if (!no || typeof no !== 'object') return no
  const o = no as Record<string, unknown>
  const r: Record<string, unknown> = {}
  for (const k of ['type', 'description', 'enum', 'items', 'properties', 'required']) {
    if (o[k] === undefined) continue
    if (k === 'properties') {
      r[k] = Object.fromEntries(Object.entries(o[k] as Record<string, unknown>).map(([p, v]) => [p, enxugar(v)]))
    } else r[k] = k === 'items' ? enxugar(o[k]) : o[k]
  }
  return r
}

const ESQUEMA_FILTROS = {
  ...(enxugar(z.toJSONSchema(FiltrosSchema)) as Record<string, unknown>),
  description: 'Filtros da busca. Omita o que não for pedido. Listas aceitam vários valores (OU entre eles).'
}

const ORDENS_LISTA = Object.keys(ORDENS) as Ordem[]

export const FERRAMENTAS = [
  {
    type: 'function',
    function: {
      name: 'buscar_codigos',
      description:
        'Traduz palavras do usuário para os códigos usados nos filtros: atividades (CNAE 7 dígitos), segmentos ' +
        '(grupo CNAE), ramos (divisão CNAE), setores (letra), municípios e regiões. Use SEMPRE que precisar filtrar ' +
        'por atividade/ramo/segmento ou confirmar o nome exato de um município.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string', description: 'Palavra ou trecho, ex.: "farmácia", "transporte de carga", "Sao Jose dos Campos"' },
          tipo: {
            type: 'string',
            enum: ['todos', 'atividade', 'segmento', 'ramo', 'setor', 'municipio', 'regiao'],
            description: 'Onde procurar (padrão: todos)'
          }
        },
        required: ['termo']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'buscar_empresas',
      description:
        'Lista empresas que atendem aos filtros, com total encontrado e link para abrir a lista completa na tela de ' +
        'Consulta. Use para "quais/liste/traga/me mostre empresas".',
      parameters: {
        type: 'object',
        properties: {
          filtros: ESQUEMA_FILTROS,
          ordem: { type: 'string', enum: ORDENS_LISTA, description: 'score (padrão, melhores para prospectar), capital, antigas, novas, nome' },
          limite: { type: 'integer', description: 'Quantas empresas trazer (1 a 20, padrão 10)' }
        },
        required: ['filtros']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'resumo_empresas',
      description:
        'Conta as empresas que atendem aos filtros e mostra como se distribuem (setor, ramo, porte, regime, região, ' +
        'município, prioridade). Use para "quantas", "qual a distribuição", "onde estão", comparações.',
      parameters: { type: 'object', properties: { filtros: ESQUEMA_FILTROS }, required: ['filtros'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detalhar_empresa',
      description: 'Ficha completa de uma empresa pelo CNPJ (14 dígitos, com ou sem pontuação): WhatsApp, telefones, e-mail (e se é do contador), endereço, atividades secundárias, regime, porte, capital. Use sempre que pedirem contato ou detalhes de uma empresa específica.',
      parameters: { type: 'object', properties: { cnpj: { type: 'string' } }, required: ['cnpj'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listar_contadores',
      description:
        'E-mails que aparecem no cadastro de 5+ empresas (escritórios contábeis e grupos), ordenados por nº de ' +
        'empresas. Para ver os clientes de um deles, use buscar_empresas com filtros.email.',
      parameters: {
        type: 'object',
        properties: {
          termo: { type: 'string', description: 'Trecho do e-mail ou nome de cliente (opcional)' },
          limite: { type: 'integer', description: '1 a 20, padrão 10' }
        }
      }
    }
  }
] as const

// ---------------------------------------------------------------- resultados para a tela
export type EmpresaResumida = {
  cnpj: string
  razao_social: string
  nome_fantasia: string | null
  municipio: string | null
  ramo: string | null
  porte: string | null
  capital_social: number | null
  regime: string | null
  situacao_regime: string | null
  prioridade: string
  score: number
  whatsapp: string | null
  whatsapp_link: string | null
  email: string | null
  email_tipo: string | null
}

/** O que a tela desenha além do texto: tabelas das buscas feitas no turno. */
export type Anexo = { tipo: 'empresas'; total: number; href: string; filtros: Filtros; empresas: EmpresaResumida[] }

// ---------------------------------------------------------------- execução
const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

const ArgsBusca = z.object({
  filtros: FiltrosSchema.default({}),
  ordem: z.enum(ORDENS_LISTA as [Ordem, ...Ordem[]]).optional().catch(undefined),
  limite: z.coerce.number().int().min(1).max(20).optional().catch(undefined)
})

const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o', 'as', 'os', 'por', 'sem'])
// "farmácia" precisa achar "farmacêuticos": cada palavra vale pelo radical (sem as 2–3 últimas letras).
const radical = (p: string) => (p.length >= 7 ? p.slice(0, -3) : p.length >= 5 ? p.slice(0, -2) : p)

/** Busca por palavras com radical; ordena por quantas palavras casam e depois pelo nº de empresas. */
function limitarLista(lista: Opcao[], termo: string, max = 12) {
  const palavras = normalizar(termo).split(/[^a-z0-9]+/).filter(p => p && !PARADAS.has(p)).map(radical)
  if (!palavras.length) return []
  return lista
    .map(o => {
      const nome = normalizar(o.nome)
      const exato = o.chave === termo || o.cod === termo
      return { o, acertos: exato ? palavras.length + 1 : palavras.filter(p => nome.includes(p)).length }
    })
    .filter(x => x.acertos > 0 && x.acertos >= Math.min(palavras.length, Math.max(1, palavras.length - 1)))
    .sort((a, b) => b.acertos - a.acertos || b.o.n - a.o.n)
    .slice(0, max)
    .map(({ o }) => ({ codigo: o.chave, nome: o.nome, ...(o.cod ? { cnae: o.cod } : {}), empresas: o.n }))
}

export async function executarFerramenta(
  nome: string,
  argsTexto: string,
  anexos: Anexo[]
): Promise<unknown> {
  let args: Record<string, unknown>
  try {
    args = argsTexto ? JSON.parse(argsTexto) : {}
  } catch {
    return { erro: 'Argumentos não são um JSON válido.' }
  }

  switch (nome) {
    case 'buscar_codigos': {
      const termo = String(args.termo ?? '').trim()
      if (termo.length < 2) return { erro: 'Informe um termo com 2 ou mais letras.' }
      const tipo = String(args.tipo ?? 'todos')
      const o = await opcoesFiltros()
      const quer = (t: string) => tipo === 'todos' || tipo === t
      return {
        ...(quer('setor') && { setores: limitarLista(o.setores, termo, 5) }),
        ...(quer('ramo') && { ramos: limitarLista(o.ramos, termo, 8) }),
        ...(quer('segmento') && { segmentos: limitarLista(o.segmentos, termo, 10) }),
        ...(quer('atividade') && { atividades: limitarLista(o.atividades, termo, 15) }),
        ...(quer('municipio') && { municipios: limitarLista(o.municipios, termo, 8) }),
        ...(quer('regiao') && { regioes: limitarLista(o.regioes, termo, 5) })
      }
    }

    case 'buscar_empresas': {
      const p = ArgsBusca.safeParse(args)
      if (!p.success) return { erro: 'Filtros inválidos', detalhes: z.prettifyError(p.error) }
      const { filtros, ordem = 'score', limite = 10 } = p.data
      const [empresas, resumo] = await Promise.all([
        buscarEmpresas(filtros, ordem, 1, limite),
        resumoEmpresas(JSON.stringify(filtros))
      ])
      const resumidas: EmpresaResumida[] = empresas.map(e => ({
        cnpj: e.cnpj, razao_social: e.razao_social, nome_fantasia: e.nome_fantasia, municipio: e.municipio,
        ramo: e.ramo, porte: e.porte, capital_social: e.capital_social, regime: e.regime,
        situacao_regime: e.situacao_regime, prioridade: e.prioridade, score: e.score, whatsapp: e.whatsapp,
        whatsapp_link: e.whatsapp_link, email: e.email, email_tipo: e.email_tipo
      }))
      const href = hrefConsulta({ filtros, ordem })
      anexos.push({ tipo: 'empresas', total: resumo.total.n, href, filtros, empresas: resumidas })
      // O modelo recebe só o necessário para comentar o resultado. Os contatos ficam
      // de fora de propósito: a tabela da tela já mostra, e sem eles o modelo não
      // repete a lista no texto. Para o contato de uma empresa: detalhar_empresa.
      return {
        total_encontrado: resumo.total.n,
        mostrando_na_tela: resumidas.length,
        link_consulta: href,
        instrucao: 'A tela já mostra estas empresas em tabela, com contatos. NÃO liste as empresas no texto: dê o total, os filtros usados e no máximo 3 nomes em destaque. Se depois pedirem o contato ou detalhes de uma delas, chame detalhar_empresa com o CNPJ.',
        empresas: resumidas.map(e => ({
          cnpj: e.cnpj, razao_social: e.razao_social, municipio: e.municipio, ramo: e.ramo, porte: e.porte,
          capital: e.capital_social, prioridade: e.prioridade
        }))
      }
    }

    case 'resumo_empresas': {
      const p = FiltrosSchema.safeParse(args.filtros ?? {})
      if (!p.success) return { erro: 'Filtros inválidos', detalhes: z.prettifyError(p.error) }
      const r = await resumoEmpresas(JSON.stringify(p.data))
      const top = (k: keyof typeof r.dims, n = 8) => (r.dims[k] ?? []).slice(0, n).map(i => ({ nome: i.nome, empresas: i.n }))
      return {
        total: r.total,
        link_consulta: hrefConsulta({ filtros: p.data }),
        por_setor: top('setor'),
        por_ramo: top('ramo'),
        por_porte: top('porte', 3),
        por_regime: top('regime', 3),
        por_situacao_regime: top('situacao_regime', 4),
        por_prioridade: top('prioridade', 4),
        por_regiao: top('regiao', 11),
        por_localizacao: top('localizacao', 4),
        por_municipio: top('municipio', 10)
      }
    }

    case 'detalhar_empresa': {
      const cnpj = String(args.cnpj ?? '').replace(/\D/g, '')
      if (cnpj.length !== 14) return { erro: 'CNPJ precisa ter 14 dígitos.' }
      const d = await obterEmpresa(cnpj)
      if (!d) return { erro: 'Empresa não encontrada na base (pode não ter ECF de Lucro Real/Presumido).' }
      const e = d.empresa
      return {
        ...e,
        link_ficha: `/empresa/${cnpj}`,
        atividades_secundarias: d.secundarias.map(s => `${s.cnae_fmt} ${s.atividade}`),
        outras_empresas_mesmo_email: d.mesmoEmail.map(o => o.razao_social)
      }
    }

    case 'listar_contadores': {
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const { itens, total } = await listarContadores(args.termo ? String(args.termo) : undefined, 1, limite)
      return { total, contadores: itens }
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` }
  }
}
