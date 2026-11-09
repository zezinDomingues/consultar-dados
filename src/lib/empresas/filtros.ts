// Filtros da consulta de empresas.
// Este schema é o contrato único: a tela monta a URL a partir dele, o servidor
// valida com ele e, no futuro, o agente de IA vai recebê-lo como a ferramenta
// "buscar_empresas" (as descrições abaixo viram a documentação da ferramenta).
import { z } from 'zod'
import { ROTAS } from '@/lib/rotas'

/** Médio × Grande não existe na Receita (lá é só "Demais"): Grande = capital social >= R$ 10 mi (migração 018). */
export const PORTES = ['Microempresa', 'Empresa de pequeno porte', 'Médio porte', 'Grande porte'] as const
export const REGIMES = ['Lucro Real', 'Lucro Presumido', 'Tributação mista'] as const
export const SITUACOES = ['Recente (ECF 2024)', 'ECF 2023', 'Antigo (ECF ≤ 2022)', 'Hoje no Simples'] as const
export const LOCALIZACOES = ['Capital', 'Região metropolitana', 'Litoral', 'Interior'] as const
/** Siglas aceitas no filtro de estado (a base recebe os estados aos poucos; as opções vêm do banco). */
// prettier-ignore
export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const
export const PRIORIDADES = ['A', 'B', 'C', 'D'] as const
export const TIPOS_NEGOCIO = [
  'Operacional',
  'Holding / patrimonial',
  'SPE (propósito específico)',
  'Empresário individual'
] as const

/** Valor antigo (antes da 018): links e consultas salvas com ele viram Médio + Grande. */
const PORTE_ANTIGO = 'Demais (médio/grande)'

const lista = (descricao: string) => z.array(z.string().min(1).max(120)).max(700).optional().describe(descricao)
const inteiro = (descricao: string) => z.number().int().min(0).max(1000).optional().describe(descricao)

export const FiltrosSchema = z.object({
  q: z.string().trim().min(1).max(120).optional()
    .describe('Texto na razão social ou nome fantasia, ou um CNPJ (completo ou só a raiz de 8 dígitos)'),
  setores: lista('Setores = letra da seção CNAE. Ex.: ["G"] comércio, ["C"] indústria, ["Q"] saúde, ["F"] construção'),
  ramos: lista('Ramos = divisão CNAE (2 dígitos). Ex.: ["47"] comércio varejista, ["86"] atenção à saúde'),
  segmentos: lista('Segmentos = grupo CNAE (3 dígitos). Ex.: ["477"] farmácias, perfumarias e óticas'),
  cnaes: lista('Atividade principal = subclasse CNAE (7 dígitos). Ex.: ["4771702"] farmácia de manipulação'),
  cnae_secundario: z.string().regex(/^\d{4,7}$/).optional()
    .describe('Código CNAE (4 a 7 dígitos) que a empresa tem como atividade SECUNDÁRIA'),
  ufs: z.array(z.enum(UFS)).optional().describe('Estados (sigla). Ex.: ["SP"], ["BA", "MG"]'),
  municipios: lista('Municípios com acento, como "Nome" (qualquer estado) ou "Nome/UF". Ex.: ["Campinas"], ["Salvador/BA"]'),
  regioes: lista('Regiões intermediárias do IBGE. Ex.: ["Campinas", "Ribeirão Preto", "Belo Horizonte", "Salvador"]'),
  localizacoes: z.array(z.enum(LOCALIZACOES)).optional()
    .describe('Capital do estado, região metropolitana da capital (Grande SP, Grande BH, Grande Salvador…), litoral (só SP) ou interior'),
  portes: z.array(z.enum(PORTES)).optional()
    .describe('Porte: ME e EPP da Receita; "Médio porte" e "Grande porte" dividem o "Demais" da Receita pelo capital social (grande = a partir de R$ 10 milhões)'),
  regimes: z.array(z.enum(REGIMES)).optional().describe('Regime declarado na ECF (histórico, 2016–2024)'),
  situacoes_regime: z.array(z.enum(SITUACOES)).optional()
    .describe('Quão atual é o regime: "Recente (ECF 2024)" é o mais confiável; "Hoje no Simples" saiu do LR/LP'),
  prioridades: z.array(z.enum(PRIORIDADES)).optional().describe('Prioridade de prospecção pelo score (A é a melhor)'),
  tipos_negocio: z.array(z.enum(TIPOS_NEGOCIO)).optional().describe('Operacional, holding/patrimonial, SPE ou empresário individual'),
  capital_min: z.number().min(0).optional().describe('Capital social mínimo em reais'),
  capital_max: z.number().min(0).optional().describe('Capital social máximo em reais'),
  idade_min: inteiro('Idade mínima da empresa, em anos'),
  idade_max: inteiro('Idade máxima da empresa, em anos'),
  estab_min: inteiro('Mínimo de estabelecimentos (matriz + filiais) no estado'),
  com_whatsapp: z.boolean().optional().describe('Só empresas com celular válido (WhatsApp provável)'),
  com_email: z.boolean().optional().describe('Só empresas com e-mail válido'),
  contato_proprio: z.boolean().optional()
    .describe('Só e-mail da própria empresa (exclui e-mail de contador e e-mails compartilhados)'),
  email: z.string().trim().min(3).max(200).optional().describe('E-mail exato (ex.: para listar os clientes de um contador)')
})

