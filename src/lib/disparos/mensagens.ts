// Textos dos disparos: modelos padrão, montagem com variáveis e variações, e a leitura das respostas.
// Funções puras — a tela de campanha usa as mesmas para a pré-visualização.
import type { Campanha } from './tipos'

/**
 * Modelos padrão de uma campanha nova (todos editáveis na tela).
 *
 * Fluxo (05/11, desenho do usuário): 1ª mensagem com a logo + texto + UM botão → o robô pergunta nome completo e
 * CNPJ pela própria conversa → final com a logo + "em análise" + botão que abre o site.
 * O texto fala em "perfil para valores a serem restituídos" em vez de afirmar um valor antes da análise: mensagem
 * fria prometendo dinheiro do governo é o formato dos golpes no WhatsApp, e denúncia derruba o número.
 */
export const MODELOS = {
  mensagem:
    '{saudacao}! Aqui é da *{marca}*, especialista em recuperação de créditos tributários.\n\n' +
    'Identificamos que a *{empresa}* tem perfil para *valores a serem restituídos* pelo governo — tributos pagos ' +
    'a mais nos últimos 5 anos (PIS, COFINS, INSS e outros), devolvidos com correção pela Selic.\n\n' +
    'Deseja fazer uma *consulta gratuita* para saber quanto a sua empresa tem a receber?',
  rodape: 'Responda SAIR para não receber mais mensagens.',
  botao_texto: '✅ Quero a consulta',
  pergunta_nome: '{Ótimo|Perfeito}! 🙌 Vamos começar a sua consulta.\n\nQual é o seu *nome completo*?',
  pergunta_cnpj: 'Obrigado, {primeiro_nome}! Agora me informe o *CNPJ da empresa* que deseja consultar (só os números já servem).',
  pergunta_contato: 'Obrigado, {primeiro_nome}! Poderia nos informar um *número para entrarmos em contato*?',
  botao_mesmo_numero: 'Usar este número',
  botao_outro_numero: 'Informar outro',
  pergunta_telefone: 'Claro! Me envie o número com DDD, por favor. Ex.: (11) 98765-4321',
  mensagem_obrigado:
    'Pronto, {primeiro_nome}! ✅ Recebemos o seu pedido de consulta.\n\n' +
    'Nossa equipe já está analisando e vai entrar em contato pelo número *{telefone}* com o resultado.\n\n' +
    'Enquanto isso, conheça a {marca} e a nossa plataforma 👇',
  botao_site_texto: 'Acessar a plataforma',
  mensagem_nao:
    'Tudo bem, obrigado pelo retorno! Não enviaremos mais mensagens. Se um dia quiser a consulta, é só responder aqui. 👋',
  // formato antigo (enquete) — fica para compatibilidade
  enquete_pergunta: 'Quer fazer a consulta gratuita?',
  opcao_sim: '✅ Sim, quero consultar',
  opcao_nao: 'Não tenho interesse',
  mensagem_sim: '{Ótimo|Perfeito}! 🙌 Vamos começar a sua consulta.\n\nQual é o seu *nome completo*?'
} as const

/** Modelo de um grupo de SÓ DIVULGAÇÃO: logo + texto + link (sem perguntas). */
export const MODELO_DIVULGACAO = {
  mensagem:
    '{saudacao}! Aqui é da *{marca}*. 👋\n\n' +
    'Escreva aqui a oferta: o que a {empresa} ganha, em uma ou duas frases.\n\n' +
    'Conheça os detalhes no link abaixo 👇',
  rodape: 'Responda SAIR para não receber mais mensagens.',
  botao_site_texto: 'Conhecer',
  mensagem_nao: 'Tudo bem, obrigado pelo retorno! Não enviaremos mais mensagens. 👋'
} as const

/** Logo enviada no alto da 1ª e da última mensagem (precisa ser um endereço público: o WAHA baixa a imagem). */
export const imagemPadrao = (base: string) => `${base.replace(/\/+$/, '')}/site/marca/whatsapp-logo.jpg`

export type CampanhaEditavel = Pick<
  Campanha,
  | 'nome'
  | 'ordem'
  | 'excluir_compartilhados'
  | 'formato'
  | 'imagem_url'
  | 'mensagem'
  | 'rodape'
  | 'botao_texto'
  | 'pergunta_nome'
  | 'pergunta_contato'
  | 'botao_mesmo_numero'
  | 'botao_outro_numero'
  | 'pergunta_telefone'
  | 'mensagem_obrigado'
  | 'botao_site_texto'
  | 'site_url'
  | 'mensagem_nao'
  | 'limite_total'
