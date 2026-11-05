// Textos dos disparos: modelos padrão, montagem com variáveis e variações, e a leitura das respostas.
// Funções puras — a tela de campanha usa as mesmas para a pré-visualização.
import type { Campanha } from './tipos'

/**
 * Modelos padrão de uma campanha nova (todos editáveis na tela).
 *
 * O texto diz que empresas como a dela COSTUMAM ter valores a recuperar — não afirma que ela tem. Além de ser o
 * que dá para sustentar antes da análise, mensagem fria prometendo "dinheiro do governo" é o formato dos golpes
 * que circulam no WhatsApp: quem recebe denuncia, e denúncia é o que derruba o número.
 */
export const MODELOS = {
  mensagem:
    '{saudacao}! {Tudo bem?|Como vai?} Aqui é da *OficialCert*, especialista em recuperação de créditos tributários.\n\n' +
    'Muitas empresas como a *{empresa}* pagam tributos a mais — PIS, COFINS, INSS e outros — e têm direito a ' +
    'receber esse dinheiro de volta do governo, corrigido pela Selic.\n\n' +
    'Fazemos uma *consulta gratuita e sem compromisso* para verificar se a sua empresa tem valores a restituir.\n\n' +
    '_Se não quiser mais receber mensagens, responda SAIR._',
  enquete_pergunta: 'Quer fazer a consulta gratuita?',
  opcao_sim: '✅ Sim, quero consultar',
  opcao_nao: 'Não tenho interesse',
  mensagem_sim:
    '{Ótimo|Perfeito}! 🙌 Para iniciarmos a consulta gratuita da *{empresa}*, preencha seus dados neste link ' +
    '(leva menos de 1 minuto):\n\n{link}\n\nAssim que recebermos, um especialista da OficialCert entra em contato.',
  mensagem_nao:
    'Tudo bem, obrigado pelo retorno! Não enviaremos mais mensagens. Se um dia quiser a consulta, é só responder aqui. 👋',
  mensagem_obrigado:
    'Recebemos seus dados, {primeiro_nome}! ✅ Um especialista da OficialCert vai analisar a *{empresa}* e falar ' +
    'com você em breve.'
} as const

export type CampanhaEditavel = Pick<
  Campanha,
  | 'nome'
  | 'ordem'
  | 'excluir_compartilhados'
  | 'usar_enquete'
  | 'mensagem'
  | 'enquete_pergunta'
  | 'opcao_sim'
  | 'opcao_nao'
  | 'mensagem_sim'
  | 'mensagem_nao'
  | 'mensagem_obrigado'
  | 'limite_total'
> & { id?: number }

/** Campanha nova já com os modelos padrão. */
export const campanhaPadrao = (nome: string): CampanhaEditavel => ({
  nome,
  ordem: 'score',
  excluir_compartilhados: true,
  usar_enquete: true,
  limite_total: null,
  ...MODELOS
})

/** Respostas fixas do robô (não variam por campanha). */
export const RESPOSTAS = {
  descadastro: 'Pronto, você não receberá mais mensagens da OficialCert. Desculpe o incômodo.',
  voto_ilegivel:
    'Recebi seu toque na enquete, mas não consegui ler a opção 😅\n\nSe quer a consulta gratuita, responda *SIM* ' +
    'aqui. Se não tem interesse, pode ignorar esta mensagem.',
  sem_enquete: 'Quer fazer a consulta gratuita? Responda *SIM* que eu te envio o link.'
} as const

export const VARIAVEIS = [
  { nome: '{empresa}', texto: 'nome da empresa (fantasia ou razão social)' },
  { nome: '{saudacao}', texto: 'Bom dia / Boa tarde / Boa noite' },
  { nome: '{municipio}', texto: 'cidade da empresa' },
  { nome: '{link}', texto: 'link do formulário (mensagem do "Sim")' },
  { nome: '{primeiro_nome}', texto: 'quem preencheu (mensagem de agradecimento)' }
] as const

export type Variaveis = Partial<Record<'empresa' | 'saudacao' | 'municipio' | 'link' | 'nome' | 'primeiro_nome', string>>

/**
 * Monta o texto: primeiro sorteia as variações `{a|b|c}` (o que tem barra), depois troca as variáveis `{empresa}`.
 * Mensagens idênticas para centenas de pessoas são um dos sinais que o WhatsApp usa para marcar spam.
 */
export function montar(modelo: string, vars: Variaveis, sorteio: () => number = Math.random) {
  let texto = modelo
  for (let i = 0; i < 20 && /\{[^{}]*\|[^{}]*\}/.test(texto); i++) {
    texto = texto.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opcoes: string) => {
      const lista = opcoes.split('|')
      return lista[Math.floor(sorteio() * lista.length)] ?? ''
    })
  }
  return texto.replace(/\{([a-z_]+)\}/g, (inteiro, nome: string) => {
    const v = vars[nome as keyof Variaveis]
    return v === undefined ? inteiro : v
  })
}

