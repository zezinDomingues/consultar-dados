// Formulários do site institucional → leads_site: validação dos campos e leitura da resposta da função
// registrar_lead_site. Puro (sem servidor), para a API e os testes usarem o mesmo código.
import type { PostgrestError } from '@supabase/supabase-js'
import { z } from 'zod'
import { cnpjValido, comecaComFormula, EMAIL, foneBR, limparTexto, nomeValido } from '@/lib/validar-contato'

/** Segmentos que o site manda: os 6 da página Segmentos (?segmento= do diagnóstico) e os do formulário de parceiro. */
export const SEGMENTOS_CONTATO = ['varejo', 'industria', 'agro', 'servicos', 'ecommerce', 'terceiro-setor'] as const
export const SEGMENTOS_PARCEIRO = ['contabilidade', 'advocacia', 'consultoria', 'financeiro', 'outro'] as const
export const MAX_CORPO = 20_000

const linha = (max: number) =>
  z
    .string('Texto inválido.')
    .max(max * 2, `Use no máximo ${max} caracteres.`)
    .optional()
    .default('')
    .transform(v => limparTexto(v))
    .pipe(z.string().max(max, `Use no máximo ${max} caracteres.`))
const semFormula = (v: string) => !comecaComFormula(v)

export const LeadSite = z
  .object({
    tipo: z.enum(['contato', 'parceiro']),
    origem: linha(60).transform(v => (/^[a-z_]{1,60}$/.test(v) ? v : '')),
    pagina: linha(200).transform(v => (/^\/[\w\-/]{0,199}$/.test(v) ? v : '')),
    nome: linha(120)
      .refine(v => v.length > 0, 'Informe seu nome.')
      .refine(v => !v || nomeValido(v), 'Digite um nome válido (sem = + - @ no começo).'),
    empresa: linha(160).refine(semFormula, 'O nome da empresa não pode começar com = + - @.'),
    cnpj: linha(30).transform((v, ctx) => {
      if (!v) return ''
      const c = cnpjValido(v)
      if (!c) ctx.addIssue({ code: 'custom', message: 'CNPJ inválido: confira os 14 caracteres.' })
      return c ?? ''
    }),
    email: linha(160)
      .transform(v => v.toLowerCase())
      .refine(v => v.length > 0, 'Informe seu e-mail.')
      .refine(v => !v || (EMAIL.test(v) && semFormula(v)), 'E-mail inválido.'),
    whatsapp: linha(40).transform((v, ctx) => {
      const f = foneBR(v)
      if (!f) ctx.addIssue({ code: 'custom', message: v ? 'WhatsApp inválido: use DDD + número.' : 'Informe seu WhatsApp.' })
      return f ?? ''
    }),
    mensagem: z
      .string('Texto inválido.')
      .max(8000, 'Use no máximo 2.000 caracteres.')
      .optional()
      .default('')
      .transform(v => limparTexto(v, true))
      .pipe(z.string().max(2000, 'Use no máximo 2.000 caracteres.')),
    segmento: linha(40)
  })
  .superRefine((d, ctx) => {
    if (d.tipo === 'parceiro') {
      if (!d.empresa) ctx.addIssue({ code: 'custom', path: ['empresa'], message: 'Informe a empresa ou o escritório.' })
      if (!(SEGMENTOS_PARCEIRO as readonly string[]).includes(d.segmento)) {
        ctx.addIssue({ code: 'custom', path: ['segmento'], message: 'Escolha o seu segmento de atuação.' })
      }
    }
  })
  // segmento desconhecido no contato (URL mexida) não derruba o envio: só não é gravado
  .transform(d =>
    d.tipo === 'contato' && !(SEGMENTOS_CONTATO as readonly string[]).includes(d.segmento) ? { ...d, segmento: '' } : d
  )

export type Resultado = 'ok' | 'limite' | 'invalido' | 'falha'

/**
 * Lê a resposta da registrar_lead_site de forma tolerante, porque o contrato está mudando (019, Segurança):
 * hoje devolve o id (bigint) e avisa o limite com `raise exception 'muitos envios…'` (P0001); o esperado é um
 * erro com SQLSTATE PT429 (o PostgREST responde HTTP 429). Também aceita um retorno { limite: true } / null.
 */
export function interpretarRegistro(data: unknown, error: PostgrestError | null, status: number): Resultado {
  if (error) {
    const texto = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`
    if (status === 429 || error.code === 'PT429' || /muitos envios|limite|too many|rate limit/i.test(texto)) return 'limite'
    if (/^2[23]/.test(error.code ?? '') || /obrigat|muito long|inv[aá]lid/i.test(texto)) return 'invalido'
    return 'falha'
  }
  if (typeof data === 'number' || typeof data === 'string' || typeof data === 'bigint') return Number(data) > 0 ? 'ok' : 'limite'
  if (data === true) return 'ok'
  if (data && typeof data === 'object') {
    const o = data as Record<string, unknown>
    if (o.limite || o.limitado || o.bloqueado || /limite/i.test(String(o.motivo ?? o.erro ?? ''))) return 'limite'
    return o.ok === true || Number(o.id) > 0 ? 'ok' : 'falha'
  }
  return 'limite' // null/false sem erro: a função não gravou — tratado como limite (nunca como sucesso)
}
