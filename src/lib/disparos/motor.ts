// O ciclo de disparos: chamado a cada minuto pelo pg_cron (migração 006) via /api/sistema/disparos/ciclo.
// Cada número pronto manda NO MÁXIMO UMA primeira mensagem por ciclo; depois espera um intervalo aleatório
// (intervalo_min_s … intervalo_max_s) e respeita o limite diário. Tudo pela chave secreta (sem usuário logado).
//
// Orçamento de tempo: a rota tem 60 s (maxDuration). Passar disso mata a função no meio do envio, e aí não dá para
// saber se a mensagem saiu. Por isso o ciclo tem um prazo (50 s) e só começa um envio que cabe inteiro nele; o que
// não cabe volta para a fila. Erro do banco = não envia neste ciclo (sem contar o dia, o limite diário furaria).
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { dentroDaJanela, inicioDoDiaBrasilia, urlApp } from './config'
import { faltaNoBanco } from './erro'
import { normalizarFiltros } from './filtros'
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

/**
 * Marca da reserva que AINDA NÃO começou a ser enviada (gravada pelo disparo_reservar da migração 020). O motor a
 * apaga logo antes de mandar. Reserva parada com a marca = o ciclo morreu antes do envio → volta para a fila;
 * sem a marca = pode ter saído → "falhou" e nunca é reenviada.
 */
export const PREPARANDO = 'preparando o envio'

/** Prazo do ciclo inteiro (a rota tem 60 s; sobra margem para gravar o resultado e responder ao pg_cron). */
const CICLO_MS = 50_000

export type Prazo = { restante: () => number }
export const prazoAte = (fimMs: number): Prazo => ({ restante: () => fimMs - Date.now() })
const SEM_PRAZO: Prazo = { restante: () => Infinity }

export const canalDe = (n: Pick<NumeroComChave, 'waha_url' | 'waha_sessao' | 'waha_api_key' | 'provedor' | 'client_token'>): Canal => ({
  url: n.waha_url,
  sessao: n.waha_sessao,
  apiKey: n.waha_api_key,
  provedor: n.provedor ?? 'waha',
  clientToken: n.client_token
})

/**
 * Formato que vale para ESTE número: botões só saem pela Z-API. No WAHA a mensagem com botão é entregue mas não
 * aparece no celular (05/11/2026), então a campanha "com botões" cai para texto quando o número é do WAHA.
 */
export const comFormatoDoNumero = (c: Campanha, n: Pick<NumeroComChave, 'provedor'> | null): Campanha =>
  c.formato === 'botao' && n?.provedor !== 'zapi' ? { ...c, formato: 'texto' } : c

export async function carregarNumero(id: number) {
  const { data, error } = await supabaseAdmin().from('disparo_numeros').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`número ${id}: ${error.message}`)
  return data as NumeroComChave | null
}

/**
 * Número que pode falar com um contato do grupo `grupoId`: só um número do MESMO grupo. Um `numero_id` trocado no
 * livro (para o número de outro cliente) não vira mensagem saindo pelo número alheio.
 */
export async function carregarNumeroDoGrupo(id: number, grupoId: number) {
  const n = await carregarNumero(id)
  if (n && n.grupo_id !== grupoId) {
    console.error(`[disparos] número ${id} é do grupo ${n.grupo_id}, não do ${grupoId}: não responde por ele`)
    return null
  }
  return n
}

/** Número da Z-API pelo ID da instância (webhook configurado sem o ?n=). */
export async function numeroDaInstancia(instancia: string) {
  const { data, error } = await supabaseAdmin()
    .from('disparo_numeros')
    .select('*')
    .eq('provedor', 'zapi')
    .eq('waha_sessao', instancia)
    .order('id')
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`instância ${instancia}: ${error.message}`)
  return data as NumeroComChave | null
}

const TEXTOS_CAMPANHA = [
  'mensagem', 'rodape', 'botao_texto', 'pergunta_nome', 'pergunta_contato', 'pergunta_telefone', 'mensagem_obrigado',
  'mensagem_nao', 'mensagem_sim', 'enquete_pergunta', 'botao_site_texto'
] as const

