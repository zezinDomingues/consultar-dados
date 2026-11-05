// O que o WhatsApp devolve (webhook do WAHA): confirmação de entrega/leitura, voto na enquete, mensagens escritas
// e o estado da sessão. Atualiza o livro na hora; as RESPOSTAS ao contato (que levam segundos por causa do
// "digitando…") vão para `depois`, que a rota executa após devolver 200 ao WAHA.
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { linkFormulario } from './config'
import { cortesia, intencao, montar, nomeEmpresa, normalizar, normalizarFone as foneDoJid, RESPOSTAS, respostaSimples, saudacao } from './mensagens'
import { canalDe, carregarCampanha, carregarNumero, registrarEvento, responder } from './motor'
import type { Disparo, NumeroComChave } from './tipos'
import { chaveDoId, telefoneDoLid } from './waha'

export type EventoWaha = { event?: string; session?: string; payload?: Record<string, unknown> | null }
export type Depois = (tarefa: () => Promise<unknown>) => void

const agora = () => new Date().toISOString()
const texto = (v: unknown) => (typeof v === 'string' ? v : '')
const idSerial = (v: unknown) => (typeof v === 'string' ? v : texto((v as { _serialized?: unknown } | null)?._serialized))
/** Emoji às vezes vem com o seletor de variação (U+FE0F), às vezes sem: compara sem ele. */
const opcaoIgual = (a: string, b: string) => normalizar(a.replace(/️/g, '')) === normalizar(b.replace(/️/g, ''))

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
      if (opcoes.some(o => opcaoIgual(o, c.opcao_sim))) return marcarInteressado(d, n, c.mensagem_sim, false, depois)
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

      const corpo = texto(p.body).trim()
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
      // Depois de preencher (ou de sair), o robô não fala mais: só chama a equipe se não for um "obrigado".
      if (d.status === 'preencheu' || d.status === 'descadastrado') {
        if (!educado) await atualizar(d.id, { atencao: true })
        return educado ? 'cortesia' : 'mensagem para a equipe'
      }
      // "ok" depois do nosso "tudo bem, não mandaremos mais" é despedida, não mudança de ideia
      if (d.status === 'sem_interesse' && educado) return 'cortesia'
      if (quer === 'sim') {
        // "ok" logo depois de receber o link não é pedido de outro link
        const linkRecente = d.status === 'interessado' && d.interessado_em && Date.now() - Date.parse(d.interessado_em) < 30 * 60_000
        if (linkRecente) {
          if (!respostaSimples(corpo)) await atualizar(d.id, { atencao: true })
          return 'sim repetido'
        }
        return marcarInteressado(d, n, c.mensagem_sim, !respostaSimples(corpo), depois)
      }
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

async function marcarInteressado(d: Disparo, n: NumeroComChave | null, modelo: string, atencao: boolean, depois: Depois) {
  // Quem já preencheu ou pediu para sair e volta a escrever é caso para gente, não para o robô.
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    await atualizar(d.id, { atencao: true })
    return 'sim de quem já encerrou: equipe avisada'
  }
  await atualizar(d.id, {
    status: 'interessado',
    interessado_em: d.interessado_em ?? agora(),
    respondido_em: d.respondido_em ?? agora(),
    encerrado_em: null,
    ...(atencao ? { atencao: true } : {})
  })
  if (n) {
    const texto = montar(modelo, { empresa: nomeEmpresa(d), saudacao: saudacao(), municipio: d.municipio ?? '', link: linkFormulario(d.token) })
    depois(async () => {
      await responder(d, n, texto)
      await registrarEvento({ disparo_id: d.id, numero_id: n.id, tipo: 'link', texto: linkFormulario(d.token) })
    })
  }
  return 'interessado: link enviado'
}

async function marcarSemInteresse(d: Disparo, n: NumeroComChave | null, modelo: string, depois: Depois) {
  if (d.status === 'preencheu' || d.status === 'descadastrado') {
    await atualizar(d.id, { atencao: true })
    return 'não de quem já encerrou: equipe avisada'
  }
  const jaEstava = d.status === 'sem_interesse'
  await atualizar(d.id, { status: 'sem_interesse', encerrado_em: d.encerrado_em ?? agora(), respondido_em: d.respondido_em ?? agora() })
  if (n && !jaEstava) depois(() => responder(d, n, montar(modelo, { empresa: nomeEmpresa(d), saudacao: saudacao() })))
  return 'sem interesse'
}

async function marcarDescadastro(d: Disparo, n: NumeroComChave | null, depois: Depois) {
  const jaEstava = d.status === 'descadastrado'
  await atualizar(d.id, { status: 'descadastrado', encerrado_em: d.encerrado_em ?? agora(), atencao: false })
  await supabaseAdmin()
    .from('disparo_bloqueios')
    .upsert({ telefone: d.telefone, motivo: 'pediu para sair', observacao: `disparo #${d.id}` }, { onConflict: 'telefone', ignoreDuplicates: true })
  if (n && !jaEstava) depois(() => responder(d, n, RESPOSTAS.descadastro))
  return 'descadastrado'
}
