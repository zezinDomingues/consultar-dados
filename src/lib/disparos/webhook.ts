// O que o WhatsApp devolve (webhook do WAHA / Z-API traduzido): confirmação de entrega/leitura, voto na enquete,
// mensagens escritas e o estado da sessão. Atualiza o livro na hora; as RESPOSTAS ao contato (que levam segundos por
// causa do "digitando…") vão para `depois`, que a rota executa após devolver 200 ao provedor.
//
// Garantias (QA rodada 1):
// - anti-repetição sem perder resposta: o evento recebido é gravado antes (para dois reenvios simultâneos não
//   processarem duas vezes) e APAGADO se o processamento falhar — a rota devolve 500, o provedor reenvia, e o reenvio
//   é processado de novo. Erro do banco nunca vira "não está no livro" com 200.
// - duas mensagens seguidas da mesma pessoa: cada mensagem decide em cima do disparo que leu e grava com UPDATE
//   condicional pela versão (`atualizado_em`). Se outra mensagem gravou antes, relê e decide de novo — a 2ª nunca
//   grava por cima da 1ª com a etapa velha, e o contador de respostas não perde incremento.
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import {
  cortesia,
  fmtFone,
  intencao,
  montar,
  nomeCompleto,
  nomeEmpresa,
  normalizar,
  normalizarFone as foneDoJid,
  primeiroNome,
  RESPOSTAS,
  respostaSimples,
  saudacao
} from './mensagens'
import {
  canalDe,
  carregarCampanha,
  carregarNumeroDoGrupo,
  comFormatoDoNumero,
  desfazerEvento,
  mensagemFinal,
  registrarEvento,
  reivindicarEvento,
  responder
} from './motor'
import type { Campanha, Disparo, NumeroComChave } from './tipos'
import type { MensagemRica } from './waha'
import { chaveDoId, telefoneDoLid } from './waha'

export type EventoWaha = { event?: string; session?: string; timestamp?: number; payload?: Record<string, unknown> | null }
export type Depois = (tarefa: () => Promise<unknown>) => void

const agora = () => new Date().toISOString()
const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const idSerial = (v: unknown) => (typeof v === 'string' ? v : texto((v as { _serialized?: unknown } | null)?._serialized))
/** Emoji às vezes vem com o seletor de variação (U+FE0F), às vezes sem: compara sem ele. */
const opcaoIgual = (a: string, b: string) => normalizar(a.replace(/️/g, '')) === normalizar(b.replace(/️/g, ''))

/** Texto que a pessoa mandou — ou o do botão que ela tocou (o NOWEB entrega em lugares diferentes). */
function textoRecebido(p: Record<string, unknown>) {
  const corpo = texto(p.body).trim()
  if (corpo) return corpo
  const m = ((p._data as { message?: Record<string, unknown> } | undefined)?.message ?? {}) as Record<string, Record<string, unknown> | undefined>
  const candidatos = [
    m.buttonsResponseMessage?.selectedDisplayText,
    m.templateButtonReplyMessage?.selectedDisplayText,
    (m.interactiveResponseMessage?.body as { text?: unknown } | undefined)?.text
  ]
  const achado = candidatos.find(v => typeof v === 'string' && v.trim())
  if (achado) return String(achado).trim()
  // nativeFlow: o id do botão vem num JSON
  const params = texto((m.interactiveResponseMessage?.nativeFlowResponseMessage as { paramsJson?: unknown } | undefined)?.paramsJson)
  try {
    const j = JSON.parse(params) as { id?: string; display_text?: string }
    return (j.display_text ?? j.id ?? '').trim()
  } catch {
    return ''
  }
}

type Busca = { coluna: 'telefone' | 'lid' | 'enquete_id' | 'chat_id'; valores: string[] }

/** Contato mais recente com aquele valor (opcionalmente só de um número ou de um grupo). Erro do banco SOBE. */
async function disparoPor(b: Busca, onde: { numero?: number; grupo?: number } = {}) {
  let q = supabaseAdmin().from('disparos').select('*')
  q = b.valores.length === 1 ? q.eq(b.coluna, b.valores[0]) : q.in(b.coluna, b.valores)
  if (onde.numero) q = q.eq('numero_id', onde.numero)
  if (onde.grupo) q = q.eq('grupo_id', onde.grupo)
  const { data, error } = await q.order('criado_em', { ascending: false }).limit(1)
  if (error) throw new Error(`livro (${b.coluna}): ${error.message}`)
  return ((data as Disparo[] | null)?.[0] as Disparo | undefined) ?? null
}

