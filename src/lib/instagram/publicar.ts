// Publicação na @oficialcert pela API oficial da Meta (Instagram Graph API, login unificado).
// Duas fases por item da agenda: (1) cria o container (para carrossel, um por tela + o pai);
// (2) quando a Meta termina de processar, publica. Vídeo pode levar minutos: cada chamada do ciclo
// avança o que der e devolve, sem esperar além do orçamento de tempo.
import 'server-only'
import { supabaseAdmin } from '@/lib/supabase/admin'

const GRAPH = 'https://graph.facebook.com/v23.0'

export type ItemAgenda = {
  id: number
  quando: string
  tipo: 'imagem' | 'carrossel' | 'reel' | 'story'
  titulo: string
  midias: string[]
  capa: string | null
  legenda: string
  alt: string | null
  status: string
  container_id: string | null
  tentativas: number
}

type Credenciais = { token: string; userId: string }

async function credenciais(): Promise<Credenciais | null> {
  const token = process.env.IG_ACCESS_TOKEN?.trim()
  const userId = process.env.IG_USER_ID?.trim()
  if (token && userId) return { token, userId }
  const { data, error } = await supabaseAdmin().rpc('instagram_credenciais')
  if (error) throw new Error(`credenciais do Instagram: ${error.message}`)
  const linha = Array.isArray(data) ? data[0] : data
  return linha?.token && linha?.user_id ? { token: linha.token, userId: linha.user_id } : null
}

class ErroMeta extends Error {
  constructor(msg: string, readonly transitorio: boolean) {
    super(msg)
  }
}

async function graph(c: Credenciais, caminho: string, params: Record<string, string>, metodo: 'GET' | 'POST' = 'POST') {
  const corpo = new URLSearchParams({ ...params, access_token: c.token })
  const r =
    metodo === 'POST'
      ? await fetch(`${GRAPH}/${caminho}`, { method: 'POST', body: corpo, signal: AbortSignal.timeout(20_000) })
      : await fetch(`${GRAPH}/${caminho}?${corpo}`, { signal: AbortSignal.timeout(20_000) })
  const j = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: number; is_transient?: boolean } } & Record<string, unknown>
  if (j.error || !r.ok) {
    const e = j.error ?? {}
    // 4/17/32/613 = limite de chamadas; 2 = serviço indisponível; 5xx = tente de novo
    const transitorio = !!e.is_transient || [1, 2, 4, 17, 32, 613].includes(e.code ?? 0) || r.status >= 500
    throw new ErroMeta(`${caminho}: ${e.message ?? `HTTP ${r.status}`}`, transitorio)
  }
  return j
}

/** Cria o(s) container(s) na Meta e devolve o id do container que será publicado. */
async function criarContainer(c: Credenciais, it: ItemAgenda): Promise<string> {
  const u = `${c.userId}/media`
  if (it.tipo === 'imagem') {
    const p: Record<string, string> = { image_url: it.midias[0], caption: it.legenda }
    if (it.alt) p.alt_text = it.alt
    return String((await graph(c, u, p)).id)
  }
  if (it.tipo === 'story') {
    const video = it.midias[0].endsWith('.mp4')
    return String((await graph(c, u, { media_type: 'STORIES', [video ? 'video_url' : 'image_url']: it.midias[0] })).id)
  }
  if (it.tipo === 'reel') {
    const p: Record<string, string> = { media_type: 'REELS', video_url: it.midias[0], caption: it.legenda, share_to_feed: 'true' }
    if (it.capa) p.cover_url = it.capa
    return String((await graph(c, u, p)).id)
  }
  // carrossel: um container por tela (texto alternativo na capa) e depois o pai
  const filhos: string[] = []
  for (const [i, url] of it.midias.entries()) {
    const video = url.endsWith('.mp4')
    const p: Record<string, string> = { is_carousel_item: 'true', [video ? 'video_url' : 'image_url']: url }
    if (video) p.media_type = 'VIDEO'
    if (i === 0 && it.alt && !video) p.alt_text = it.alt
    filhos.push(String((await graph(c, u, p)).id))
  }
  return String((await graph(c, u, { media_type: 'CAROUSEL', children: filhos.join(','), caption: it.legenda })).id)
}

async function salvar(id: number, campos: Record<string, unknown>) {
  const { error } = await supabaseAdmin()
    .from('instagram_agenda')
    .update({ ...campos, atualizado_em: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`agenda ${id}: ${error.message}`)
}

/** Avança um item: cria o container, ou publica quando a Meta terminou de processar. */
async function avancar(c: Credenciais, it: ItemAgenda) {
  try {
    if (!it.container_id) {
      const container = await criarContainer(c, it)
      await salvar(it.id, { container_id: container, erro: null })
      it.container_id = container
    }
    const { status_code } = (await graph(c, it.container_id, { fields: 'status_code' }, 'GET')) as { status_code?: string }
    if (status_code === 'IN_PROGRESS' || status_code === undefined) return { id: it.id, etapa: 'processando' }
    if (status_code === 'ERROR' || status_code === 'EXPIRED') {
      // container ruim: descarta e tenta do zero no próximo ciclo (até 3 vezes)
      await salvar(it.id, {
        container_id: null,
        status: it.tentativas >= 3 ? 'erro' : 'agendado',
        erro: `a Meta recusou a mídia (${status_code})`
      })
      return { id: it.id, etapa: 'container recusado' }
    }
    const pub = await graph(c, `${c.userId}/media_publish`, { creation_id: it.container_id })
    const mediaId = String(pub.id)
    let permalink: string | null = null
    try {
      permalink = String((await graph(c, mediaId, { fields: 'permalink' }, 'GET')).permalink ?? '') || null
    } catch {
      /* story não tem permalink público */
    }
    await salvar(it.id, { status: 'publicado', media_id: mediaId, permalink, publicado_em: new Date().toISOString(), erro: null })
    return { id: it.id, etapa: 'publicado', permalink }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const transitorio = e instanceof ErroMeta ? e.transitorio : true
    const desistir = !transitorio || it.tentativas >= 3
    await salvar(it.id, { status: desistir ? 'erro' : 'agendado', container_id: desistir ? it.container_id : null, erro: msg.slice(0, 500) })
    console.error('[instagram]', it.id, msg)
    return { id: it.id, etapa: desistir ? 'erro' : 'nova tentativa', erro: msg }
  }
}

/** Uma rodada do ciclo: avança itens até o orçamento de tempo acabar. */
export async function rodarCicloInstagram(orcamentoMs = 45_000) {
  const inicio = Date.now()
  const c = await credenciais()
  if (!c) return { ok: false, motivo: 'sem credenciais do Instagram (IG_ACCESS_TOKEN / Vault instagram_token)' }
  const feitos: unknown[] = []
  const vistos = new Set<number>()
  while (Date.now() - inicio < orcamentoMs) {
    const { data, error } = await supabaseAdmin().rpc('instagram_reservar')
    if (error) throw new Error(`instagram_reservar: ${error.message}`)
    const it = (Array.isArray(data) ? data[0] : data) as ItemAgenda | undefined
    if (!it || vistos.has(it.id)) break // nada a fazer, ou o mesmo item ainda processando
    vistos.add(it.id)
    feitos.push(await avancar(c, it))
  }
  return { ok: true, feitos }
}
