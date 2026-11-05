// O ciclo de disparos: chamado a cada minuto pelo pg_cron (migração 006) via /api/sistema/disparos/ciclo.
// Cada número pronto manda NO MÁXIMO UMA primeira mensagem por ciclo; depois espera um intervalo aleatório
// (intervalo_min_s … intervalo_max_s) e respeita o limite diário. Tudo pela chave secreta (sem usuário logado).
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dentroDaJanela, inicioDoDiaBrasilia } from './config'
import { fmtCnpj, fmtFone, montar, nomeEmpresa, primeiroNome, RESPOSTAS, saudacao } from './mensagens'
import type { Campanha, Disparo, EventoDisparo, NumeroComChave } from './tipos'
import {
  digitar,
  enviarBotoes,
  enviarEnquete,
  enviarImagem,
  enviarTexto,
  ErroWaha,
  lerSessao,
  marcarVisto,
  verificarNumero,
  type Canal,
  type MensagemRica
} from './waha'

const sorteio = (min: number, max: number) => min + Math.random() * Math.max(0, max - min)
const espera = (ms: number) => new Promise(r => setTimeout(r, ms))
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 500)

export const canalDe = (n: Pick<NumeroComChave, 'waha_url' | 'waha_sessao' | 'waha_api_key'>): Canal => ({
  url: n.waha_url,
  sessao: n.waha_sessao,
  apiKey: n.waha_api_key
})

export async function carregarNumero(id: number) {
  const { data, error } = await supabaseAdmin().from('disparo_numeros').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`número ${id}: ${error.message}`)
  return data as NumeroComChave | null
}

export async function carregarCampanha(id: number) {
  const { data, error } = await supabaseAdmin().from('disparo_campanhas').select('*').eq('id', id).single()
  if (error) throw new Error(`campanha ${id}: ${error.message}`)
  return data as Campanha
}

type NovoEvento = Omit<EventoDisparo, 'id' | 'criado_em' | 'texto' | 'wa_id' | 'dados' | 'autor' | 'direcao' | 'numero_id'> &
  Partial<Pick<EventoDisparo, 'texto' | 'wa_id' | 'dados' | 'autor' | 'direcao' | 'numero_id'>>

/** Grava um evento. Com `wa_id`, devolve false se ele JÁ existia (o WAHA reenviou o webhook): não processar de novo. */
export async function registrarEvento(e: NovoEvento) {
  const linha = { ...e, texto: e.texto?.slice(0, 4000) ?? null }
  if (!e.wa_id) {
    const { error } = await supabaseAdmin().from('disparo_eventos').insert(linha)
    if (error) console.error('[disparos] evento', error.message)
    return true
  }
  const { data, error } = await supabaseAdmin()
    .from('disparo_eventos')
    .upsert(linha, { onConflict: 'tipo,wa_id', ignoreDuplicates: true })
    .select('id')
  if (error) {
    console.error('[disparos] evento', error.message)
    return true // na dúvida processa: perder uma resposta é pior que repetir um registro
  }
  return (data?.length ?? 0) > 0
}

/** Manda uma mensagem como pessoa (visto → digitando → mensagem) e registra na conversa. Texto puro ou rica. */
export async function responder(
  d: Pick<Disparo, 'id' | 'chat_id'>,
  numero: NumeroComChave,
  conteudo: string | MensagemRica,
  opcoes: { autor?: string; visto?: boolean } = {}
) {
  if (!d.chat_id) throw new Error('conversa sem chat_id')
  const m: MensagemRica = typeof conteudo === 'string' ? { texto: conteudo } : conteudo
  const canal = canalDe(numero)
  if (opcoes.visto !== false) await marcarVisto(canal, d.chat_id)
  await digitar(canal, d.chat_id, Math.min(1200 + m.texto.length * 15, 4000))
  const id = await enviarRica(canal, d.chat_id, m)
  await registrarEvento({
    disparo_id: d.id,
    numero_id: numero.id,
    tipo: 'enviada',
    direcao: 'saida',
    texto: descrever(m),
    wa_id: id,
    autor: opcoes.autor ?? null
  })
  return id
}

