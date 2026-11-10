'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { meusGruposCalendario } from '@/lib/calendario/dados'
import { dataValida, horaValida, instante, PASSADO_TOLERANCIA_MS, DURACAO_MAXIMA_MS } from '@/lib/calendario/datas'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'

export type Retorno = { ok?: boolean; erro?: string; mensagem?: string }

const idPositivo = (msg: string) => z.coerce.number({ error: msg }).int(msg).positive(msg)

// Todas as mensagens em português (QA-07): campo apagado chega como undefined e o zod responderia em inglês.
const Reuniao = z.object({
  id: idPositivo('Reunião inválida.').optional(),
  titulo: z.string({ error: 'Dê um título.' }).trim().min(1, 'Dê um título.').max(160, 'Título com no máximo 160 caracteres.'),
  data: z.string({ error: 'Informe a data.' }).refine(dataValida, 'Data inválida.'),
  // opcional: reunião que passa da meia-noite (sem ela, termina no mesmo dia)
  data_fim: z.string().refine(dataValida, 'Data de fim inválida.').optional(),
  hora_inicio: z.string({ error: 'Informe a hora de início.' }).refine(horaValida, 'Hora de início inválida.'),
  hora_fim: z.string({ error: 'Informe a hora de fim.' }).refine(horaValida, 'Hora de fim inválida.'),
  local: z.string().trim().max(300, 'Local com no máximo 300 caracteres.').optional().transform(v => v || null),
  descricao: z.string().trim().max(4000, 'Descrição com no máximo 4.000 caracteres.').optional().transform(v => v || null),
  cnpj: z
    .string()
    .trim()
    .optional()
    .refine(v => !v || v.replace(/\D/g, '').length === 14, 'CNPJ inválido: informe os 14 dígitos.')
    .transform(v => (v ? v.replace(/\D/g, '') : null)),
  disparo_id: idPositivo('Contato inválido.').optional(),
  grupo_id: idPositivo('Escolha o grupo da reunião.')
})

type Anterior = { id: number; inicio: string; criado_por: string; grupo_id: number; disparo_id: number | null; cnpj: string | null }

async function exigirEquipe() {
  const u = await usuarioAtual()
  // equipe interna ou cliente que faz parte de um grupo; o banco ainda confere se a reunião é de um grupo dele
  if (!u?.autorizado && !(u?.papel === 'cliente' && u.produtos?.disparos)) return null
  return u
}

