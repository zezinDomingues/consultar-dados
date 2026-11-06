// Usuários da plataforma (só servidor, só admin). Logins ficam no Auth do Supabase; papel, ramos e planos nas
// tabelas app_usuarios, equipe_ramos e clientes_* (migração 012). Lido com a chave secreta DEPOIS de exigirAdmin().
import 'server-only'
import { exigirAdmin } from '@/lib/disparos/dados'
import type { Papel } from '@/lib/empresas/consulta'
import { supabaseAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export type SaldoCliente = {
  modalidade: 'mensal' | 'pacote'
  limite: number
  usadas: number
  saldo: number
  ramos: string[]
  ufs: string[] | null
  validade: string | null
  vencido: boolean
  total_liberadas: number
}

export type Usuario = {
  user_id: string
  email: string
  nome: string | null
  papel: Papel
  ativo: boolean
  criado_em: string
  ultimo_acesso: string | null
  ramos: string[] // equipe
  plano: (SaldoCliente & { cota_mensal: number | null; observacao: string | null }) | null // cliente
  pacotes: { id: number; quantidade: number; observacao: string | null; criado_em: string }[]
}

async function ultimosAcessos() {
  const mapa = new Map<string, string | null>()
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin().auth.admin.listUsers({ page, perPage: 200 })
    if (error) break
    for (const u of data.users) mapa.set(u.id, u.last_sign_in_at ?? null)
    if (data.users.length < 200) break
  }
  return mapa
}

export async function listarUsuarios(): Promise<Usuario[]> {
  await exigirAdmin()
  const db = supabaseAdmin()
  const [{ data: usuarios }, { data: ramos }, { data: acessos }, { data: pacotes }, acessosAuth] = await Promise.all([
    db.from('app_usuarios').select('*').order('criado_em'),
    db.from('equipe_ramos').select('*'),
    db.from('clientes_acesso').select('*'),
    db.from('clientes_pacotes').select('*').order('criado_em'),
    ultimosAcessos()
  ])
  const supabase = await createClient() // cliente_saldo(p_user) confere que quem pede é admin
  const clientes = ((usuarios ?? []) as { user_id: string; papel: string }[]).filter(u => u.papel === 'cliente')
  const saldos = new Map(
    await Promise.all(
      clientes.map(async u => [u.user_id, (await supabase.rpc('cliente_saldo', { p_user: u.user_id })).data as SaldoCliente | null] as const)
    )
  )
  return ((usuarios ?? []) as Omit<Usuario, 'ramos' | 'plano' | 'pacotes' | 'ultimo_acesso'>[]).map(u => {
    const acesso = ((acessos ?? []) as { user_id: string; cota_mensal: number | null; observacao: string | null }[]).find(a => a.user_id === u.user_id)
    const saldo = saldos.get(u.user_id)
    return {
      ...u,
      ultimo_acesso: acessosAuth.get(u.user_id) ?? null,
      ramos: ((ramos ?? []) as { user_id: string; ramo: string }[]).filter(r => r.user_id === u.user_id).map(r => r.ramo).sort(),
      plano: acesso && saldo ? { ...saldo, cota_mensal: acesso.cota_mensal, observacao: acesso.observacao } : null,
      pacotes: ((pacotes ?? []) as (Usuario['pacotes'][number] & { user_id: string })[]).filter(p => p.user_id === u.user_id)
    }
  })
}

export async function obterUsuario(id: string) {
  return (await listarUsuarios()).find(u => u.user_id === id) ?? null
}