/** Botões → sendButtons; só imagem → sendImage (rodapé vira itálico); só texto → sendText. */
export async function enviarRica(canal: Canal, chatId: string, m: MensagemRica) {
  if (m.botoes?.length) return enviarBotoes(canal, chatId, m)
  const texto = m.rodape ? `${m.texto}\n\n_${m.rodape}_` : m.texto
  if (m.imagem) return enviarImagem(canal, chatId, m.imagem, texto)
  return enviarTexto(canal, chatId, texto)
}

/** Como a mensagem aparece na conversa da plataforma. */
export const descrever = (m: MensagemRica) =>
  [m.imagem ? '🖼️ [logo]' : '', m.texto, m.rodape ? `_${m.rodape}_` : '', ...(m.botoes ?? []).map(b => `[ ${b.texto} ]${b.tipo === 'link' ? ` → ${b.url}` : ''}`)]
    .filter(Boolean)
    .join('\n')

/** 1ª mensagem da campanha, já montada para a empresa. */
export function primeiraMensagem(c: Campanha, d: Pick<Disparo, 'razao_social' | 'nome_fantasia' | 'municipio'>): MensagemRica {
  const texto = montar(c.mensagem, { empresa: nomeEmpresa(d), saudacao: saudacao(), municipio: d.municipio ?? '' })
  if (c.formato === 'botao') {
    return { imagem: c.imagem_url, texto, rodape: c.rodape, botoes: [{ tipo: 'resposta', texto: c.botao_texto }] }
  }
  return { imagem: c.imagem_url, texto: /\bSIM\b/.test(texto) ? texto : `${texto}\n\n${RESPOSTAS.sem_botao}`, rodape: c.rodape }
}

/** Mensagem final (depois do CNPJ): logo + agradecimento + botão que abre o site. */
export function mensagemFinal(
  c: Campanha,
  d: Pick<Disparo, 'razao_social' | 'nome_fantasia' | 'municipio' | 'lead_nome' | 'lead_cnpj' | 'lead_whatsapp' | 'telefone'>
): MensagemRica {
  const nome = d.lead_nome ?? ''
  const texto = montar(c.mensagem_obrigado, {
    primeiro_nome: primeiroNome(nome),
    nome,
    cnpj: fmtCnpj(d.lead_cnpj),
    telefone: fmtFone(d.lead_whatsapp ?? d.telefone),
    empresa: nomeEmpresa(d),
    saudacao: saudacao()
  })
  if (c.formato === 'botao') return { imagem: c.imagem_url, texto, botoes: [{ tipo: 'link', texto: c.botao_site_texto, url: c.site_url }] }
  return { imagem: c.imagem_url, texto: `${texto}\n\n👉 ${c.site_url}` }
}

type Resultado = { numero: number; rotulo: string; resultado: string; disparo?: number }

export async function rodarCiclo(agora = new Date()) {
  const db = supabaseAdmin()

  // Reserva que ficou parada (o ciclo morreu entre reservar e confirmar): não dá para saber se a mensagem saiu,
  // então vira falha e NUNCA é reenviada.
  await db
    .from('disparos')
    .update({ status: 'falhou', erro: 'ciclo interrompido no meio do envio (não reenviar)', atualizado_em: agora.toISOString() })
    .eq('status', 'reservado')
    .lt('criado_em', new Date(agora.getTime() - 15 * 60_000).toISOString())

  const { data: cfg, error } = await db.from('disparo_config').select('*').eq('id', 1).single()
  if (error) throw new Error(`regras: ${error.message}`)
  const janela = dentroDaJanela(cfg, agora)
  if (!janela.ok) return { ok: true, pulado: janela.motivo, numeros: [] as Resultado[] }

  const { count: ativas } = await db.from('disparo_campanhas').select('id', { count: 'exact', head: true }).eq('status', 'ativa')
  if (!ativas) return { ok: true, pulado: 'nenhuma campanha ativa', numeros: [] as Resultado[] }

  const { data: numeros } = await db
    .from('disparo_numeros')
    .select('*')
    .eq('ativo', true)
    .lte('proximo_envio_em', agora.toISOString())
  if (!numeros?.length) return { ok: true, pulado: 'nenhum número pronto agora', numeros: [] as Resultado[] }

  const resultados = await Promise.all(
    (numeros as NumeroComChave[]).map(n =>
      cicloDoNumero(n, agora).catch((e): Resultado => {
        console.error('[disparos] número', n.id, e)
        return { numero: n.id, rotulo: n.rotulo, resultado: `erro: ${msg(e)}` }
      })
    )
  )
  return { ok: true, pulado: null, numeros: resultados }
}

