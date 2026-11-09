// Contatos não vão para os provedores de IA (NVIDIA/Gemini na camada grátis: LGPD e contrato). A tela continua
// mostrando tudo (os anexos vêm do banco direto para o navegador); só o texto que segue para o modelo passa aqui.
//   • e-mail → referência opaca "[contato:ab12cd34]". O agente precisa dela para "os clientes deste contador";
//     só este servidor, nesta requisição, sabe trocar de volta (chave aleatória por requisição).
//   • telefone/WhatsApp → "[telefone]" (nenhuma ferramenta precisa dele).
import 'server-only'
import { createHmac, randomBytes } from 'node:crypto'

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
// (11) 98765-4321 · 11 3234 5678 · +55 11 98765-4321 — exige separador antes dos 4 últimos dígitos, para não pegar
// CNPJ (14 dígitos), capital social ou totais. Sem separador, só o que tem cara de celular (DDD + 9 + 8 dígitos,
// com ou sem 55) e o E.164 (+5511987654321).
const TELEFONE =
  /(?<![\d/.-])(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]\d{4}(?![\d/-])|\+55\d{10,11}(?!\d)|(?<!\d)(?:55)?[1-9]{2}9\d{8}(?!\d)/g
const REFERENCIA = /\[contato:([0-9a-f]{8})\]/g

export type Sigilo = {
  /** Texto livre (histórico, contexto da tela) que vai para o modelo: sem e-mail nem telefone. */
  ocultar: (texto: string) => string
  /** Resultado de ferramenta (montado sem contatos): só troca e-mails por referência. */
  ocultarEmails: (texto: string) => string
  /** Texto que volta do modelo (argumentos de ferramenta, resposta final): referência → e-mail de verdade. */
  revelar: (texto: string) => string
}

export function novoSigilo(): Sigilo {
  const chave = randomBytes(16)
  const mapa = new Map<string, string>()
  const referencia = (email: string) => {
    const id = createHmac('sha256', chave).update(email.toLowerCase()).digest('hex').slice(0, 8)
    mapa.set(id, email)
    return `[contato:${id}]`
  }
  const ocultarEmails = (texto: string) => texto.replace(EMAIL, referencia)
  return {
    ocultar: texto => ocultarEmails(texto).replace(TELEFONE, '[telefone]'),
    ocultarEmails,
    revelar: texto => texto.replace(REFERENCIA, (ref, id: string) => mapa.get(id) ?? ref)
  }
}
