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
    tipo: z.enum(['contato', 'parceiro'], { error: 'Tipo de formulário inválido.' }),
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
    // "Fale com um especialista" (/diagnostico): o CNPJ é obrigatório; a empresa é opcional.
    // O formulário da página inicial (site_contato_home) não tem o campo de CNPJ.
    if (d.tipo === 'contato' && d.origem.startsWith('site_contato') && !d.origem.startsWith('site_contato_home') && !d.cnpj) {
      ctx.addIssue({ code: 'custom', path: ['cnpj'], message: 'Informe o CNPJ da empresa.' })
    }
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

export type Resultado =
  | { tipo: 'ok' }
  | { tipo: 'invalido' }
  | { tipo: 'falha' }
  | { tipo: 'limite'; erro: string; segundos: number }

/** Motivos do limite que a 019 manda em error.details, com a mensagem e o Retry-After de cada um. */
const LIMITES: Record<string, { erro: string; segundos: number }> = {
  ip_10min: {
    erro: 'Recebemos muitos envios da sua conexão nos últimos minutos. Aguarde uns 10 minutos e envie de novo.',
    segundos: 600
  },
  sem_ip_hora: { erro: 'Recebemos muitos envios agora. Aguarde até 1 hora e envie de novo.', segundos: 3600 },
  ip_dia: { erro: 'Recebemos muitos envios da sua conexão hoje. Tente de novo amanhã.', segundos: 86400 },
  global_dia: { erro: 'Recebemos um volume muito alto de contatos hoje. Tente de novo amanhã.', segundos: 86400 }
}

/**
 * Lê a resposta da registrar_lead_site. Contrato da 019 (Segurança): sucesso = id (bigint); dado inválido =
 * P0001 (HTTP 400); limite = PT429 (HTTP 429) com o motivo em details (ip_10min, ip_dia, sem_ip_hora, global_dia).
 * Enquanto a 019 não está aplicada, a 002 avisa o limite com P0001 "muitos envios, tente mais tarde" — também é
 * limite. Qualquer outra coisa (rede, permissão, tempo esgotado) é falha. Nunca trata "não gravou" como sucesso.
 */
export function interpretarRegistro(data: unknown, error: PostgrestError | null, status: number): Resultado {
  if (error) {
    if (error.code === 'PT429' || status === 429 || (error.code === 'P0001' && /muitos envios/i.test(error.message))) {
      return { tipo: 'limite', ...(LIMITES[String(error.details ?? '').trim()] ?? LIMITES.ip_10min) }
    }
    return error.code === 'P0001' ? { tipo: 'invalido' } : { tipo: 'falha' }
  }
  const id = typeof data === 'number' || typeof data === 'string' || typeof data === 'bigint' ? Number(data) : NaN
  return id > 0 ? { tipo: 'ok' } : { tipo: 'falha' }
}
