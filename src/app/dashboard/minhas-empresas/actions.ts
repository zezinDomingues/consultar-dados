'use server'

import { revalidatePath } from 'next/cache'
import { ROTAS } from '@/lib/rotas'
import { createClient } from '@/lib/supabase/server'

/** Libera o contato de uma empresa do plano (consome 1 da cota; liberar de novo não cobra). */
export async function liberarEmpresa(cnpj: string): Promise<{ ok?: boolean; erro?: string; saldo?: number }> {
  if (!/^\d{14}$/.test(cnpj)) return { erro: 'CNPJ inválido.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('cliente_liberar', { p_cnpj: cnpj })
  if (error) {
    const m = error.message
    return {
      erro: /saldo esgotado/.test(m)
        ? 'Seu saldo de empresas acabou. Fale com a OficialCert para renovar.'
        : /fora do seu plano/.test(m)
          ? 'Esta empresa está fora do seu plano.'
          : /sem plano/.test(m)
            ? 'Seu plano não está ativo.'
            : 'Não foi possível liberar agora.'
    }
  }
  revalidatePath(ROTAS.minhasEmpresas)
  return { ok: true, saldo: Number((data as { saldo?: unknown })?.saldo ?? 0) }
}
