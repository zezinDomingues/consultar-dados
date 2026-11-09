import { NextResponse, type NextRequest } from 'next/server'
import { avisoCorte, celula, respostaCsv } from '@/lib/csv'
import { buscarEmpresas, resumoEmpresas, SemAcessoError } from '@/lib/empresas/consulta'
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
  ['Estab. no estado', 'estabelecimentos_uf'], ['UF', 'uf'], ['Município', 'municipio'], ['Região (IBGE)', 'regiao_intermediaria'],
  ['Localização', 'localizacao'], ['Endereço', 'endereco'], ['Bairro', 'bairro'], ['CEP', 'cep'],
  ['Telefone 1', 'telefone1'], ['Telefone 2', 'telefone2'], ['WhatsApp', 'whatsapp'], ['E-mail', 'email'],
  ['Tipo de e-mail', 'email_tipo'], ['Empresas c/ mesmo e-mail', 'empresas_mesmo_email']
]

const LOTE = 1000

const valor = (v: unknown, coluna: string) => {
  if (v === null || v === undefined) return ''
  if (coluna === 'capital_social') return String(v).replace('.', ',')
  if (coluna === 'data_abertura') return String(v).split('-').reverse().join('/')
  return v
}

/** Total da consulta (o mesmo resumo da tela, em cache): o "Exportar CSV" avisa antes quando passa do limite. */
async function totalDe(filtros: ReturnType<typeof lerConsulta>['filtros']) {
  return (await resumoEmpresas(JSON.stringify(filtros))).total.n
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams
  const { filtros, ordem } = lerConsulta(k => sp.get(k))

  if (sp.get('contar') === '1') {
    try {
      return NextResponse.json({ total: await totalDe(filtros), limite: LIMITE_EXPORTACAO }, { headers: { 'Cache-Control': 'no-store' } })
    } catch (erro) {
      if (erro instanceof SemAcessoError) return NextResponse.json({ erro: erro.message }, { status: 403 })
      console.error('[exportar] total', erro)
      return NextResponse.json({ erro: 'Não foi possível contar agora.' }, { status: 503 })
    }
  }

  const select = COLUNAS.map(([, c]) => c).join(',')
  const linhas: string[] = [COLUNAS.map(([n]) => celula(n)).join(';')]
  let incompleto = false
  try {
    for (let pagina = 1; (pagina - 1) * LOTE < LIMITE_EXPORTACAO; pagina++) {
      const lote = (await buscarEmpresas(filtros, ordem, pagina, LOTE, select)) as unknown as Record<string, unknown>[]
      for (const r of lote) linhas.push(COLUNAS.map(([, c]) => celula(valor(r[c], c))).join(';'))
      if (lote.length < LOTE) break
    }
  } catch (erro) {
    if (erro instanceof SemAcessoError) return NextResponse.json({ erro: erro.message }, { status: 403 })
    console.error('[exportar] lote', erro)
    if (linhas.length === 1) {
      return NextResponse.json({ erro: 'A base demorou para responder. Tente de novo em instantes ou use menos filtros de texto.' }, { status: 503 })
    }
    incompleto = true // devolve o que já veio, avisando no fim do arquivo
  }

  const n = linhas.length - 1
  if (incompleto) {
    linhas.push(celula(`Arquivo incompleto: a base parou de responder depois de ${n.toLocaleString('pt-BR')} linhas — baixe de novo.`))
  } else if (n >= LIMITE_EXPORTACAO) {
    const total = await totalDe(filtros).catch(() => null)
    if (total === null || total > n) linhas.push(avisoCorte(LIMITE_EXPORTACAO, total))
  }

  return respostaCsv(linhas, `empresas_${new Date().toISOString().slice(0, 10)}.csv`)
}