/**
 * Quem é esta pessoa no livro. O mesmo telefone pode estar em grupos diferentes ("nunca 2 vezes" é por grupo):
 * 1º o contato que ESTE número fez (vale mesmo se o número mudou de grupo depois), 2º o do grupo atual do número,
 * 3º (sem número conhecido) o contato mais recente.
 */
async function acharContato(buscas: Busca[], numero: NumeroComChave | null) {
  const escopos: { numero?: number; grupo?: number }[] = numero ? [{ numero: numero.id }, { grupo: numero.grupo_id }] : [{}]
  for (const onde of escopos) {
    for (const b of buscas) {
      if (!b.valores.length) continue
      const d = await disparoPor(b, onde)
      if (d) return d
    }
  }
  return null
}

async function recarregar(id: number) {
  const { data, error } = await supabaseAdmin().from('disparos').select('*').eq('id', id).single()
  if (error) throw new Error(`disparo ${id}: ${error.message}`)
  return data as Disparo
}

/** UPDATE condicional pela versão lida. false = outra mensagem gravou antes (reler e decidir de novo). */
async function gravarSeNaoMudou(d: Disparo, campos: Partial<Disparo>) {
  const { data, error } = await supabaseAdmin()
    .from('disparos')
    .update({ ...campos, atualizado_em: agora() })
    .eq('id', d.id)
    .eq('atualizado_em', d.atualizado_em)
    .select('id')
  if (error) throw new Error(`gravar disparo ${d.id}: ${error.message}`)
  return (data?.length ?? 0) > 0
}

/** O que fazer com uma mensagem/voto. Decidido sem efeito colateral: pode ser recalculado numa nova tentativa. */
type Passo = {
  resultado: string
  /** gravado com a versão lida */
  campos?: Partial<Disparo>
  /** precisa dar certo ANTES de gravar (ex.: o bloqueio do SAIR — LGPD). Idempotente. */
  antes?: () => Promise<void>
  /** registro complementar depois de gravar (falha só vai para o log) */
  registro?: () => Promise<unknown>
  /** resposta ao contato (sai depois do 200) */
  resposta?: string | MensagemRica
}

async function aplicar(inicial: Disparo, decidir: (d: Disparo) => Passo, n: NumeroComChave | null, depois: Depois) {
  let d = inicial
  for (let tentativa = 0; tentativa < 6; tentativa++) {
    const passo = decidir(d)
    if (passo.antes) await passo.antes()
    if (passo.campos && Object.keys(passo.campos).length && !(await gravarSeNaoMudou(d, passo.campos))) {
      d = await recarregar(d.id)
      continue
    }
    const atual = { ...d, ...passo.campos }
    if (passo.resposta && n) {
      const resposta = passo.resposta
      depois(() => responder(atual, n, resposta))
    }
    if (passo.registro) await passo.registro().catch(e => console.error('[webhook] registro', d.id, e))
    return passo.resultado
  }
  throw new Error(`disparo ${inicial.id}: a conversa mudou ${6} vezes seguidas — o provedor reenvia`)
}

/** Processa com o evento já reivindicado; se falhar, desfaz o registro para o reenvio ser processado. */
async function comDesfazer<T>(evento: number, tarefa: () => Promise<T>) {
  try {
    return await tarefa()
  } catch (e) {
    await desfazerEvento(evento)
    throw e
  }
}

/**
 * O número que fez o contato é quem responde (a pessoa está conversando com ele) — desde que seja do grupo do
 * contato. O número que recebeu a mensagem também serve se for do grupo, ou se foi ele mesmo que fez o contato.
 */
async function numeroDoDisparo(d: Disparo, recebeu: NumeroComChave | null) {
  if (d.numero_id && d.numero_id !== recebeu?.id) {
    const n = await carregarNumeroDoGrupo(d.numero_id, d.grupo_id)
    if (n) return n
  }
  if (recebeu && (recebeu.grupo_id === d.grupo_id || recebeu.id === d.numero_id)) return recebeu
  return null
}

