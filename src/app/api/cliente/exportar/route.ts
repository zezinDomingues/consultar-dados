import { NextResponse } from 'next/server'
import { buscarCliente } from '@/lib/clientes/dados'
import { usuarioAtual } from '@/lib/empresas/consulta'

// CSV das empresas que o cliente já liberou (o banco só devolve as dele, com os contatos).
export const dynamic = 'force-dynamic'

const campo = (v: unknown) => {
  const s = v == null ? '' : String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET() {
  const u = await usuarioAtual()
  if (u?.papel !== 'cliente') return NextResponse.json({ erro: 'Somente clientes.' }, { status: 403 })
  const linhas = [
    ['CNPJ', 'Razão social', 'Nome fantasia', 'Atividade', 'Município', 'UF', 'Porte', 'Regime', 'Capital social', 'WhatsApp', 'Telefone', 'E-mail', 'Endereço', 'Liberada em'].join(';')
  ]
  try {
    for (let pagina = 1; pagina <= 100; pagina++) {
      const { itens } = await buscarCliente({}, 'liberadas', pagina, 500, true)
      for (const e of itens) {
        linhas.push(
          [e.cnpj_formatado, e.razao_social, e.nome_fantasia, e.atividade_principal, e.municipio, e.uf, e.porte, e.regime, e.capital_social, e.whatsapp, e.telefone1, e.email, e.endereco, e.liberada_em ? new Date(e.liberada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '']
            .map(campo)
            .join(';')
        )
      }
      if (itens.length < 500) break
    }
  } catch {
    return NextResponse.json({ erro: 'Plano inativo.' }, { status: 403 })
  }
  return new NextResponse('﻿' + linhas.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="empresas-liberadas-${new Date().toISOString().slice(0, 10)}.csv"` }
  })
}