export type Filtros = z.infer<typeof FiltrosSchema>
export type ChaveFiltro = keyof Filtros

export const ORDENS = {
  score: 'Melhor prioridade',
  capital: 'Maior capital social',
  antigas: 'Mais antigas',
  novas: 'Mais novas',
  nome: 'Razão social (A–Z)'
} as const
export type Ordem = keyof typeof ORDENS

export const POR_PAGINA = [25, 50, 100] as const

/** Máximo de linhas por exportação CSV. */
export const LIMITE_EXPORTACAO = 20_000

export type Consulta = { filtros: Filtros; ordem: Ordem; pagina: number; por: number }

const LISTAS = [
  'setores', 'ramos', 'segmentos', 'cnaes', 'ufs', 'municipios', 'regioes', 'localizacoes', 'portes', 'regimes',
  'situacoes_regime', 'prioridades', 'tipos_negocio'
] as const satisfies readonly ChaveFiltro[]
const NUMEROS = ['capital_min', 'capital_max', 'idade_min', 'idade_max', 'estab_min'] as const satisfies readonly ChaveFiltro[]
const BOOLEANOS = ['com_whatsapp', 'com_email', 'contato_proprio'] as const satisfies readonly ChaveFiltro[]
const TEXTOS = ['q', 'cnae_secundario', 'email'] as const satisfies readonly ChaveFiltro[]

/** Lê a consulta de qualquer fonte chave→valor (URL, searchParams). Filtro inválido é ignorado, não quebra a página. */
export function lerConsulta(get: (chave: string) => string | null | undefined): Consulta {
  const bruto: Record<string, unknown> = {}
  for (const k of LISTAS) {
    const v = get(k)
    if (v) bruto[k] = v.split(',').map(s => s.trim()).filter(Boolean)
  }
  if (Array.isArray(bruto.portes) && bruto.portes.includes(PORTE_ANTIGO)) {
    bruto.portes = [...new Set(bruto.portes.flatMap(p => (p === PORTE_ANTIGO ? ['Médio porte', 'Grande porte'] : [p])))]
  }
  for (const k of NUMEROS) {
    const v = get(k)?.trim()
    if (v) {
      const n = Number(v)
      if (Number.isFinite(n)) bruto[k] = n
    }
  }
  for (const k of BOOLEANOS) {
    const v = get(k)
    if (v === '1' || v === 'true') bruto[k] = true
  }
  for (const k of TEXTOS) {
    const v = get(k)?.trim()
    if (v) bruto[k] = v
  }

  const filtros: Record<string, unknown> = {}
  const shape = FiltrosSchema.shape as Record<string, z.ZodType>
  for (const [k, v] of Object.entries(bruto)) {
    const r = shape[k].safeParse(v)
    if (r.success && r.data !== undefined) filtros[k] = r.data
  }

  const o = get('ordem')
  const ordem = (o && o in ORDENS ? o : 'score') as Ordem
  const pagina = Math.min(10000, Math.max(1, parseInt(get('pagina') ?? '1', 10) || 1))
  const p = parseInt(get('por') ?? '50', 10)
  const por = (POR_PAGINA as readonly number[]).includes(p) ? p : 50

  return { filtros: filtros as Filtros, ordem, pagina, por }
}

export function lerDeSearchParams(sp: Record<string, string | string[] | undefined>) {
  return lerConsulta(k => {
    const v = sp[k]
    return Array.isArray(v) ? v[0] : v
  })
}

export function paraQuery(c: { filtros: Filtros; ordem?: Ordem; pagina?: number; por?: number }) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(c.filtros)) {
    if (v === undefined || v === null || v === '' || v === false) continue
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','))
    } else if (v === true) p.set(k, '1')
    else p.set(k, String(v))
  }
  if (c.ordem && c.ordem !== 'score') p.set('ordem', c.ordem)
  if (c.por && c.por !== 50) p.set('por', String(c.por))
  if (c.pagina && c.pagina > 1) p.set('pagina', String(c.pagina))
  return p.toString()
}

export function hrefConsulta(c: { filtros: Filtros; ordem?: Ordem; pagina?: number; por?: number }) {
  const q = paraQuery(c)
  return q ? `${ROTAS.dashboard}?${q}` : ROTAS.dashboard
}

export function contarFiltros(f: Filtros) {
  return Object.values(f).filter(v => (Array.isArray(v) ? v.length > 0 : v !== undefined && v !== false && v !== ''))
    .length
}

/** Liga/desliga um valor numa lista de filtro; lista vazia vira undefined (= sem filtro). */
export function alternar<T extends string>(arr: readonly T[] | undefined, valor: T): T[] | undefined {
  const s = new Set(arr ?? [])
  if (s.has(valor)) s.delete(valor)
  else s.add(valor)
  return s.size ? [...s] : undefined
}