export async function processarEvento(ev: EventoWaha, numero: NumeroComChave | null, depois: Depois) {
  const db = supabaseAdmin()
  const p = ev.payload ?? {}
  if (numero) {
    const { error } = await db.from('disparo_numeros').update({ ultimo_evento_em: agora() }).eq('id', numero.id)
    if (error) console.error('[webhook] último evento', numero.id, error.message)
  }

  switch (ev.event) {
    case 'session.status': {
      // STARTING é passageiro: o WhatsApp derruba a conexão de vez em quando (stream 503) e o WAHA reconecta em
      // segundos. Gravar esse estado deixava o painel acusando "não conectado" com a sessão já de volta.
      if (numero && texto(p.status) !== 'STARTING') {
        const status = texto(p.status) || 'DESCONHECIDO'
        const { error } = await db
          .from('disparo_numeros')
          .update({ status, status_em: agora(), status_detalhe: status === 'WORKING' ? null : 'avisado pelo provedor' })
          .eq('id', numero.id)
        if (error) throw new Error(`status do número: ${error.message}`)
      }
      return 'status'
    }

    case 'message.ack': {
      if (p.fromMe === false) return 'ack de mensagem recebida'
      const chave = chaveDoId(idSerial(p.id))
      const ack = Number(p.ack)
      if (!chave || !/^[A-Za-z0-9]+$/.test(chave) || !(ack >= 2)) return 'ack ignorado'
      const filtro = `msg_id.eq.${chave},enquete_id.eq.${chave}`
      const e1 = await db.from('disparos').update({ entregue_em: agora(), atualizado_em: agora() }).or(filtro).is('entregue_em', null)
      if (e1.error) throw new Error(`ack: ${e1.error.message}`)
      if (ack >= 3) {
        const e2 = await db.from('disparos').update({ lido_em: agora(), atualizado_em: agora() }).or(filtro).is('lido_em', null)
        if (e2.error) throw new Error(`ack: ${e2.error.message}`)
      }
      return 'ack'
    }

    case 'poll.vote':
    case 'poll.vote.failed': {
      const voto = (p.vote ?? {}) as Record<string, unknown>
      const enquete = (p.poll ?? {}) as Record<string, unknown>
      const chave = chaveDoId(idSerial(enquete.id))
      const d = chave ? await disparoPor({ coluna: 'enquete_id', valores: [chave] }) : null
      if (!d) return 'voto sem disparo'
      const opcoes = Array.isArray(voto.selectedOptions) ? (voto.selectedOptions as unknown[]).map(texto).filter(Boolean) : []
      const ilegivel = ev.event === 'poll.vote.failed'
      const evento = await reivindicarEvento({
        disparo_id: d.id,
        numero_id: numero?.id ?? d.numero_id,
        tipo: 'voto',
        direcao: 'entrada',
        texto: ilegivel ? '(tocou na enquete — opção ilegível)' : opcoes.join(', ') || '(desmarcou o voto)',
        wa_id: idSerial(voto.id) || `${chave}:${texto(voto.timestamp) || Date.now()}`,
        dados: { opcoes, ilegivel }
      })
      if (evento === null) return 'voto repetido'
      return comDesfazer(evento, async () => {
        const de = texto(voto.from)
        const lid = de.endsWith('@lid') && !d.lid ? de.replace(/@.*$/, '') : null
        const n = await numeroDoDisparo(d, numero)
        const c = comFormatoDoNumero(await carregarCampanha(d.campanha_id), n)
        if (ilegivel) {
          if (lid) await aplicar(d, () => ({ resultado: 'lid', campos: { lid } }), null, depois)
          // Sabemos QUEM tocou, não EM QUÊ. Pede por escrito, uma vez só.
          if (['enviado', 'respondeu'].includes(d.status) && n) {
            const primeira = await reivindicarEvento({ disparo_id: d.id, tipo: 'nota', texto: 'pedido de SIM por escrito (voto ilegível)', wa_id: `voto-ilegivel-${d.id}` })
            if (primeira !== null) depois(() => responder(d, n, RESPOSTAS.voto_ilegivel))
          }
          return 'voto ilegível'
        }
        return aplicar(
          d,
          x => {
            const passo = opcoes.some(o => opcaoIgual(o, c.opcao_sim))
              ? interessado(x, c, false)
              : opcoes.some(o => opcaoIgual(o, c.opcao_nao))
                ? semInteresse(x, c.mensagem_nao)
                : { resultado: 'voto sem opção conhecida' }
            return lid ? { ...passo, campos: { lid, ...passo.campos } } : passo
          },
          n,
          depois
        )
      })
    }

    case 'message': {
      if (p.fromMe === true) return 'mensagem nossa'
      const from = idSerial(p.from)
      if (!from || /@(g\.us|newsletter|broadcast)$/.test(from) || from === 'status@broadcast') return 'fora de conversa direta'

      const chaveBaileys = ((p._data as { key?: Record<string, unknown> } | undefined)?.key ?? {}) as Record<string, unknown>
      const candidatos = [texto(chaveBaileys.remoteJidAlt), from, texto(chaveBaileys.senderPn)]
      const jidFone = candidatos.find(j => /@(c\.us|s\.whatsapp\.net)$/.test(j))
      let fone = jidFone ? foneDoJid(jidFone) : null
      // LID = identificador interno do WhatsApp, NÃO é telefone (a Z-API manda "…@lid" no phone ou à parte)
      const lid = from.endsWith('@lid') ? from.replace(/@.*$/, '') : texto(p.lid).replace(/@.*$/, '').replace(/\D/g, '') || null

      // chat_id gravado pelo motor: só dígitos na Z-API, "…@c.us" no WAHA — procura nas duas formas
      const digitosJid = jidFone ? jidFone.replace(/@.*$/, '').replace(/\D/g, '') : ''
      const buscas: Busca[] = [
        { coluna: 'telefone', valores: fone ? [fone] : [] },
        { coluna: 'chat_id', valores: digitosJid ? [digitosJid, `${digitosJid}@c.us`] : [] },
        { coluna: 'lid', valores: lid ? [lid] : [] }
      ]
      let d = await acharContato(buscas, numero)
      if (!d && lid && numero) {
        const pn = await telefoneDoLid(canalDe(numero), lid)
        fone = pn ? foneDoJid(pn) : null
        if (fone) d = await acharContato([{ coluna: 'telefone', valores: [fone] }], numero)
      }
      if (!d) return 'mensagem de quem não está no livro'

      const corpo = textoRecebido(p)
      // Reação (👍), aviso do WhatsApp, mensagem que ainda não chegou inteira: fica na conversa, mas não é resposta —
      // não conta tentativa na coleta, não chama a equipe, não mexe no status.
      const semTexto = !corpo && !p.hasMedia
      const conteudo = corpo || (p.hasMedia ? '[mídia: áudio, imagem ou arquivo]' : texto(p.descricao) || '[mensagem sem texto]')
      const evento = await reivindicarEvento({
        disparo_id: d.id,
        numero_id: numero?.id ?? d.numero_id,
        tipo: 'recebida',
        direcao: 'entrada',
        texto: conteudo,
        wa_id: chaveDoId(idSerial(p.id))
      })
      if (evento === null) return 'mensagem repetida'
      const contato = d
      return comDesfazer(evento, async () => {
        const novoLid = lid && !contato.lid ? { lid } : {}
        if (semTexto) {
          if (novoLid.lid) await aplicar(contato, () => ({ resultado: 'lid', campos: novoLid }), null, depois)
          return 'sem texto: só registrado na conversa'
        }
        const n = await numeroDoDisparo(contato, numero)
        const c = comFormatoDoNumero(await carregarCampanha(contato.campanha_id), n)
        return aplicar(
          contato,
          x => {
            const base: Partial<Disparo> = {
              respostas: (x.respostas ?? 0) + 1,
              ultima_resposta: conteudo.slice(0, 500),
              respondido_em: x.respondido_em ?? agora(),
              ...novoLid
            }
            const passo = decidirMensagem({ ...x, ...base } as Disparo, c, corpo)
            return { ...passo, campos: { ...base, ...passo.campos } }
          },
          n,
          depois
        )
      })
    }

    default:
      return 'evento ignorado'
  }
}

