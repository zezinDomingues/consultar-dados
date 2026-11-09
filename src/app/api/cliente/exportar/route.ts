import { NextResponse } from 'next/server'
import type { EmpresaCliente } from '@/lib/clientes/dados'
import { avisoCorte, celula, linha, respostaCsv } from '@/lib/csv'
import { usuarioAtual } from '@/lib/empresas/consulta'
import { createClient } from '@/lib/supabase/server'

// CSV das empresas que o cliente já liberou (o banco só devolve as dele, com os contatos).
export const dynamic = 'force-dynamic'

const LOTE = 500
const LIMITE = 50_000

const erro = (texto: string, status: number) => NextResponse.json({ erro: texto }, { status })

/** Cada falha com a sua mensagem (antes, tudo virava "Plano inativo"). */
function explicar(e: { code?: string; message?: string }) {
  if (/sem plano ativo/i.test(e.message ?? '')) {
    return erro('Seu plano da Consulta de dados venceu ou foi desativado. Fale com a OficialCert para renovar.', 403)
  }
  if (e.code === '57014') return erro('A exportação demorou mais que o normal. Tente de novo em instantes.', 503)
  return erro('Não foi possível gerar o arquivo agora. Tente de novo em instantes.', 503)
}

export async function GET() {
  let u: Awaited<ReturnType<typeof usuarioAtual>>
  try {
    u = await usuarioAtual()
  } catch {
    return erro('Não foi possível verificar sua sessão agora. Tente de novo em instantes.', 503)
  }
  if (!u) return erro('Faça login.', 401)
  if (u.papel !== 'cliente') return erro('Somente clientes.', 403)
  if (!u.produtos?.consulta) return erro('Seu acesso não inclui a Consulta de dados.', 403)

  const supabase = await createClient()
  const linhas = [
    linha(['CNPJ', 'Razão social', 'Nome fantasia', 'Atividade', 'Município', 'UF', 'Porte', 'Regime', 'Capital social', 'WhatsApp', 'Telefone', 'E-mail', 'Endereço', 'Liberada em'])
  ]
  let n = 0
  for (let pagina = 1; n < LIMITE; pagina++) {
    const { data, error } = await supabase.rpc('cliente_buscar', { f: {}, ordem: 'liberadas', limite: LOTE, pagina, so_liberadas: true })
    if (error) {
      console.error('[cliente/exportar]', error.code, error.message)
      if (pagina === 1) return explicar(error)
      linhas.push(celula(`Arquivo incompleto: a base parou de responder depois de ${n.toLocaleString('pt-BR')} linhas — baixe de novo.`))
      break
    }
    const itens = (data ?? []) as EmpresaCliente[]
    for (const e of itens) {
      linhas.push(
        linha([
          e.cnpj_formatado, e.razao_social, e.nome_fantasia, e.atividade_principal, e.municipio, e.uf, e.porte, e.regime,
          e.capital_social == null ? '' : String(e.capital_social).replace('.', ','), e.whatsapp, e.telefone1, e.email, e.endereco,
          e.liberada_em ? new Date(e.liberada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : ''
        ])
      )
    }
    n += itens.length
    if (itens.length < LOTE) break
    if (n >= LIMITE) linhas.push(avisoCorte(LIMITE))
  }
  return respostaCsv(linhas, `empresas-liberadas-${new Date().toISOString().slice(0, 10)}.csv`)
}
