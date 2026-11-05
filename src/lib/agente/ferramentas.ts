// Ferramentas do agente. Cada uma chama a MESMA camada de consulta da tela
// (src/lib/empresas/consulta.ts), com a sessão do usuário logado — o agente
// enxerga exatamente o que o usuário enxergaria na Consulta.
//
// Divisão de trabalho: a ferramenta devolve DOIS resultados.
//   • um "anexo" para a TELA (indicadores, distribuições, tabela, ficha) — é o
//     que o usuário vê, idêntico à Consulta;
//   • um resumo curto para o MODELO, que só escreve a legenda. Os contatos não
//     vão para o modelo: assim ele não repete a tabela em texto.
import 'server-only'
import { z } from 'zod'
import { buscarEmpresas, listarContadores, obterEmpresa, opcoesFiltros, resumoEmpresas } from '@/lib/empresas/consulta'
import { FiltrosSchema, hrefConsulta, ORDENS, type Filtros, type Ordem } from '@/lib/empresas/filtros'
import { rotulosFiltros } from '@/lib/empresas/rotulos'
import type { Opcao, Resumo } from '@/lib/empresas/tipos'
import type { Anexo, AnexoConsulta, EventoAgente, Sugestao } from './tipos'

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
  description:
    'Filtros da busca. Omita o que não foi pedido. Dentro de uma lista é OU; entre filtros diferentes é E. ' +
    'Em refinamentos ("dessas…", "agora só…"), repita os filtros da busca anterior e mude só o pedido.'
}

const ORDENS_LISTA = Object.keys(ORDENS) as Ordem[]

