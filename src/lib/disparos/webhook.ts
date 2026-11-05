// O que o WhatsApp devolve (webhook do WAHA): confirmação de entrega/leitura, voto na enquete, mensagens escritas
// e o estado da sessão. Atualiza o livro na hora; as RESPOSTAS ao contato (que levam segundos por causa do
// "digitando…") vão para `depois`, que a rota executa após devolver 200 ao WAHA.
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
import { canalDe, carregarCampanha, carregarNumero, mensagemFinal, registrarEvento, responder } from './motor'
import type { Campanha, Disparo, NumeroComChave } from './tipos'
import type { MensagemRica } from './waha'
import { chaveDoId, telefoneDoLid } from './waha'

export type EventoWaha = { event?: string; session?: string; payload?: Record<string, unknown> | null }
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

async function disparoPor(coluna: 'telefone' | 'lid' | 'enquete_id' | 'chat_id', valor: string) {
  const { data } = await supabaseAdmin().from('disparos').select('*').eq(coluna, valor).limit(1).maybeSingle()
  return (data as Disparo | null) ?? null
}

async function atualizar(id: number, campos: Partial<Disparo>) {
  const { error } = await supabaseAdmin().from('disparos').update({ ...campos, atualizado_em: agora() }).eq('id', id)
  if (error) console.error('[webhook] atualizar disparo', id, error.message)
}

/** O número que fez o contato é quem responde (a pessoa está conversando com ele). */
async function numeroDoDisparo(d: Disparo, reserva: NumeroComChave | null) {
  if (d.numero_id && d.numero_id !== reserva?.id) return (await carregarNumero(d.numero_id)) ?? reserva
  return reserva
}