async function cicloDoNumero(n: NumeroComChave, agora: Date): Promise<Resultado> {
  const db = supabaseAdmin()
  const r = (resultado: string, disparo?: number): Resultado => ({ numero: n.id, rotulo: n.rotulo, resultado, disparo })
  const adiar = (segundos: number, extra: Record<string, unknown> = {}) =>
    db
      .from('disparo_numeros')
      .update({ proximo_envio_em: new Date(Date.now() + segundos * 1000).toISOString(), ...extra })
      .eq('id', n.id)

  // Trava: só este ciclo usa o número pelos próximos 5 minutos (UPDATE condicional = atômico).
  const { data: trava } = await db
    .from('disparo_numeros')
    .update({ proximo_envio_em: new Date(agora.getTime() + 5 * 60_000).toISOString() })
    .eq('id', n.id)
    .lte('proximo_envio_em', agora.toISOString())
    .select('id')
  if (!trava?.length) return r('ocupado por outro ciclo')

  const { count: hoje } = await db
    .from('disparos')
    .select('id', { count: 'exact', head: true })
    .eq('numero_id', n.id)
    .eq('teste', false)
    .gte('enviado_em', inicioDoDiaBrasilia(agora))
  if ((hoje ?? 0) >= n.limite_diario) {
    await adiar(20 * 60)
    return r(`limite diário atingido (${hoje}/${n.limite_diario})`)
  }

  const canal = canalDe(n)
  const quando = new Date().toISOString()
  try {
    const s = await lerSessao(canal)
    if (s?.status !== 'WORKING') {
      await adiar(5 * 60, { status: s?.status ?? 'DESCONHECIDO', status_detalhe: 'sessão fora do ar no WAHA', status_em: quando })
      return r(`sessão ${s?.status ?? '?'}`)
    }
  } catch (e) {
    await adiar(5 * 60, { status: 'ERRO', status_detalhe: msg(e), status_em: quando })
    return r(`WAHA inacessível: ${msg(e)}`)
  }

  const { data: reservas, error } = await db.rpc('disparo_reservar', { p_numero: n.id })
  if (error) {
    await adiar(5 * 60)
    throw new Error(`reservar: ${error.message}`)
  }
  const d = (reservas as Disparo[] | null)?.[0]
  if (!d) {
    await adiar(5 * 60)
    return r('nenhuma empresa elegível nas campanhas ativas')
  }

  return enviarPrimeira(d, n, canal, adiar, r)
}

