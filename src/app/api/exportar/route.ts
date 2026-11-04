import { NextResponse, type NextRequest } from 'next/server'
import { buscarEmpresas, SemAcessoError } from '@/lib/empresas/consulta'
import { LIMITE_EXPORTACAO, lerConsulta } from '@/lib/empresas/filtros'

// Colunas do CSV (nome no arquivo, coluna da view empresas_completa)
const COLUNAS: [string, string][] = [
  ['CNPJ', 'cnpj_formatado'], ['Razão social', 'razao_social'], ['Nome fantasia', 'nome_fantasia'],
  ['Prioridade', 'prioridade'], ['Score', 'score'], ['Tipo de negócio', 'tipo_negocio'],
  ['Setor', 'setor'], ['Ramo', 'ramo'], ['Segmento', 'segmento'], ['CNAE principal', 'cnae_fmt'],
  ['Atividade principal', 'atividade_principal'], ['CNAEs secundários', 'cnaes_secundarios'],
  ['Regime (ECF)', 'regime'], ['Ano ECF', 'ano_ecf'], ['Simples out/2026', 'simples_out2026'],
  ['Situação do regime', 'situacao_regime'], ['Porte', 'porte'], ['Capital social', 'capital_social'],
  ['Abertura', 'data_abertura'], ['Idade (anos)', 'idade_anos'], ['Matriz/Filial', 'matriz_filial'],
  ['Estab. em SP', 'estabelecimentos_sp'], ['Município', 'municipio'], ['Região (IBGE)', 'regiao_intermediaria'],
  ['Localização', 'localizacao'], ['Endereço', 'endereco'], ['Bairro', 'bairro'], ['CEP', 'cep'],
  ['Telefone 1', 'telefone1'], ['Telefone 2', 'telefone2'], ['WhatsApp', 'whatsapp'], ['E-mail', 'email'],
  ['Tipo de e-mail', 'email_tipo'], ['Empresas c/ mesmo e-mail', 'empresas_mesmo_email']
]

const celula = (v: unknown, coluna: string) => {
  if (v === null || v === undefined) return ''
  let s = String(v)
  if (coluna === 'capital_social') s = s.replace('.', ',')
  if (coluna === 'data_abertura') s = s.split('-').reverse().join('/')
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const { filtros, ordem } = lerConsulta(k => sp.get(k))
  const select = COLUNAS.map(([, c]) => c).join(',')

  const linhas: string[] = [COLUNAS.map(([n]) => n).join(';')]
  try {
    for (let pagina = 1; (pagina - 1) * 1000 < LIMITE_EXPORTACAO; pagina++) {
      const lote = (await buscarEmpresas(filtros, ordem, pagina, 1000, select)) as unknown as Record<string, unknown>[]
      for (const r of lote) linhas.push(COLUNAS.map(([, c]) => celula(r[c], c)).join(';'))
      if (lote.length < 1000) break
    }
  } catch (erro) {
    if (erro instanceof SemAcessoError) return NextResponse.json({ erro: erro.message }, { status: 403 })
    throw erro
  }

  const hoje = new Date().toISOString().slice(0, 10)
  // BOM + ";" : o Excel em português abre direto, com acentos e colunas certas.
  return new NextResponse('﻿' + linhas.join('\r\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="empresas_${hoje}.csv"`,
      'Cache-Control': 'no-store'
    }
  })
}