/** A máquina de etapas: o que uma mensagem escrita (ou mídia) faz com a conversa. */
function decidirMensagem(d: Disparo, c: Campanha, corpo: string): Passo {
  const quer = corpo ? intencao(corpo) : 'outro'
  const marca = c.grupo?.nome ?? 'OficialCert'
  if (quer === 'sair') return descadastro(d, marca)
  // SÓ DIVULGAÇÃO: não há perguntas. "Não" encerra com educação; o resto vai para alguém do grupo responder.
  if (c.grupo?.fluxo === 'divulgacao') {
    if (quer === 'nao' && !['descadastrado', 'sem_interesse'].includes(d.status)) return semInteresse(d, c.mensagem_nao)
    if (corpo && cortesia(corpo) && d.status !== 'enviado') return { resultado: 'cortesia' }
    return { resultado: 'divulgação: mensagem para o grupo', campos: { atencao: true, ...(d.status === 'enviado' ? { status: 'respondeu' as const } : {}) } }
  }
  const educado = !!corpo && cortesia(corpo)
  const tocouBotao = !!corpo && normalizar(corpo) === normalizar(c.botao_texto)
  // Coleta aberta (nome → número de contato): a mensagem é a resposta da pergunta, não um "sim/não"
  if (d.etapa) return coletar(d, c, corpo, tocouBotao)
  // Depois de preencher (ou de sair), o robô não fala mais: só chama a equipe se não for um "obrigado".
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    return educado ? { resultado: 'cortesia' } : { resultado: 'mensagem para a equipe', campos: { atencao: true } }
  }
  // "ok" depois do nosso "tudo bem, não mandaremos mais" é despedida, não mudança de ideia
  if (d.status === 'sem_interesse' && educado) return { resultado: 'cortesia' }
  if (quer === 'sim' || tocouBotao) return interessado(d, c, !tocouBotao && !respostaSimples(corpo))
  if (quer === 'nao') return semInteresse(d, c.mensagem_nao)
  if (educado && d.status !== 'enviado') return { resultado: 'cortesia' }
  // Pergunta, áudio, comentário: alguém da equipe precisa ler e responder pela plataforma.
  return { resultado: 'mensagem para a equipe', campos: { atencao: true, ...(d.status === 'enviado' ? { status: 'respondeu' as const } : {}) } }
}

