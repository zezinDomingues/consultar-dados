'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'

export type Retorno = { ok?: boolean; erro?: string; mensagem?: string }

const Reuniao = z
  .object({
    id: z.coerce.number().int().positive().optional(),
    titulo: z.string().trim().min(1, 'Dê um título.').max(160),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida.'),
    hora_inicio: z.string().regex(/^\d{2}:\d{2}$/, 'Hora de início inválida.'),
    hora_fim: z.string().regex(/^\d{2}:\d{2}$/, 'Hora de fim inválida.'),
    local: z.string().trim().max(300).optional().transform(v => v || null),
    descricao: z.string().trim().max(4000).optional().transform(v => v || null),
    cnpj: z
      .string()
      .trim()
      .optional()
      .transform(v => (v ? v.replace(/\D/g, '') || null : null)),
    disparo_id: z.coerce.number().int().positive().optional()
  })
  .refine(r => r.hora_fim > r.hora_inicio, { message: 'O fim precisa ser depois do início.' })

/** Data + hora digitadas em Brasília → instante (o Brasil não tem horário de verão desde 2019). */
const instante = (data: string, hora: string) => new Date(`${data}T${hora}:00-03:00`).toISOString()

async function exigirEquipe() {
  const u = await usuarioAtual()
  if (!u?.autorizado) throw new Error('Calendário só para a equipe.')
  return u
}

export async function salvarReuniao(_: Retorno, fd: FormData): Promise<Retorno> {
  await exigirEquipe()
  const obj = Object.fromEntries([...fd.entries()].filter(([, v]) => v !== ''))
  const p = Reuniao.safeParse(obj)
  if (!p.success) return { erro: p.error.issues[0]?.message ?? 'Dados inválidos.' }
  const r = p.data
  const linha = {
    titulo: r.titulo,
    inicio: instante(r.data, r.hora_inicio),
    fim: instante(r.data, r.hora_fim),
    local: r.local,
    descricao: r.descricao,
    cnpj: r.cnpj,
    disparo_id: r.disparo_id ?? null
  }
  const supabase = await createClient()
  const { error, count } = r.id
    ? await supabase.from('reunioes').update(linha, { count: 'exact' }).eq('id', r.id)
    : await supabase.from('reunioes').insert(linha, { count: 'exact' })
  if (error) return { erro: error.message }
  if (r.id && !count) return { erro: 'Só quem criou a reunião (ou um admin) pode alterá-la.' }
  revalidatePath(ROTAS.calendario)
  return { ok: true, mensagem: r.id ? 'Reunião atualizada.' : 'Reunião marcada.' }
}

export async function excluirReuniao(id: number): Promise<Retorno> {
  await exigirEquipe()
  const supabase = await createClient()
  const { error, count } = await supabase.from('reunioes').delete({ count: 'exact' }).eq('id', id)
  if (error) return { erro: error.message }
  if (!count) return { erro: 'Só quem criou a reunião (ou um admin) pode excluí-la.' }
  revalidatePath(ROTAS.calendario)
  return { ok: true, mensagem: 'Reunião excluída.' }
}
