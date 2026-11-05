// Tipos e rótulos dos disparos de WhatsApp (servidor e navegador).
import type { Filtros, Ordem } from '@/lib/empresas/filtros'

export const STATUS_DISPARO = [
  'reservado',
  'enviado',
  'sem_whatsapp',
  'falhou',
  'interessado',
  'preencheu',
  'sem_interesse',
  'respondeu',
  'descadastrado'
] as const
export type StatusDisparo = (typeof STATUS_DISPARO)[number]

export const ROTULO_STATUS: Record<StatusDisparo, string> = {
  reservado: 'Na fila',
  enviado: 'Aguardando resposta',
  sem_whatsapp: 'Sem WhatsApp',
  falhou: 'Falhou',
  interessado: 'Quer a consulta',
  preencheu: 'Enviou os dados',
  sem_interesse: 'Sem interesse',
  respondeu: 'Respondeu',
  descadastrado: 'Pediu para sair'
}

/** Cor do selo de cada status (classes Tailwind). */
export const COR_STATUS: Record<StatusDisparo, string> = {
  reservado: 'bg-slate-100 text-slate-600',
  enviado: 'bg-marca-50 text-marca-800',
  sem_whatsapp: 'bg-slate-100 text-slate-500',
  falhou: 'bg-red-50 text-red-700',
  interessado: 'bg-amber-50 text-amber-800',
  preencheu: 'bg-emerald-50 text-emerald-800',
  sem_interesse: 'bg-slate-100 text-slate-600',
  respondeu: 'bg-sky-50 text-sky-800',
  descadastrado: 'bg-rose-50 text-rose-700'
}

/** Abas da lista do painel. */
export const GRUPOS = {
  todos: { rotulo: 'Todos', status: null },
  aguardando: { rotulo: 'Sem resposta', status: ['enviado'] },
  responderam: {
    rotulo: 'Responderam',
    status: ['interessado', 'preencheu', 'sem_interesse', 'respondeu', 'descadastrado']
  },
  interessados: { rotulo: 'Querem a consulta', status: ['interessado'] },
  leads: { rotulo: 'Enviaram os dados', status: ['preencheu'] },
  atencao: { rotulo: 'Precisam de atenção', status: null },
  recusaram: { rotulo: 'Recusaram / saíram', status: ['sem_interesse', 'descadastrado'] },
  nao_entregues: { rotulo: 'Não entregues', status: ['sem_whatsapp', 'falhou', 'reservado'] }
} as const satisfies Record<string, { rotulo: string; status: readonly StatusDisparo[] | null }>
export type Grupo = keyof typeof GRUPOS

export type Disparo = {
  id: number
  campanha_id: number
  numero_id: number | null
  cnpj: string
  telefone: string
  razao_social: string | null
  nome_fantasia: string | null
  municipio: string | null
  chat_id: string | null
  lid: string | null
  token: string
  status: StatusDisparo
  atencao: boolean
  erro: string | null
  msg_id: string | null
  enquete_id: string | null
  criado_em: string
  enviado_em: string | null
  entregue_em: string | null
  lido_em: string | null
  respondido_em: string | null
  interessado_em: string | null
  link_aberto_em: string | null
  preenchido_em: string | null
  encerrado_em: string | null
  ultima_resposta: string | null
  respostas: number
  lead_nome: string | null
  lead_empresa: string | null
  lead_email: string | null
  lead_whatsapp: string | null
  lead_ip: string | null
  /** coleta pela conversa: qual pergunta está aberta */
  etapa: 'nome' | 'contato' | 'telefone' | 'cnpj' | null
  lead_cnpj: string | null
  tentativas: number
  /** conversa de teste do administrador (fora do funil) */
  teste: boolean
  atualizado_em: string
}

export type StatusCampanha = 'ativa' | 'pausada' | 'concluida'

/** Como a 1ª mensagem chega: logo + texto + botão, ou logo + texto pedindo "SIM" (enquete = formato antigo). */
export type FormatoCampanha = 'botao' | 'texto' | 'enquete'

export type Campanha = {
  id: number
  nome: string
  filtros: Filtros
  ordem: Ordem
  excluir_compartilhados: boolean
  usar_enquete: boolean
  mensagem: string
  enquete_pergunta: string
  opcao_sim: string
  opcao_nao: string
  mensagem_sim: string
  mensagem_nao: string
  mensagem_obrigado: string
  limite_total: number | null
  formato: FormatoCampanha
  imagem_url: string | null
  botao_texto: string
  rodape: string | null
  pergunta_nome: string
  pergunta_cnpj: string
  pergunta_contato: string
  botao_mesmo_numero: string
  botao_outro_numero: string
  pergunta_telefone: string
  botao_site_texto: string
  site_url: string
  status: StatusCampanha
  motivo_status: string | null
  ultima_reserva_em: string | null
  criada_em: string
  atualizada_em: string
}

export type NumerosCampanha = {
  campanha_id: number
  total: number
  enviados: number
  lidos: number
  responderam: number
  interessados: number
  preencheram: number
  recusaram: number
  nao_entregues: number
  ultimo_envio_em: string | null
}

/** Número de WhatsApp (sessão do WAHA) como a plataforma enxerga: sem a API key. */
export type Numero = {
  id: number
  rotulo: string
  waha_url: string
  waha_sessao: string
  telefone: string | null
  nome_perfil: string | null
  ativo: boolean
  limite_diario: number
  intervalo_min_s: number
  intervalo_max_s: number
  status: string | null
  status_detalhe: string | null
  status_em: string | null
  webhook_em: string | null
  ultimo_evento_em: string | null
  proximo_envio_em: string
  ultimo_envio_em: string | null
  criado_em: string
}

export type NumeroComChave = Numero & { waha_api_key: string | null }

export type ConfigDisparo = {
  id: 1
  hora_inicio: number
  hora_fim: number
  dias_semana: number[]
  pausado: boolean
  atualizado_em: string
}

export type ResumoDisparos = {
  total: number
  na_fila: number
  enviados: number
  entregues: number
  lidos: number
  responderam: number
  aguardando: number
  interessados: number
  links_abertos: number
  preencheram: number
  sem_interesse: number
  descadastrados: number
  sem_whatsapp: number
  falhas: number
  atencao: number
  enviados_hoje: number
}

export type EventoDisparo = {
  id: number
  disparo_id: number | null
  numero_id: number | null
  tipo: 'enviada' | 'recebida' | 'voto' | 'formulario' | 'link' | 'status' | 'erro' | 'nota'
  direcao: 'entrada' | 'saida' | null
  texto: string | null
  wa_id: string | null
  dados: Record<string, unknown> | null
  autor: string | null
  criado_em: string
}

export const DIAS_SEMANA = [
  { n: 1, curto: 'Seg' },
  { n: 2, curto: 'Ter' },
  { n: 3, curto: 'Qua' },
  { n: 4, curto: 'Qui' },
  { n: 5, curto: 'Sex' },
  { n: 6, curto: 'Sáb' },
  { n: 7, curto: 'Dom' }
] as const