> & { id?: number }

/** Campanha nova já com os modelos padrão. `base` = endereço público do site (APP_URL). */
export const campanhaPadrao = (nome: string, base: string): CampanhaEditavel => ({
  nome,
  ordem: 'score',
  excluir_compartilhados: true,
  // desde 06/11/2026 só Z-API, onde os botões aparecem: campanha nova já nasce com botões
  formato: 'botao',
  imagem_url: imagemPadrao(base),
  limite_total: null,
  site_url: base.replace(/\/+$/, ''),
  mensagem: MODELOS.mensagem,
  rodape: MODELOS.rodape,
  botao_texto: MODELOS.botao_texto,
  pergunta_nome: MODELOS.pergunta_nome,
  pergunta_contato: MODELOS.pergunta_contato,
  botao_mesmo_numero: MODELOS.botao_mesmo_numero,
  botao_outro_numero: MODELOS.botao_outro_numero,
  pergunta_telefone: MODELOS.pergunta_telefone,
  mensagem_obrigado: MODELOS.mensagem_obrigado,
  botao_site_texto: MODELOS.botao_site_texto,
  mensagem_nao: MODELOS.mensagem_nao
})

/** Respostas fixas do robô (não variam por campanha). */
export const RESPOSTAS = {
  descadastro: (marca: string) => `Pronto, você não receberá mais mensagens da ${marca}. Desculpe o incômodo.`,
  voto_ilegivel:
    'Recebi seu toque na enquete, mas não consegui ler a opção 😅\n\nSe quer a consulta gratuita, responda *SIM* ' +
    'aqui. Se não tem interesse, pode ignorar esta mensagem.',
  sem_botao: 'Responda *SIM* para fazer a sua consulta.',
  nome_invalido: 'Pode me dizer o seu *nome completo*, por favor? (nome e sobrenome)',
  cnpj_invalido: 'Esse CNPJ não parece válido 🤔 Confira e me envie os 14 números, por favor.',
  telefone_invalido: 'Não consegui entender o número 🤔 Me envie com DDD, por favor. Ex.: (11) 98765-4321',
  contato_sem_botao: (fone: string) => `Responda *1* para usar este número (${fone}) ou *2* para informar outro.`,
  desistiu_da_coleta: (marca: string) => `Sem problemas! Um especialista da ${marca} vai falar com você por aqui para confirmar os dados. 🙂`
} as const

export const VARIAVEIS = [
  { nome: '{marca}', texto: 'nome do grupo (quem está falando)' },
  { nome: '{empresa}', texto: 'nome da empresa contatada' },
  { nome: '{saudacao}', texto: 'Bom dia / Boa tarde / Boa noite' },
  { nome: '{municipio}', texto: 'cidade da empresa' },
  { nome: '{primeiro_nome}', texto: 'primeiro nome informado (depois do nome)' },
  { nome: '{telefone}', texto: 'número de contato escolhido (mensagem final)' }
] as const

export type Variaveis = Partial<
  Record<'marca' | 'empresa' | 'saudacao' | 'municipio' | 'link' | 'nome' | 'primeiro_nome' | 'cnpj' | 'telefone', string>
>

/** Dígitos verificadores do CNPJ. */
export function cnpjValido(v: string) {
  const d = v.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const dv = (n: number) => {
    let soma = 0
    let peso = n - 7
    for (let i = 0; i < n; i++) {
      soma += Number(d[i]) * peso--
      if (peso < 2) peso = 9
    }
    const r = soma % 11
    return r < 2 ? 0 : 11 - r
  }
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13])
}

export const fmtCnpj = (c: string | null | undefined) =>
  !c ? '—' : c.length === 14 ? `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}` : c

/** "joão  DA silva" → "João da Silva"; null se não parecer nome completo (2+ palavras, só letras). */
export function nomeCompleto(texto: string) {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (t.length < 5 || t.length > 120 || /[\d@#$%&*=+<>{}[\]\\/|_]/.test(t)) return null
  const partes = t.split(' ').filter(p => /\p{L}/u.test(p))
  if (partes.length < 2) return null
  const pequenas = new Set(['da', 'de', 'do', 'das', 'dos', 'e'])
  return partes
    .map((p, i) => (i > 0 && pequenas.has(p.toLowerCase()) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ')
}

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
