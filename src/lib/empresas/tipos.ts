export type Opcao = { chave: string; nome: string; n: number; pai?: string; cod?: string; uf?: string }

export type Opcoes = {
  total_base: number
  ufs: Opcao[]
  setores: Opcao[]
  ramos: Opcao[]
  segmentos: Opcao[]
  atividades: Opcao[]
  municipios: Opcao[]
  regioes: Opcao[]
}

export type ItemResumo = { chave: string; nome: string; n: number }

export type DimensaoResumo =
  | 'setor' | 'ramo' | 'porte' | 'regime' | 'situacao_regime' | 'prioridade' | 'regiao' | 'localizacao' | 'municipio' | 'uf'

export type Resumo = {
  total: {
    n: number
    lucro_real: number
    com_whatsapp: number
    email_proprio: number
    prioridade_a: number
    regime_recente: number
  }
  dims: Partial<Record<DimensaoResumo, ItemResumo[]>>
}

export type EmpresaLista = {
  cnpj: string
  cnpj_formatado: string
  prioridade: 'A' | 'B' | 'C' | 'D'
  score: number
  razao_social: string
  nome_fantasia: string | null
  tipo_negocio: string | null
  setor: string | null
  ramo: string | null
  cnae_fmt: string | null
  atividade_principal: string | null
  municipio: string | null
  uf: string
  regiao_intermediaria: string | null
  porte: string | null
  capital_social: number | null
  regime: string | null
  situacao_regime: string | null
  idade_anos: number | null
  estabelecimentos_uf: number | null
  telefone1: string | null
  whatsapp: string | null
  whatsapp_link: string | null
  email: string | null
  email_tipo: string | null
  empresas_mesmo_email: number | null
}

export type Empresa = EmpresaLista & {
  raiz: string
  matriz_filial: string | null
  secao: string | null
  macrossetor: string | null
  divisao: string | null
  grupo: string | null
  segmento: string | null
  cnae_principal: string | null
  cnaes_secundarios: string | null
  forma_tributacao: string | null
  ano_ecf: number | null
  simples_out2026: string | null
  data_opcao_simples: string | null
  data_exclusao_simples: string | null
  data_situacao: string | null
  data_abertura: string | null
  faixa_capital: string | null
  regiao_imediata: string | null
  localizacao: string | null
  tipo_logradouro: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
  endereco: string | null
  telefone1_tipo: string | null
  telefone1_original: string | null
  telefone2: string | null
  telefone2_tipo: string | null
  telefone2_original: string | null
  whatsapp_e164: string | null
  empresas_mesmo_telefone: number | null
  email_original: string | null
}

export type ContadorGrupo = {
  email: string
  classificacao: string
  empresas: number
  lucro_real: number
  lucro_presumido: number
  ecf2024_fora_simples: number
  hoje_no_simples: number
  prioridade_a: number
  municipios_distintos: number
  municipio_principal: string | null
  setor_principal: string | null
  telefone_mais_frequente: string | null
  exemplos: string | null
}