function interessado(d: Disparo, c: Campanha, atencao: boolean): Passo {
  // Quem já mandou os dados ou pediu para sair e volta a escrever é caso para gente, não para o robô.
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    return { resultado: 'sim de quem já encerrou: equipe avisada', campos: { atencao: true } }
  }
  return {
    resultado: 'interessado: pedindo o nome',
    campos: {
      status: 'interessado',
      etapa: 'nome',
      tentativas: 0,
      interessado_em: d.interessado_em ?? agora(),
      respondido_em: d.respondido_em ?? agora(),
      encerrado_em: null,
      ...(atencao ? { atencao: true } : {})
    },
    resposta: montar(c.pergunta_nome, { empresa: nomeEmpresa(d), saudacao: saudacao() })
  }
}

/** Pergunta do número de contato: com 2 botões (formato botão) ou pedindo 1/2 por escrito (formato texto). */
function perguntaContato(c: Campanha, d: Disparo, nome: string): MensagemRica {
  const texto = montar(c.pergunta_contato, { primeiro_nome: primeiroNome(nome), nome, empresa: nomeEmpresa(d) })
  if (c.formato === 'botao') {
    return {
      texto,
      botoes: [
        { tipo: 'resposta', texto: c.botao_mesmo_numero },
        { tipo: 'resposta', texto: c.botao_outro_numero }
      ]
    }
  }
  return { texto: `${texto}\n\n${RESPOSTAS.contato_sem_botao(fmtFone(d.telefone))}` }
}

const ESTE = /^(1|um|este|esse|mesmo|o mesmo|este mesmo|esse mesmo|pode ser esse|pode ser este|pode|sim|s|ok|isso|este numero|esse numero|usar este|usar esse|usar este numero|usar esse numero|pode usar|pode usar esse|pode usar este)$/
const OUTRO = /^(2|dois|outro|outro numero|informar outro|usar outro|usar outro numero|nao|n|quero outro|prefiro outro)$/