async function enviarPrimeira(
  d: Disparo,
  n: NumeroComChave,
  canal: Canal,
  adiar: (s: number, extra?: Record<string, unknown>) => PromiseLike<unknown>,
  r: (resultado: string, disparo?: number) => Resultado
): Promise<Resultado> {
  const db = supabaseAdmin()
  const agoraIso = () => new Date().toISOString()
  const atualizar = (campos: Partial<Disparo>) => db.from('disparos').update({ ...campos, atualizado_em: agoraIso() }).eq('id', d.id)
  // Reserva que NÃO chegou ao WhatsApp pode voltar para a fila: não houve contato. É o único DELETE do livro.
  const devolver = () => db.from('disparos').delete().eq('id', d.id).eq('status', 'reservado')

  const c = await carregarCampanha(d.campanha_id)

  // 1) O número tem WhatsApp? (e qual é o chatId certo, com ou sem o 9)
  let chat: string
  try {
    const v = await verificarNumero(canal, d.telefone)
    if (!v.existe || !v.chatId) {
      await atualizar({ status: 'sem_whatsapp' })
      await adiar(sorteio(15, 40))
      return r('sem WhatsApp', d.id)
    }
    chat = v.chatId
  } catch (e) {
    await devolver()
    await adiar(10 * 60, { status: 'ERRO', status_detalhe: `check-exists: ${msg(e)}`, status_em: agoraIso() })
    return r(`falha ao verificar o número: ${msg(e)}`)
  }

  // 2) Primeira mensagem (logo + texto + botão, ou logo + "responda SIM", ou o formato antigo de enquete)
  const enquete = c.formato === 'enquete'
  let m: MensagemRica = enquete
    ? { texto: montar(c.mensagem, { empresa: nomeEmpresa(d), saudacao: saudacao(), municipio: d.municipio ?? '' }) }
    : primeiraMensagem(c, d)

  await digitar(canal, chat, sorteio(2500, 5000))
  let msgId: string | null
  try {
    try {
      msgId = await enviarRica(canal, chat, m)
    } catch (e) {
      // Botão recusado pelo WAHA (4xx = formato): manda logo + texto pedindo SIM, para não perder o contato
      if (!(m.botoes?.length && e instanceof ErroWaha && e.status && e.status < 500)) throw e
      m = primeiraMensagem({ ...c, formato: 'texto' }, d)
      msgId = await enviarRica(canal, chat, m)
      await registrarEvento({ disparo_id: d.id, numero_id: n.id, tipo: 'erro', texto: `botão recusado, foi como texto: ${msg(e)}` })
    }
  } catch (e) {
    const erro = msg(e)
    if (e instanceof ErroWaha && e.enviado === 'nao' && (!e.status || e.status >= 500)) {
      // problema do WAHA/sessão, e a mensagem não saiu: devolve a empresa e dá um tempo ao número
      await devolver()
      await adiar(10 * 60, { status: 'ERRO', status_detalhe: `envio: ${erro}`, status_em: agoraIso() })
      return r(`WAHA recusou o envio: ${erro}`)
    }
    // recusado para ESTE destinatário (4xx) ou pode ter saído (timeout): registra e nunca reenvia
    await atualizar({ status: 'falhou', erro: `envio: ${erro}`, chat_id: chat })
    await adiar(sorteio(60, 120))
    return r(`falhou: ${erro}`, d.id)
  }

  const enviadoEm = agoraIso()
  await atualizar({ status: 'enviado', chat_id: chat, msg_id: msgId, enviado_em: enviadoEm, erro: null })
  await registrarEvento({ disparo_id: d.id, numero_id: n.id, tipo: 'enviada', direcao: 'saida', texto: descrever(m), wa_id: msgId })

  // 3) Formato antigo: enquete logo depois
  if (enquete) {
    await espera(sorteio(1200, 2500))
    try {
      const enqueteId = await enviarEnquete(canal, chat, c.enquete_pergunta, [c.opcao_sim, c.opcao_nao])
      await atualizar({ enquete_id: enqueteId })
      await registrarEvento({
        disparo_id: d.id,
        numero_id: n.id,
        tipo: 'enviada',
        direcao: 'saida',
        texto: `📊 ${c.enquete_pergunta}\n○ ${c.opcao_sim}\n○ ${c.opcao_nao}`,
        wa_id: enqueteId,
        dados: { enquete: true }
      })
    } catch (e) {
      await atualizar({ erro: `enquete não saiu: ${msg(e)}` })
      try {
        await responder({ id: d.id, chat_id: chat }, n, RESPOSTAS.sem_botao, { visto: false })
      } catch {
        // a 1ª mensagem já saiu; a pessoa ainda pode responder
      }
    }
  }

  await adiar(sorteio(n.intervalo_min_s, n.intervalo_max_s), {
    ultimo_envio_em: enviadoEm,
    status: 'WORKING',
    status_detalhe: null,
    status_em: enviadoEm
  })
  return r('enviado', d.id)
}

/** Teste do administrador no próprio WhatsApp: a mesma 1ª mensagem do ciclo, sem mexer no relógio do número. */
export async function enviarPrimeiraDeTeste(d: Disparo, n: NumeroComChave) {
  const r = (resultado: string, disparo?: number): Resultado => ({ numero: n.id, rotulo: n.rotulo, resultado, disparo })
  return enviarPrimeira(d, n, canalDe(n), async () => {}, r)
}