export const FERRAMENTAS = [
  {
    type: 'function',
    function: {
      name: 'buscar_codigos',
      description:
        'Traduz palavras do usuário para os códigos dos filtros: atividades (CNAE 7 dígitos), segmentos (grupo), ' +
        'ramos (divisão), setores (letra), municípios e regiões. Use quando o termo não estiver nos atalhos do ' +
        'prompt ou para confirmar a grafia de um município.',
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
      name: 'consultar_empresas',
      description:
        'Consulta a base com os filtros e MOSTRA AO USUÁRIO o painel completo: total, indicadores, distribuições ' +
        '(setor, ramo, município, porte) e a tabela das empresas com contatos. Serve tanto para "quantas" quanto ' +
        'para "quais/liste/me traga". Devolve a você só os números principais e as primeiras empresas (nome e CNPJ).',
      parameters: {
        type: 'object',
        properties: {
          filtros: ESQUEMA_FILTROS,
          ordem: {
            type: 'string',
            enum: ORDENS_LISTA,
            description: 'score (padrão: melhores para prospectar), capital (maiores), antigas, novas, nome'
          }
        },
        required: ['filtros']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'detalhar_empresa',
      description:
        'Abre a ficha de UMA empresa pelo CNPJ e MOSTRA AO USUÁRIO um cartão com WhatsApp, telefones, e-mail (e se é ' +
        'do contador), endereço, atividade, porte, capital e regime. Use sempre que pedirem contato ou detalhes de ' +
        'uma empresa (inclusive "a segunda da lista": o CNPJ está no histórico).',
      parameters: { type: 'object', properties: { cnpj: { type: 'string', description: '14 dígitos, com ou sem pontuação' } }, required: ['cnpj'] }
    }
  },
  {
    type: 'function',
    function: {
      name: 'listar_contadores',
      description:
        'Mostra ao usuário a tabela de e-mails presentes no cadastro de 5+ empresas (escritórios contábeis e grupos), ' +
        'com quantas empresas cada um atende. Para ver os clientes de um deles, use consultar_empresas com filtros.email.',
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

// ---------------------------------------------------------------- apoio
export type Contexto = { anexos: Anexo[]; emitir: (e: EventoAgente) => void }

const normalizar = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const PARADAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'a', 'o', 'as', 'os', 'por', 'sem'])
// "farmácia" precisa achar "farmacêuticos": cada palavra vale pelo radical (sem as 2–3 últimas letras).
const radical = (p: string) => (p.length >= 7 ? p.slice(0, -3) : p.length >= 5 ? p.slice(0, -2) : p)

/** Busca por palavras com radical; ordena por quantas palavras casam e depois pelo nº de empresas. */
function procurar(lista: Opcao[], termo: string, max = 12) {
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

const top = (r: Resumo, k: keyof Resumo['dims'], n: number) =>
  (r.dims[k] ?? []).slice(0, n).map(i => ({ nome: i.nome, empresas: i.n }))

/** Distribuições aparadas para a tela (o resumo completo do município tem até 645 itens). */
function aparar(r: Resumo): Resumo {
  const dims: Resumo['dims'] = {}
  const limites = { setor: 8, ramo: 8, municipio: 8, regiao: 11, porte: 3, regime: 3, situacao_regime: 4, prioridade: 4, localizacao: 4 } as const
  for (const [k, n] of Object.entries(limites) as [keyof Resumo['dims'], number][]) {
    if (r.dims[k]) dims[k] = r.dims[k]!.slice(0, n)
  }
  return { total: r.total, dims }
}

/** Próximos passos mais úteis para o resultado atual (viram botões na tela). */
function sugerir(f: Filtros, ordem: Ordem, r: Resumo): Sugestao[] {
  if (r.total.n === 0) return []
  const s: Sugestao[] = []
  if (!f.com_whatsapp && r.total.com_whatsapp > 0) s.push({ rotulo: 'Só com WhatsApp', pergunta: 'Dessas, mostre só as que têm WhatsApp.' })
  if (!f.portes) s.push({ rotulo: 'Só médias e grandes', pergunta: 'Dessas, só as de porte médio ou grande.' })
  if (!f.situacoes_regime) s.push({ rotulo: 'Regime recente', pergunta: 'Dessas, só as com regime recente (ECF 2024).' })
  if (!f.contato_proprio) s.push({ rotulo: 'Contato direto', pergunta: 'Dessas, só as com contato da própria empresa (sem contador).' })
  const mun = r.dims.municipio?.[0]
  if (!f.municipios && mun && r.total.n > 30 && (r.dims.municipio?.length ?? 0) > 1) {
    s.push({ rotulo: `Só em ${mun.nome}`, pergunta: `Dessas, só as de ${mun.nome}.` })
  }
  if (ordem !== 'capital') s.push({ rotulo: 'Maiores por capital', pergunta: 'Mostre essas mesmas ordenadas pelo maior capital social.' })
  return s.slice(0, 5)
}

async function consultar(filtros: Filtros, ordem: Ordem, ctx: Contexto): Promise<AnexoConsulta> {
  const chave = JSON.stringify(filtros)
  const [empresas, resumo, opcoes] = await Promise.all([
    buscarEmpresas(filtros, ordem, 1, 10),
    resumoEmpresas(chave),
    opcoesFiltros()
  ])
  const anexo: AnexoConsulta = {
    tipo: 'consulta',
    chave: `consulta:${chave}`,
    filtros,
    ordem,
    href: hrefConsulta({ filtros, ordem }),
    rotulos: rotulosFiltros(filtros, opcoes).map(r => r.rotulo),
    totalBase: opcoes.total_base,
    resumo: aparar(resumo),
    empresas,
    sugestoes: sugerir(filtros, ordem, resumo)
  }
  // Mesmos filtros no mesmo turno = mesmo painel (a tela troca pelo mais novo).
  const i = ctx.anexos.findIndex(a => a.chave === anexo.chave)
  if (i >= 0) ctx.anexos[i] = anexo
  else ctx.anexos.push(anexo)
  ctx.emitir({ tipo: 'anexo', anexo })
  return anexo
}

// ---------------------------------------------------------------- execução
const ArgsConsulta = z.object({
  // alguns modelos mandam os filtros como texto JSON em vez de objeto: aceita os dois
  filtros: z.preprocess(v => {
    if (typeof v !== 'string') return v
    try {
      return JSON.parse(v)
    } catch {
      return v
    }
  }, FiltrosSchema.default({})),
  ordem: z.enum(ORDENS_LISTA as [Ordem, ...Ordem[]]).optional().catch(undefined)
})

/** Frase curta do que está acontecendo, para a tela mostrar enquanto espera. */
export function descreverEtapa(nome: string, argsTexto: string) {
  let a: Record<string, unknown> = {}
  try {
    a = JSON.parse(argsTexto || '{}')
  } catch {}
  switch (nome) {
    case 'buscar_codigos':
      return `Procurando “${String(a.termo ?? '').slice(0, 40)}” na CNAE e nos municípios`
    case 'consultar_empresas':
      return 'Consultando as 628 mil empresas'
    case 'detalhar_empresa':
      return 'Abrindo a ficha da empresa'
    case 'listar_contadores':
      return 'Levantando os escritórios contábeis'
    default:
      return 'Consultando'
  }
}

export async function executarFerramenta(nome: string, argsTexto: string, ctx: Contexto): Promise<unknown> {
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
        ...(quer('setor') && { setores: procurar(o.setores, termo, 5) }),
        ...(quer('ramo') && { ramos: procurar(o.ramos, termo, 8) }),
        ...(quer('segmento') && { segmentos: procurar(o.segmentos, termo, 10) }),
        ...(quer('atividade') && { atividades: procurar(o.atividades, termo, 15) }),
        ...(quer('municipio') && { municipios: procurar(o.municipios, termo, 8) }),
        ...(quer('regiao') && { regioes: procurar(o.regioes, termo, 5) })
      }
    }

    case 'consultar_empresas':
    case 'buscar_empresas':
    case 'resumo_empresas': {
      const p = ArgsConsulta.safeParse(args)
      if (!p.success) return { erro: 'Filtros inválidos', detalhes: z.prettifyError(p.error) }
      const { filtros, ordem = 'score' } = p.data
      const a = await consultar(filtros, ordem, ctx)
      const r = a.resumo
      return {
        instrucao:
          'O USUÁRIO JÁ ESTÁ VENDO o painel com estes números, as distribuições e a tabela com contatos. Escreva só a ' +
          'legenda: 1 ou 2 frases (o total e o que você entendeu, mais um destaque se for útil). Sem listas, sem tabela, ' +
          'sem repetir números além de no máximo 2.',
        filtros_entendidos: a.rotulos,
        total: r.total.n,
        indicadores: {
          lucro_real: r.total.lucro_real,
          regime_recente: r.total.regime_recente,
          com_whatsapp: r.total.com_whatsapp,
          email_proprio: r.total.email_proprio,
          prioridade_a: r.total.prioridade_a
        },
        maiores_concentracoes: {
          setor: top(r, 'setor', 3),
          ramo: top(r, 'ramo', 3),
          regiao: top(r, 'regiao', 3),
          municipio: top(r, 'municipio', 3),
          porte: top(r, 'porte', 3)
        },
        primeiras_empresas: a.empresas.map((e, i) => `${i + 1}. ${e.razao_social} (CNPJ ${e.cnpj}, ${e.municipio})`)
      }
    }

    case 'detalhar_empresa': {
      const cnpj = String(args.cnpj ?? '').replace(/\D/g, '')
      if (cnpj.length !== 14) return { erro: 'CNPJ precisa ter 14 dígitos.' }
      const d = await obterEmpresa(cnpj)
      if (!d) return { erro: 'Empresa não encontrada na base (pode não ter ECF de Lucro Real/Presumido).' }
      const e = d.empresa
      const anexo = { tipo: 'empresa' as const, chave: `empresa:${cnpj}`, empresa: e }
      if (!ctx.anexos.some(a => a.chave === anexo.chave)) ctx.anexos.push(anexo)
      ctx.emitir({ tipo: 'anexo', anexo })
      return {
        instrucao: 'O USUÁRIO JÁ ESTÁ VENDO o cartão da empresa com todos os contatos. Responda em 1 a 3 frases exatamente o que foi pedido.',
        razao_social: e.razao_social,
        fantasia: e.nome_fantasia,
        cnpj: e.cnpj_formatado,
        atividade: `${e.cnae_fmt} ${e.atividade_principal}`,
        ramo: e.ramo,
        municipio: e.municipio,
        endereco: [e.endereco, e.bairro, e.municipio, e.cep].filter(Boolean).join(', '),
        porte: e.porte,
        capital_social: e.capital_social,
        abertura: e.data_abertura,
        regime: e.regime,
        situacao_regime: e.situacao_regime,
        simples_out2026: e.simples_out2026,
        prioridade: e.prioridade,
        score: e.score,
        whatsapp: e.whatsapp,
        telefone1: e.telefone1,
        telefone2: e.telefone2,
        email: e.email,
        email_tipo: e.email_tipo,
        empresas_com_o_mesmo_email: e.empresas_mesmo_email,
        atividades_secundarias: d.secundarias.map(s => `${s.cnae_fmt} ${s.atividade}`).slice(0, 15),
        outras_empresas_mesmo_email: d.mesmoEmail.map(o => o.razao_social)
      }
    }

    case 'listar_contadores': {
      const limite = Math.min(20, Math.max(1, Number(args.limite) || 10))
      const { itens, total } = await listarContadores(args.termo ? String(args.termo) : undefined, 1, limite)
      const anexo = { tipo: 'contadores' as const, chave: `contadores:${args.termo ?? ''}`, total, itens }
      ctx.anexos.push(anexo)
      ctx.emitir({ tipo: 'anexo', anexo })
      return {
        instrucao: 'O USUÁRIO JÁ ESTÁ VENDO a tabela. Escreva 1 ou 2 frases de leitura (quem se destaca e por quê).',
        total,
        contadores: itens.map(c => ({
          email: c.email, classificacao: c.classificacao, empresas: c.empresas, lucro_real: c.lucro_real,
          municipio: c.municipio_principal, setor: c.setor_principal
        }))
      }
    }

    default:
      return { erro: `Ferramenta desconhecida: ${nome}` }
  }
}

