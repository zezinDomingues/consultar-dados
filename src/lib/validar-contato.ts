// Validação dos dados de contato digitados em formulários públicos (site, consulta gratuita). Sem dependência de
// servidor: o mesmo código roda na API e no navegador. O public/site/site.js tem uma cópia em JavaScript puro —
// mudou aqui, mude lá também.

/** Mesma expressão do z.email() do zod 4 (a tela e a API recusam os mesmos e-mails). */
export const EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/

/** DDDs que existem no Brasil (Anatel). */
const DDDS = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(
    ' '
  )
)

/**
 * Telefone brasileiro com DDD → só dígitos (10 fixo, 11 celular), ou null se não for um número possível.
 * Aceita +55, 0 na frente, máscara e o celular antigo sem o 9 (que ganha o 9).
 */
export function foneBR(v: string): string | null {
  let d = v.replace(/\D/g, '')
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  if ((d.length === 11 || d.length === 12) && d.startsWith('0')) d = d.slice(1)
  if (d.length === 10 && /[6-9]/.test(d[2])) d = `${d.slice(0, 2)}9${d.slice(2)}`
  if (!DDDS.has(d.slice(0, 2))) return null
  if (d.length === 11 && d[2] !== '9') return null
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null
  if (d.length !== 10 && d.length !== 11) return null
  if (/^(\d)\1+$/.test(d.slice(2))) return null // 99999-9999, 0000-0000
  return d
}

/** (11) 98231-8575 / (11) 3333-4444 */
export function mascaraFone(digitos: string) {
  const d = digitos.slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

/**
 * CNPJ numérico ou alfanumérico (Receita, a partir de 07/2026: 12 caracteres 0-9/A-Z + 2 dígitos verificadores).
 * Devolve sem pontuação e em maiúsculas, ou null se o dígito verificador não bate.
 */
export function cnpjValido(v: string): string | null {
  const c = v.toUpperCase().replace(/[\s./-]/g, '')
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1+$/.test(c)) return null
  const dv = (n: number) => {
    const pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - n)
    let soma = 0
    for (let i = 0; i < n; i++) soma += (c.charCodeAt(i) - 48) * pesos[i]
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === +c[12] && dv(13) === +c[13] ? c : null
}

/** Começo de fórmula de planilha: = + - @ (tab e CR já saem no trim). */
export const comecaComFormula = (v: string) => /^[=+\-@]/.test(v)

/**
 * Tira caracteres de controle, de largura zero e de direção (que disfarçam o texto), normaliza e apara.
 * Numa linha só, junta os espaços; com `multilinha`, mantém as quebras (no máximo uma linha em branco seguida).
 */
export function limparTexto(v: string, multilinha = false) {
  let t = v.normalize('NFC').replace(/\r\n?/g, '\n')
  t = t.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
  t = multilinha ? t.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ')
  return t.trim()
}

/** Nome de pessoa: ao menos duas letras e nada de fórmula. */
export const nomeValido = (v: string) => /\p{L}.*\p{L}/u.test(v) && !comecaComFormula(v)
