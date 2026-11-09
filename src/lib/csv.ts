// CSV para o Excel em português (";" + BOM) sem injeção de fórmula: texto vindo de fora (resposta de WhatsApp,
// formulário do site, cadastro da Receita) que comece com = + - @ tab ou CR ganha um apóstrofo na frente, e o
// Excel/LibreOffice mostram como texto em vez de executar. Números de verdade (123, -5, 1.234,56) passam intactos.

export const BOM = '﻿'

const FORMULA = /^[=+\-@\t\r]|^\s+[=+\-@]/
const NUMERO = /^[+-]?\d+([.,]\d+)*$/

export function celula(v: unknown): string {
  if (v === null || v === undefined) return ''
  let s = typeof v === 'string' ? v : String(v)
  if (typeof v === 'string' && FORMULA.test(s) && !NUMERO.test(s.trim())) s = `'${s}`
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const linha = (valores: readonly unknown[]) => valores.map(celula).join(';')

/** Última linha do arquivo quando o limite cortou o resultado. `total` desconhecido → só o limite. */
export function avisoCorte(limite: number, total?: number | null) {
  const n = limite.toLocaleString('pt-BR')
  const de = total && total > limite ? ` de ${total.toLocaleString('pt-BR')}` : ''
  return celula(`Arquivo limitado a ${n}${de} linhas — refine os filtros para baixar o restante.`)
}

export function respostaCsv(linhas: readonly string[], arquivo: string) {
  return new Response(BOM + linhas.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${arquivo.replace(/[^\w.-]/g, '_')}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  })
}