export async function salvarReuniao(_: Retorno, fd: FormData): Promise<Retorno> {
  const u = await exigirEquipe()
  if (!u) return { erro: 'Calendário só para quem faz parte de um grupo.' }
  const obj = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ''))
  const p = Reuniao.safeParse(obj)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const r = p.data

  // datas impossíveis já foram barradas; agora a ordem e o tamanho (QA-07, BE-18)
  const inicio = instante(r.data, r.hora_inicio)
  const fim = instante(r.data_fim ?? r.data, r.hora_fim)
  if (fim <= inicio) {
    return {
      erro: r.data_fim
        ? 'O fim precisa ser depois do início.'
        : 'O fim precisa ser depois do início (a reunião começa e termina no mesmo dia).'
    }
  }
  if (fim.getTime() - inicio.getTime() > DURACAO_MAXIMA_MS) return { erro: 'A reunião pode durar no máximo 24 horas.' }

  const supabase = await createClient()
  let anterior: Anterior | null = null
  if (r.id) {
    const { data } = await supabase
      .from('reunioes')
      .select('id, inicio, criado_por, grupo_id, disparo_id, cnpj')
      .eq('id', r.id)
      .maybeSingle()
    anterior = data as Anterior | null
    if (!anterior) return { erro: 'Reunião não encontrada.' }
    if (!u.admin && anterior.criado_por !== u.id) return { erro: 'Só quem criou a reunião (ou um admin) pode alterá-la.' }
  }

  // Reunião no passado (QA-08): a NOVA é recusada (sem "confirmar mesmo assim"). Na edição, corrigir uma reunião
  // que já aconteceu pode (a tela só avisa); levar para o passado uma reunião que ainda não aconteceu, não.
  const agora = Date.now() - PASSADO_TOLERANCIA_MS
  const jaAconteceu = !!anterior && new Date(anterior.inicio).getTime() < agora
  if (!jaAconteceu && inicio.getTime() < agora) {
    return {
      erro: anterior
        ? 'Não dá para mover a reunião para o passado: escolha uma data e hora a partir de agora.'
        : 'A reunião não pode começar no passado: escolha uma data e hora a partir de agora.'
    }
  }

  // Só nos grupos de que a pessoa faz parte (o admin, em todos). O banco também barra (RLS).
  const grupos = await meusGruposCalendario(!!u.admin, u.id)
  if (!grupos.some(g => g.id === r.grupo_id)) return { erro: 'Você só pode marcar reuniões nos grupos de que faz parte.' }

  // Contato e empresa ligados à reunião: só os que a pessoa enxerga (SEC-09). O que já estava gravado e não mudou passa.
  let cnpjDoContato: string | null = null
  if (r.disparo_id && r.disparo_id !== anterior?.disparo_id) {
    const { data } = await supabase.from('disparos').select('id, cnpj').eq('id', r.disparo_id).maybeSingle()
    if (!data) return { erro: 'Esse contato dos disparos não existe ou você não tem acesso a ele.' }
    cnpjDoContato = (data as { cnpj: string | null }).cnpj
  }
  if (r.cnpj && r.cnpj !== anterior?.cnpj && r.cnpj !== cnpjDoContato && !(await enxergaEmpresa(supabase, u.autorizado, r.cnpj))) {
    return {
      erro: u.autorizado
        ? 'CNPJ não encontrado na base.'
        : 'Esse CNPJ não é de um contato dos seus disparos nem de uma empresa liberada para você.'
    }
  }

  // criado_por nunca vai no update: a reunião continua de quem a criou
  const linha = {
    titulo: r.titulo,
    inicio: inicio.toISOString(),
    fim: fim.toISOString(),
    local: r.local,
    descricao: r.descricao,
    cnpj: r.cnpj,
    disparo_id: r.disparo_id ?? null,
    grupo_id: r.grupo_id
  }
  const { error, count } = r.id
    ? await supabase.from('reunioes').update(linha, { count: 'exact' }).eq('id', r.id)
    : await supabase.from('reunioes').insert(linha, { count: 'exact' })
  if (error) {
    if (/row-level security/i.test(error.message)) return { erro: 'Você só pode marcar reuniões nos seus grupos.' }
    console.error('reunião:', error.message)
    return { erro: 'Não foi possível salvar a reunião agora. Tente de novo em instantes.' }
  }
  if (r.id && !count) return { erro: 'Só quem criou a reunião (ou um admin) pode alterá-la.' }
  if (!r.id && !count) return { erro: 'Você só pode marcar reuniões nos seus grupos.' }
  revalidatePath(ROTAS.calendario)
  return { ok: true, mensagem: r.id ? 'Reunião atualizada.' : 'Reunião marcada.' }
}

async function enxergaEmpresa(supabase: Awaited<ReturnType<typeof createClient>>, interno: boolean, cnpj: string) {
  if (interno) {
    const { data } = await supabase.from('empresas').select('cnpj').eq('cnpj', cnpj).maybeSingle()
    return !!data
  }
  // cliente: não lê a base; vale o CNPJ de um contato do grupo dele ou de uma empresa que ele liberou
  const [{ count: contatos }, { count: liberadas }] = await Promise.all([
    supabase.from('disparos').select('id', { count: 'exact', head: true }).eq('cnpj', cnpj),
    supabase.from('clientes_liberacoes').select('cnpj', { count: 'exact', head: true }).eq('cnpj', cnpj)
  ])
  return !!contatos || !!liberadas
}

export async function excluirReuniao(id: number): Promise<Retorno> {
  if (!(await exigirEquipe())) return { erro: 'Calendário só para quem faz parte de um grupo.' }
  if (!Number.isInteger(id) || id <= 0) return { erro: 'Reunião inválida.' }
  const supabase = await createClient()
  const { error, count } = await supabase.from('reunioes').delete({ count: 'exact' }).eq('id', id)
  if (error) {
    console.error('excluir reunião:', error.message)
    return { erro: 'Não foi possível excluir a reunião agora. Tente de novo em instantes.' }
  }
  if (!count) return { erro: 'Só quem criou a reunião (ou um admin) pode excluí-la.' }
  revalidatePath(ROTAS.calendario)
  return { ok: true, mensagem: 'Reunião excluída.' }
}