/** Coleta pela conversa: nome completo → número de contato (este ou outro) → mensagem final (logo + análise + site). */
function coletar(d: Disparo, c: Campanha, corpo: string, tocouBotao: boolean): Passo {
  const repetir = () =>
    d.etapa === 'nome'
      ? montar(c.pergunta_nome, { empresa: nomeEmpresa(d), saudacao: saudacao() })
      : d.etapa === 'telefone'
        ? c.pergunta_telefone
        : perguntaContato(c, d, d.lead_nome ?? '')
  const errou = (aviso: string | MensagemRica): Passo => {
    const tentativas = (d.tentativas ?? 0) + 1
    // pergunta no meio da coleta ("quanto custa?"): o robô repete a pergunta e alguém da equipe já fica sabendo
    const pergunta = corpo.includes('?') ? { atencao: true } : {}
    if (tentativas >= 3) {
      // não insiste: chama a equipe
      return {
        resultado: `coleta interrompida (${d.etapa}): equipe avisada`,
        campos: { etapa: null, tentativas, atencao: true },
        resposta: RESPOSTAS.desistiu_da_coleta(c.grupo?.nome ?? 'OficialCert')
      }
    }
    return { resultado: `${d.etapa} inválido (${tentativas}/3)`, campos: { tentativas, ...pergunta }, resposta: aviso }
  }
  const concluir = (fone: string): Passo => ({
    resultado: 'dados recebidos: mensagem final enviada',
    campos: { lead_whatsapp: fone, etapa: null, tentativas: 0, status: 'preencheu', preenchido_em: d.preenchido_em ?? agora() },
    registro: () =>
      registrarEvento({
        disparo_id: d.id,
        numero_id: d.numero_id,
        tipo: 'formulario',
        direcao: 'entrada',
        texto: `${d.lead_nome} · contato ${fmtFone(fone)}`,
        dados: { nome: d.lead_nome, contato: fone, mesmo_numero: fone === d.telefone }
      }),
    resposta: mensagemFinal(c, { ...d, lead_whatsapp: fone })
  })
  const t = normalizar(corpo)

  if (d.etapa === 'nome') {
    // "não quero mais" no meio não é nome; tocar o botão / "sim" de novo repete a pergunta
    if (intencao(corpo) === 'nao') return semInteresse(d, c.mensagem_nao)
    if (tocouBotao || intencao(corpo) === 'sim') return { resultado: 'pergunta repetida (nome)', resposta: repetir() }
    const nome = nomeCompleto(corpo)
    if (!nome) return errou(RESPOSTAS.nome_invalido)
    return {
      resultado: 'nome recebido: perguntando o número de contato',
      campos: { lead_nome: nome, etapa: 'contato', tentativas: 0 },
      resposta: perguntaContato(c, d, nome)
    }
  }

  if (d.etapa === 'contato') {
    const fone = foneDoJid(corpo)
    if (fone && corpo.replace(/\D/g, '').length >= 10) return concluir(fone) // já mandou o número direto
    if (t === normalizar(c.botao_mesmo_numero) || ESTE.test(t)) return concluir(d.telefone)
    if (t === normalizar(c.botao_outro_numero) || OUTRO.test(t)) {
      return { resultado: 'vai informar outro número', campos: { etapa: 'telefone', tentativas: 0 }, resposta: c.pergunta_telefone }
    }
    return errou(perguntaContato(c, d, d.lead_nome ?? ''))
  }

  if (d.etapa === 'telefone') {
    const fone = foneDoJid(corpo)
    if (!fone) return errou(RESPOSTAS.telefone_invalido)
    return concluir(fone)
  }

  // etapa antiga (CNPJ) de campanhas anteriores: encerra pedindo o contato
  return { resultado: 'etapa antiga: perguntando o contato', campos: { etapa: 'contato', tentativas: 0 }, resposta: perguntaContato(c, d, d.lead_nome ?? '') }
}

function semInteresse(d: Disparo, modelo: string): Passo {
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    return { resultado: 'não de quem já encerrou: equipe avisada', campos: { atencao: true } }
  }
  const jaEstava = d.status === 'sem_interesse'
  return {
    resultado: 'sem interesse',
    campos: { status: 'sem_interesse', etapa: null, encerrado_em: d.encerrado_em ?? agora(), respondido_em: d.respondido_em ?? agora() },
    resposta: jaEstava ? undefined : montar(modelo, { empresa: nomeEmpresa(d), saudacao: saudacao() })
  }
}

function descadastro(d: Disparo, marca: string): Passo {
  const jaEstava = d.status === 'descadastrado'
  return {
    resultado: 'descadastrado',
    campos: { status: 'descadastrado', etapa: null, encerrado_em: d.encerrado_em ?? agora(), atencao: false },
    // bloqueia ANTES de gravar: no grupo de quem falou (outra marca ainda pode falar com ele); duplicado = já
    // bloqueado. Se o bloqueio falhar, nada é gravado e o provedor reenvia (o SAIR nunca se perde).
    antes: async () => {
      const { error } = await supabaseAdmin()
        .from('disparo_bloqueios')
        .insert({ telefone: d.telefone, grupo_id: d.grupo_id, motivo: 'pediu para sair', observacao: `disparo #${d.id}` })
      if (error && error.code !== '23505') throw new Error(`bloqueio do SAIR: ${error.message}`)
    },
    resposta: jaEstava ? undefined : RESPOSTAS.descadastro(marca)
  }
}