export async function processarEvento(ev: EventoWaha, numeroId: number | null, depois: Depois) {
  const db = supabaseAdmin()
  const p = ev.payload ?? {}
  const numero = numeroId ? await carregarNumero(numeroId) : null
  if (numero) await db.from('disparo_numeros').update({ ultimo_evento_em: agora() }).eq('id', numero.id)

  switch (ev.event) {
    case 'session.status': {
      if (numero) {
        const status = texto(p.status) || 'DESCONHECIDO'
        await db
          .from('disparo_numeros')
          .update({ status, status_em: agora(), status_detalhe: status === 'WORKING' ? null : 'avisado pelo WAHA' })
          .eq('id', numero.id)
      }
      return 'status'
    }

    case 'message.ack': {
      if (p.fromMe === false) return 'ack de mensagem recebida'
      const chave = chaveDoId(idSerial(p.id))
      const ack = Number(p.ack)
      if (!chave || !/^[A-Za-z0-9]+$/.test(chave) || !(ack >= 2)) return 'ack ignorado'
      const filtro = `msg_id.eq.${chave},enquete_id.eq.${chave}`
      await db.from('disparos').update({ entregue_em: agora() }).or(filtro).is('entregue_em', null)
      if (ack >= 3) await db.from('disparos').update({ lido_em: agora() }).or(filtro).is('lido_em', null)
      return 'ack'
    }

    case 'poll.vote':
    case 'poll.vote.failed': {
      const voto = (p.vote ?? {}) as Record<string, unknown>
      const enquete = (p.poll ?? {}) as Record<string, unknown>
      const chave = chaveDoId(idSerial(enquete.id))
      const d = chave ? await disparoPor('enquete_id', chave) : null
      if (!d) return 'voto sem disparo'
      const opcoes = Array.isArray(voto.selectedOptions) ? (voto.selectedOptions as unknown[]).map(texto).filter(Boolean) : []
      const ilegivel = ev.event === 'poll.vote.failed'
      const novo = await registrarEvento({
        disparo_id: d.id,
        numero_id: numero?.id ?? d.numero_id,
        tipo: 'voto',
        direcao: 'entrada',
        texto: ilegivel ? '(tocou na enquete — opção ilegível)' : opcoes.join(', ') || '(desmarcou o voto)',
        wa_id: idSerial(voto.id) || `${chave}:${texto(voto.timestamp) || Date.now()}`,
        dados: { opcoes, ilegivel }
      })
      if (!novo) return 'voto repetido'
      const de = texto(voto.from)
      if (de.endsWith('@lid') && !d.lid) await atualizar(d.id, { lid: de.replace(/@.*$/, '') })

      const n = await numeroDoDisparo(d, numero)
      const c = await carregarCampanha(d.campanha_id)
      if (ilegivel) {
        // Sabemos QUEM tocou, não EM QUÊ. Pede por escrito, uma vez só.
        if (['enviado', 'respondeu'].includes(d.status) && n) {
          const primeira = await registrarEvento({ disparo_id: d.id, tipo: 'nota', texto: 'pedido de SIM por escrito (voto ilegível)', wa_id: `voto-ilegivel-${d.id}` })
          if (primeira) depois(() => responder(d, n, RESPOSTAS.voto_ilegivel))
        }
        return 'voto ilegível'
      }
      if (opcoes.some(o => opcaoIgual(o, c.opcao_sim))) return marcarInteressado(d, n, c, false, depois)
      if (opcoes.some(o => opcaoIgual(o, c.opcao_nao))) return marcarSemInteresse(d, n, c.mensagem_nao, depois)
      return 'voto sem opção conhecida'
    }

    case 'message': {
      if (p.fromMe === true) return 'mensagem nossa'
      const from = idSerial(p.from)
      if (!from || /@(g\.us|newsletter|broadcast)$/.test(from) || from === 'status@broadcast') return 'fora de conversa direta'

      const chaveBaileys = ((p._data as { key?: Record<string, unknown> } | undefined)?.key ?? {}) as Record<string, unknown>
      const candidatos = [texto(chaveBaileys.remoteJidAlt), from, texto(chaveBaileys.senderPn)]
      const jidFone = candidatos.find(j => /@(c\.us|s\.whatsapp\.net)$/.test(j))
      let fone = jidFone ? foneDoJid(jidFone) : null
      const lid = from.endsWith('@lid') ? from.replace(/@.*$/, '') : null

      let d = fone ? await disparoPor('telefone', fone) : null
      if (!d && jidFone) d = await disparoPor('chat_id', jidFone.replace(/@.*$/, '') + '@c.us')
      if (!d && lid) d = await disparoPor('lid', lid)
      if (!d && lid && numero) {
        const pn = await telefoneDoLid(canalDe(numero), lid)
        fone = pn ? foneDoJid(pn) : null
        if (fone) d = await disparoPor('telefone', fone)
      }
      if (!d) return 'mensagem de quem não está no livro'
      if (lid && !d.lid) await atualizar(d.id, { lid })

      const corpo = textoRecebido(p)
      const conteudo = corpo || (p.hasMedia ? '[mídia: áudio, imagem ou arquivo]' : '[mensagem sem texto]')
      const novo = await registrarEvento({
        disparo_id: d.id,
        numero_id: numero?.id ?? d.numero_id,
        tipo: 'recebida',
        direcao: 'entrada',
        texto: conteudo,
        wa_id: chaveDoId(idSerial(p.id))
      })
      if (!novo) return 'mensagem repetida'

      await atualizar(d.id, {
        respostas: (d.respostas ?? 0) + 1,
        ultima_resposta: conteudo.slice(0, 500),
        respondido_em: d.respondido_em ?? agora()
      })
      d = { ...d, respostas: d.respostas + 1, respondido_em: d.respondido_em ?? agora() }

      const n = await numeroDoDisparo(d, numero)
      const c = await carregarCampanha(d.campanha_id)
      const quer = corpo ? intencao(corpo) : 'outro'
      if (quer === 'sair') return marcarDescadastro(d, n, depois)
      const educado = !!corpo && cortesia(corpo)
      const tocouBotao = !!corpo && normalizar(corpo) === normalizar(c.botao_texto)
      // Coleta aberta (nome → CNPJ): a mensagem é a resposta da pergunta, não um "sim/não"
      if (d.etapa) return coletar(d, n, c, corpo, tocouBotao, depois)
      // Depois de preencher (ou de sair), o robô não fala mais: só chama a equipe se não for um "obrigado".
      if (d.status === 'preencheu' || d.status === 'descadastrado') {
        if (!educado) await atualizar(d.id, { atencao: true })
        return educado ? 'cortesia' : 'mensagem para a equipe'
      }
      // "ok" depois do nosso "tudo bem, não mandaremos mais" é despedida, não mudança de ideia
      if (d.status === 'sem_interesse' && educado) return 'cortesia'
      if (quer === 'sim' || tocouBotao) return marcarInteressado(d, n, c, !tocouBotao && !respostaSimples(corpo), depois)
      if (quer === 'nao') return marcarSemInteresse(d, n, c.mensagem_nao, depois)
      if (educado && d.status !== 'enviado') return 'cortesia'
      // Pergunta, áudio, comentário: alguém da equipe precisa ler e responder pela plataforma.
      await atualizar(d.id, { atencao: true, ...(d.status === 'enviado' ? { status: 'respondeu' as const } : {}) })
      return 'mensagem para a equipe'
    }

    default:
      return 'evento ignorado'
  }
}