/** Campanha + grupo, com `{marca}` já trocado pelo nome do grupo em todos os textos e o porte antigo convertido. */
export async function carregarCampanha(id: number) {
  const { data, error } = await supabaseAdmin().from('disparo_campanhas').select('*, grupo:disparo_grupos(*)').eq('id', id).single()
  if (error) throw new Error(`campanha ${id}: ${error.message}`)
  const c = data as Campanha
  c.filtros = normalizarFiltros(c.filtros)
  const marca = c.grupo?.nome ?? 'OficialCert'
  const r = c as unknown as Record<string, unknown>
  for (const k of TEXTOS_CAMPANHA) if (typeof r[k] === 'string') r[k] = (r[k] as string).replaceAll('{marca}', marca)
  return c
}

/** Link da divulgação: passa por /r/<token> (conta o clique) ou vai direto ao site. */
export function linkDivulgacao(c: Campanha, d: Pick<Disparo, 'token'>) {
  return c.grupo?.medir_cliques ? `${urlApp()}/r/${d.token}` : c.site_url
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

/**
 * Anti-repetição do webhook: grava o evento recebido e devolve o id dele, ou null se o mesmo `wa_id` já foi gravado
 * (reenvio do provedor). Erro do banco SOBE (a rota responde 500 e o provedor reenvia). Se o processamento falhar
 * depois, `desfazerEvento` apaga o registro — senão o reenvio cairia como "repetido" e a resposta se perderia.
 */
export async function reivindicarEvento(e: NovoEvento): Promise<number | null> {
  const linha = { ...e, texto: e.texto?.slice(0, 4000) ?? null }
  const db = supabaseAdmin()
  if (!e.wa_id) {
    const { data, error } = await db.from('disparo_eventos').insert(linha).select('id').single()
    if (error) throw new Error(`evento: ${error.message}`)
    return (data as { id: number }).id
  }
  const { data, error } = await db.from('disparo_eventos').upsert(linha, { onConflict: 'tipo,wa_id', ignoreDuplicates: true }).select('id')
  if (error) throw new Error(`evento: ${error.message}`)
  return (data as { id: number }[] | null)?.[0]?.id ?? null
}

export async function desfazerEvento(id: number) {
  const { error } = await supabaseAdmin().from('disparo_eventos').delete().eq('id', id)
  if (error) console.error('[disparos] não consegui desfazer o evento', id, '— o reenvio vai cair como repetido:', error.message)
}

/**
 * Reserva que NÃO chegou ao WhatsApp volta para a fila (é o único DELETE do livro): sem contato, sem regra quebrada.
 * Com a migração 020 ela volta para o COMEÇO da fila da campanha; sem a 020, só sai do livro (volta a ser elegível).
 */
export async function devolverReserva(id: number) {
  const db = supabaseAdmin()
  const { error } = await db.rpc('disparo_devolver', { p_disparo: id })
  if (!error) return true
  if (!faltaNoBanco(error)) {
    console.error('[disparos] devolver reserva', id, error.message)
    return false
  }
  const { error: e2 } = await db.from('disparos').delete().eq('id', id).eq('status', 'reservado')
  if (e2) console.error('[disparos] devolver reserva', id, e2.message)
  return !e2
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

/** Tempo máximo que um envio pode levar (o timeout do provedor): só começa se couber no prazo do ciclo. */
const tempoDeEnvio = (canal: Canal, m: MensagemRica) => (canal.provedor === 'zapi' ? 30_000 : m.imagem || m.botoes?.length ? 45_000 : 30_000)
/** "digitando…": a Z-API simula no próprio envio (até 2,5 s aqui); no WAHA são 2 chamadas de até 8 s + a espera. */
const tempoDigitando = (canal: Canal) => (canal.provedor === 'zapi' ? 2_500 : 21_000)

/** Como a mensagem aparece na conversa da plataforma. */
export const descrever = (m: MensagemRica) =>
  [m.imagem ? '🖼️ [logo]' : '', m.texto, m.rodape ? `_${m.rodape}_` : '', ...(m.botoes ?? []).map(b => `[ ${b.texto} ]${b.tipo === 'link' ? ` → ${b.url}` : ''}`)]
    .filter(Boolean)
    .join('\n')

/** 1ª mensagem da campanha, já montada para a empresa. */
export function primeiraMensagem(c: Campanha, d: Pick<Disparo, 'razao_social' | 'nome_fantasia' | 'municipio' | 'token'>): MensagemRica {
  const texto = montar(c.mensagem, { empresa: nomeEmpresa(d), saudacao: saudacao(), municipio: d.municipio ?? '' })
  if (c.grupo?.fluxo === 'divulgacao') {
    // só divulgação: logo + texto + link (botão de link na Z-API; link escrito no WAHA)
    const link = linkDivulgacao(c, d)
    if (c.formato === 'botao') return { imagem: c.imagem_url, texto, rodape: c.rodape, botoes: [{ tipo: 'link', texto: c.botao_site_texto, url: link }] }
    return { imagem: c.imagem_url, texto: `${texto}\n\n👉 ${link}`, rodape: c.rodape }
  }
  if (c.formato === 'botao') {
    return { imagem: c.imagem_url, texto, rodape: c.rodape, botoes: [{ tipo: 'resposta', texto: c.botao_texto }] }
  }
  return { imagem: c.imagem_url, texto: /\bSIM\b/.test(texto) ? texto : `${texto}\n\n${RESPOSTAS.sem_botao}`, rodape: c.rodape }
}

/** Mensagem final (depois do nome e do número de contato): logo + agradecimento + botão que abre o site. */
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

/**
 * Reservas paradas há mais de 15 min (o ciclo morreu entre reservar e confirmar). Com a marca de "preparando" o
 * envio nem começou: volta para a fila. Sem ela pode ter saído: vira falha e NUNCA é reenviada.
 */
async function recolherReservasParadas(agora: Date) {
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('disparos')
    .select('id, erro')
    .eq('status', 'reservado')
    .lt('criado_em', new Date(agora.getTime() - 15 * 60_000).toISOString())
    .limit(100)
  if (error) throw new Error(`reservas paradas: ${error.message}`)
  for (const p of (data ?? []) as Pick<Disparo, 'id' | 'erro'>[]) {
    if (p.erro === PREPARANDO) {
      await devolverReserva(p.id) // falhou? fica para o próximo ciclo
      continue
    }
    const { error: e } = await db
      .from('disparos')
      .update({ status: 'falhou', erro: 'ciclo interrompido no meio do envio (não reenviar)', atualizado_em: agora.toISOString() })
      .eq('id', p.id)
      .eq('status', 'reservado')
    if (e) throw new Error(`reserva parada ${p.id}: ${e.message}`)
  }
}

export async function rodarCiclo(agora = new Date(), prazo: Prazo = prazoAte(agora.getTime() + CICLO_MS)) {
  const db = supabaseAdmin()
  await recolherReservasParadas(agora)

  const { data: cfg, error } = await db.from('disparo_config').select('*').eq('id', 1).single()
  if (error) throw new Error(`regras: ${error.message}`)
  const janela = dentroDaJanela(cfg, agora)
  if (!janela.ok) return { ok: true, pulado: janela.motivo, numeros: [] as Resultado[] }

  const { count: ativas, error: eAtivas } = await db.from('disparo_campanhas').select('id', { count: 'exact', head: true }).eq('status', 'ativa')
  if (eAtivas) throw new Error(`campanhas ativas: ${eAtivas.message}`)
  if (!ativas) return { ok: true, pulado: 'nenhuma campanha ativa', numeros: [] as Resultado[] }

  const { data: numeros, error: eNumeros } = await db
    .from('disparo_numeros')
    .select('*')
    .eq('ativo', true)
    .lte('proximo_envio_em', agora.toISOString())
  if (eNumeros) throw new Error(`números: ${eNumeros.message}`)
  if (!numeros?.length) return { ok: true, pulado: 'nenhum número pronto agora', numeros: [] as Resultado[] }

  const resultados = await Promise.all(
    (numeros as NumeroComChave[]).map(n =>
      cicloDoNumero(n, agora, prazo).catch((e): Resultado => {
        console.error('[disparos] número', n.id, e)
        return { numero: n.id, rotulo: n.rotulo, resultado: `erro: ${msg(e)}` }
      })
    )
  )
  return { ok: true, pulado: null, numeros: resultados }
}

type Adiar = (segundos: number, extra?: Record<string, unknown>) => Promise<void>

async function cicloDoNumero(n: NumeroComChave, agora: Date, prazo: Prazo): Promise<Resultado> {
  const db = supabaseAdmin()
  const r = (resultado: string, disparo?: number): Resultado => ({ numero: n.id, rotulo: n.rotulo, resultado, disparo })
  const adiar: Adiar = async (segundos, extra = {}) => {
    const { error } = await db
      .from('disparo_numeros')
      .update({ proximo_envio_em: new Date(Date.now() + segundos * 1000).toISOString(), ...extra })
      .eq('id', n.id)
    if (error) console.error('[disparos] adiar número', n.id, error.message) // a trava de 5 min segura o número
  }

  // Sem tempo para um envio inteiro: nem trava o número (o próximo ciclo pega).
  if (prazo.restante() < 35_000) return r('sem tempo neste ciclo')

  // Trava: só este ciclo usa o número pelos próximos 5 minutos (UPDATE condicional = atômico).
  const { data: trava, error: eTrava } = await db
    .from('disparo_numeros')
    .update({ proximo_envio_em: new Date(agora.getTime() + 5 * 60_000).toISOString() })
    .eq('id', n.id)
    .lte('proximo_envio_em', agora.toISOString())
    .select('id')
  if (eTrava) return r(`banco fora do ar ao travar o número (não envia): ${eTrava.message}`)
  if (!trava?.length) return r('ocupado por outro ciclo')

  const { count: hoje, error: eHoje } = await db
    .from('disparos')
    .select('id', { count: 'exact', head: true })
    .eq('numero_id', n.id)
    .eq('teste', false)
    .gte('enviado_em', inicioDoDiaBrasilia(agora))
  if (eHoje || hoje === null) {
    await adiar(60)
    return r(`contagem do dia falhou (não envia neste ciclo): ${eHoje?.message ?? 'sem resposta'}`)
  }
  if (hoje >= n.limite_diario) {
    await adiar(20 * 60)
    return r(`limite diário atingido (${hoje}/${n.limite_diario})`)
  }

  const canal = canalDe(n)
  const quando = new Date().toISOString()
  try {
    const s = await lerSessao(canal, { dispositivo: false })
    if (s?.status !== 'WORKING') {
      await adiar(5 * 60, { status: s?.status ?? 'DESCONHECIDO', status_detalhe: 'sessão fora do ar', status_em: quando })
      return r(`sessão ${s?.status ?? '?'}`)
    }
  } catch (e) {
    await adiar(5 * 60, { status: 'ERRO', status_detalhe: msg(e), status_em: quando })
    return r(`provedor inacessível: ${msg(e)}`)
  }

  if (prazo.restante() < 30_000) {
    await adiar(0)
    return r('sem tempo neste ciclo (a sessão demorou a responder)')
  }

  const { d, error } = await reservar(n.id)
  if (error) {
    await adiar(5 * 60)
    throw new Error(`reservar: ${error.message}`)
  }
  if (!d) {
    await adiar(5 * 60)
    return r('nenhuma empresa elegível nas campanhas ativas')
  }

  return enviarPrimeira(d, n, canal, adiar, r, prazo)
}

/** Reserva a próxima empresa já com a marca de "preparando" (sem a migração 020, reserva do jeito antigo). */
async function reservar(numeroId: number) {
  const db = supabaseAdmin()
  const novo = await db.rpc('disparo_reservar', { p_numero: numeroId, p_preparar: true })
  const { data, error } = faltaNoBanco(novo.error) ? await db.rpc('disparo_reservar', { p_numero: numeroId }) : novo
  return { d: (data as Disparo[] | null)?.[0] ?? null, error }
}

async function enviarPrimeira(d: Disparo, n: NumeroComChave, canal: Canal, adiar: Adiar, r: (resultado: string, disparo?: number) => Resultado, prazo: Prazo): Promise<Resultado> {
  const db = supabaseAdmin()
  const agoraIso = () => new Date().toISOString()
  const atualizar = async (campos: Partial<Disparo>) => {
    for (let i = 0; i < 2; i++) {
      const { error } = await db.from('disparos').update({ ...campos, atualizado_em: agoraIso() }).eq('id', d.id)
      if (!error) return true
      console.error('[disparos] atualizar disparo', d.id, error.message)
    }
    return false
  }
  const devolver = () => devolverReserva(d.id)

  let c: Campanha
  try {
    c = comFormatoDoNumero(await carregarCampanha(d.campanha_id), n)
  } catch (e) {
    await devolver()
    await adiar(5 * 60)
    return r(`campanha não carregou (a empresa voltou para a fila): ${msg(e)}`)
  }

  // 1) O número tem WhatsApp? (e qual é o chatId certo, com ou sem o 9)
  let chat: string
  try {
    const v = await verificarNumero(canal, d.telefone)
    if (!v.existe || !v.chatId) {
      await atualizar({ status: 'sem_whatsapp', erro: null })
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

  // 3) Só começa o envio que cabe inteiro no prazo; o que não cabe volta para a fila (ninguém foi contatado)
  if (prazo.restante() < tempoDeEnvio(canal, m) + tempoDigitando(canal) + 2_000) {
    await devolver()
    await adiar(30)
    return r('sem tempo para enviar neste ciclo: a empresa voltou para a fila')
  }

  // 4) Daqui em diante a mensagem PODE sair: tira a marca de "preparando" (se o ciclo morrer agora, a reserva vira
  //    "falhou" e nunca é reenviada). Sem conseguir gravar isso, não envia.
  const { data: marcou, error: eMarca } = await db
    .from('disparos')
    .update({ erro: null, chat_id: chat, atualizado_em: agoraIso() })
    .eq('id', d.id)
    .eq('status', 'reservado')
    .select('id')
  if (eMarca) {
    await devolver()
    await adiar(60)
    return r(`banco fora do ar antes do envio (a empresa voltou para a fila): ${eMarca.message}`)
  }
  if (!marcou?.length) {
    await adiar(60)
    return r('a reserva mudou antes do envio (não enviado)', d.id)
  }

  await digitar(canal, chat, sorteio(2500, 5000))
  let msgId: string | null
  try {
    try {
      msgId = await enviarRica(canal, chat, m)
    } catch (e) {
      // Botão recusado pelo WAHA (4xx = formato): manda logo + texto pedindo SIM, para não perder o contato
      if (!(m.botoes?.length && e instanceof ErroWaha && e.status && e.status < 500)) throw e
      if (prazo.restante() < 32_000) {
        // não saiu nada (4xx): devolve a empresa; o próximo ciclo manda como texto desde o começo
        await devolver()
        await adiar(30)
        return r(`botão recusado e sem tempo para mandar como texto (a empresa voltou para a fila): ${msg(e)}`)
      }
      m = primeiraMensagem({ ...c, formato: 'texto' }, d)
      msgId = await enviarRica(canal, chat, m)
      await registrarEvento({ disparo_id: d.id, numero_id: n.id, tipo: 'erro', texto: `botão recusado, foi como texto: ${msg(e)}` })
    }
  } catch (e) {
    const erro = msg(e)
    if (e instanceof ErroWaha && e.enviado === 'nao' && (!e.status || e.status >= 500)) {
      // problema do provedor/sessão, e a mensagem não saiu: devolve a empresa e dá um tempo ao número
      await devolver()
      await adiar(10 * 60, { status: 'ERRO', status_detalhe: `envio: ${erro}`, status_em: agoraIso() })
      return r(`provedor recusou o envio: ${erro}`)
    }
    // recusado para ESTE destinatário (4xx) ou pode ter saído (timeout): registra e nunca reenvia
    await atualizar({ status: 'falhou', erro: `envio: ${erro}`, chat_id: chat })
    await adiar(sorteio(60, 120))
    return r(`falhou: ${erro}`, d.id)
  }

  const enviadoEm = agoraIso()
  if (!(await atualizar({ status: 'enviado', chat_id: chat, msg_id: msgId, enviado_em: enviadoEm, erro: null }))) {
    console.error('[disparos] ENVIADO mas não gravado', d.id, '— a reserva vai virar "falhou" (nunca reenvia)')
  }
  await registrarEvento({ disparo_id: d.id, numero_id: n.id, tipo: 'enviada', direcao: 'saida', texto: descrever(m), wa_id: msgId })

  // 5) Formato antigo: enquete logo depois
  if (enquete) {
    if (prazo.restante() < 34_000) {
      await atualizar({ erro: 'enquete não saiu: sem tempo no ciclo (a pessoa pode responder SIM)' })
    } else {
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
          if (prazo.restante() > 12_000) await responder({ id: d.id, chat_id: chat }, n, RESPOSTAS.sem_botao, { visto: false })
        } catch {
          // a 1ª mensagem já saiu; a pessoa ainda pode responder
        }
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
  return enviarPrimeira(d, n, canalDe(n), async () => {}, r, SEM_PRAZO)
}