/** "Bom dia" / "Boa tarde" / "Boa noite" no horário de Brasília. */
export function saudacao(agora = new Date()) {
  const h = Number(
    new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(agora)
  )
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite'
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'por', 'com', 'a', 'o', 'as', 'os'])
const SUFIXOS = /\s+(LTDA\.?|EIRELI|S\/?A\.?|S\.A\.?|ME|EPP|SOCIEDADE SIMPLES|SS)$/i

/** Nome que soa humano: fantasia (ou razão social sem "LTDA"), em maiúsculas e minúsculas. */
export function nomeEmpresa(d: { nome_fantasia?: string | null; razao_social?: string | null }) {
  let nome = (d.nome_fantasia?.trim() || d.razao_social?.trim() || 'sua empresa').replace(/\s+/g, ' ')
  for (let i = 0; i < 3; i++) nome = nome.replace(SUFIXOS, '')
  if (nome !== nome.toUpperCase()) return nome // já veio com caixa mista: respeita
  return nome
    .toLowerCase()
    .split(' ')
    .map((p, i) => {
      if (i > 0 && MINUSCULAS.has(p)) return p
      if (/\d/.test(p) || (p.length <= 3 && !/[aeiouáéíóúâêôãõ]/.test(p))) return p.toUpperCase()
      return p.charAt(0).toUpperCase() + p.slice(1)
    })
    .join(' ')
}

export const primeiroNome = (nome: string) => {
  const p = nome.trim().split(/\s+/)[0] ?? ''
  return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()
}

/**
 * Telefone ou JID (`5511…@c.us`) → DDD + número, sem o 55, celular antigo ganha o 9 (o formato de
 * empresas.whatsapp e da chave do livro). null se não parecer telefone brasileiro.
 */
export function normalizarFone(v: string) {
  let x = v.replace(/@.*$/, '').replace(/\D/g, '')
  if ((x.length === 12 || x.length === 13) && x.startsWith('55')) x = x.slice(2)
  if (x.length === 10 && /[6-9]/.test(x[2])) x = `${x.slice(0, 2)}9${x.slice(2)}`
  return x.length === 10 || x.length === 11 ? x : null
}

/** (11) 98231-8575 */
export function fmtFone(t: string | null | undefined) {
  if (!t) return '—'
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`
  return t
}

/** Remove acentos, caixa e pontuação das pontas: "Não!!" → "nao". */
export function normalizar(texto: string) {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export type Intencao = 'sair' | 'sim' | 'nao' | 'outro'

// Sair: na dúvida, para — insistir com quem pediu para parar é o que gera denúncia.
const SAIR_INICIO = /^(sair|pare|parar|stop|cancelar|descadastrar|descadastre|remover|remova|me remova|me remove|me tira|me tire|bloquear)\b/
const SAIR_FRASE =
  /\b(sair da lista|nao quero receber|nao me mande|nao mande mais|para de mandar|parem de mandar|nao me envie|nao envie mais|remove meu numero|remover meu numero|spam|golpe)\b/
// Sim: palavra forte no começo ("sim, mas quanto custa?") ou a mensagem inteira curta ("pode", "ok").
const SIM_INICIO = /^(sim|quero|tenho interesse|claro|aceito|gostaria|com certeza|interessad[oa])\b/
const SIM_EXATO = /^(s|si|ss|pode|pode ser|pode mandar|manda|mande|ok|okay|blz|beleza|bora|vamos|por favor|1)$/
// Não: só a mensagem inteira ("não entendi" é pergunta, não recusa).
const NAO_EXATO =
  /^(nao|n|no|nao obrigado|nao obrigada|obrigado nao|obrigada nao|nao tenho interesse|sem interesse|nao quero|agora nao|nao preciso|nao obg|nao valeu|2)$/

/** O que a pessoa quis dizer com uma mensagem escrita. Na dúvida, "outro" (alguém da equipe lê). */
export function intencao(texto: string): Intencao {
  const t = normalizar(texto)
  if (!t) return 'outro'
  if (SAIR_INICIO.test(t) || SAIR_FRASE.test(t)) return 'sair'
  if (NAO_EXATO.test(t)) return 'nao'
  if (SIM_EXATO.test(t) || (t.length <= 80 && SIM_INICIO.test(t))) return 'sim'
  return 'outro'
}

const CORTESIA =
  /^(obrigad[oa]|muito obrigad[oa]|obrigad[oa] ok|ok obrigad[oa]|obg|brigad[oa]|valeu|vlw|ok|okay|blz|beleza|show|top|perfeito|otimo|certo|combinado|ta bom|ta|tudo bem|aguardo|fico no aguardo|boa tarde|bom dia|boa noite)$/

/** "Obrigado", "ok", 👍: agradecimento depois que a conversa já andou — ninguém precisa responder. */
export function cortesia(texto: string) {
  const t = normalizar(texto)
  return (t === '' && texto.trim() !== '') || CORTESIA.test(t)
}

/** Resposta curta e sem conteúdo além do sim/não: o robô resolve sozinho, sem chamar ninguém da equipe. */
export const respostaSimples = (texto: string) => normalizar(texto).length <= 20