async function marcarInteressado(d: Disparo, n: NumeroComChave | null, c: Campanha, atencao: boolean, depois: Depois) {
  // Quem já mandou os dados ou pediu para sair e volta a escrever é caso para gente, não para o robô.
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    await atualizar(d.id, { atencao: true })
    return 'sim de quem já encerrou: equipe avisada'
  }
  await atualizar(d.id, {
    status: 'interessado',
    etapa: 'nome',
    tentativas: 0,
    interessado_em: d.interessado_em ?? agora(),
    respondido_em: d.respondido_em ?? agora(),
    encerrado_em: null,
    ...(atencao ? { atencao: true } : {})
  })
  if (n) depois(() => responder(d, n, montar(c.pergunta_nome, { empresa: nomeEmpresa(d), saudacao: saudacao() })))
  return 'interessado: pedindo o nome'
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
async function coletar(d: Disparo, n: NumeroComChave | null, c: Campanha, corpo: string, tocouBotao: boolean, depois: Depois) {
  const responda = (m: string | MensagemRica) => {
    if (n) depois(() => responder(d, n, m))
  }
  const repetir = () =>
    d.etapa === 'nome'
      ? montar(c.pergunta_nome, { empresa: nomeEmpresa(d), saudacao: saudacao() })
      : d.etapa === 'telefone'
        ? c.pergunta_telefone
        : perguntaContato(c, d, d.lead_nome ?? '')
  const errou = async (aviso: string | MensagemRica) => {
    const tentativas = (d.tentativas ?? 0) + 1
    if (tentativas >= 3) {
      // não insiste: chama a equipe
      await atualizar(d.id, { etapa: null, tentativas, atencao: true })
      responda(RESPOSTAS.desistiu_da_coleta)
      return `coleta interrompida (${d.etapa}): equipe avisada`
    }
    await atualizar(d.id, { tentativas })
    responda(aviso)
    return `${d.etapa} inválido (${tentativas}/3)`
  }
  const concluir = async (fone: string) => {
    await atualizar(d.id, { lead_whatsapp: fone, etapa: null, tentativas: 0, status: 'preencheu', preenchido_em: d.preenchido_em ?? agora() })
    await registrarEvento({
      disparo_id: d.id,
      numero_id: n?.id ?? d.numero_id,
      tipo: 'formulario',
      direcao: 'entrada',
      texto: `${d.lead_nome} · contato ${fmtFone(fone)}`,
      dados: { nome: d.lead_nome, contato: fone, mesmo_numero: fone === d.telefone }
    })
    responda(mensagemFinal(c, { ...d, lead_whatsapp: fone }))
    return 'dados recebidos: mensagem final enviada'
  }
  const t = normalizar(corpo)

  if (d.etapa === 'nome') {
    // "não quero mais" no meio não é nome; tocar o botão / "sim" de novo repete a pergunta
    if (intencao(corpo) === 'nao') return marcarSemInteresse(d, n, c.mensagem_nao, depois)
    if (tocouBotao || intencao(corpo) === 'sim') {
      responda(repetir())
      return 'pergunta repetida (nome)'
    }
    const nome = nomeCompleto(corpo)
    if (!nome) return errou(RESPOSTAS.nome_invalido)
    await atualizar(d.id, { lead_nome: nome, etapa: 'contato', tentativas: 0 })
    responda(perguntaContato(c, d, nome))
    return 'nome recebido: perguntando o número de contato'
  }

  if (d.etapa === 'contato') {
    const fone = foneDoJid(corpo)
    if (fone && corpo.replace(/\D/g, '').length >= 10) return concluir(fone) // já mandou o número direto
    if (t === normalizar(c.botao_mesmo_numero) || ESTE.test(t)) return concluir(d.telefone)
    if (t === normalizar(c.botao_outro_numero) || OUTRO.test(t)) {
      await atualizar(d.id, { etapa: 'telefone', tentativas: 0 })
      responda(c.pergunta_telefone)
      return 'vai informar outro número'
    }
    return errou(perguntaContato(c, d, d.lead_nome ?? ''))
  }

  if (d.etapa === 'telefone') {
    const fone = foneDoJid(corpo)
    if (!fone) return errou(RESPOSTAS.telefone_invalido)
    return concluir(fone)
  }

  // etapa antiga (CNPJ) de campanhas anteriores: encerra pedindo o contato
  await atualizar(d.id, { etapa: 'contato', tentativas: 0 })
  responda(perguntaContato(c, d, d.lead_nome ?? ''))
  return 'etapa antiga: perguntando o contato'
}

async function marcarSemInteresse(d: Disparo, n: NumeroComChave | null, modelo: string, depois: Depois) {
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    await atualizar(d.id, { atencao: true })
    return 'não de quem já encerrou: equipe avisada'
  }
  const jaEstava = d.status === 'sem_interesse'
  await atualizar(d.id, { status: 'sem_interesse', etapa: null, encerrado_em: d.encerrado_em ?? agora(), respondido_em: d.respondido_em ?? agora() })
  if (n && !jaEstava) depois(() => responder(d, n, montar(modelo, { empresa: nomeEmpresa(d), saudacao: saudacao() })))
  return 'sem interesse'
}

async function marcarDescadastro(d: Disparo, n: NumeroComChave | null, depois: Depois) {
  const jaEstava = d.status === 'descadastrado'
  await atualizar(d.id, { status: 'descadastrado', etapa: null, encerrado_em: d.encerrado_em ?? agora(), atencao: false })
  await supabaseAdmin()
    .from('disparo_bloqueios')
    .upsert({ telefone: d.telefone, motivo: 'pediu para sair', observacao: `disparo #${d.id}` }, { onConflict: 'telefone', ignoreDuplicates: true })
  if (n && !jaEstava) depois(() => responder(d, n, RESPOSTAS.descadastro))
  return 'descadastrado'
}
