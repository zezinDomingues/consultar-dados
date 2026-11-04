// Tipos do agente compartilhados entre servidor e navegador (sem 'server-only').
import type { Filtros, Ordem } from '@/lib/empresas/filtros'
import type { ContadorGrupo, Empresa, EmpresaLista, Resumo } from '@/lib/empresas/tipos'

export type Sugestao = { rotulo: string; pergunta: string }

/** Resultado de uma busca: a tela desenha igual à Consulta (indicadores, distribuições, tabela). */
export type AnexoConsulta = {
  tipo: 'consulta'
  chave: string
  filtros: Filtros
  ordem: Ordem
  href: string
  rotulos: string[]
  totalBase: number
  resumo: Resumo
  empresas: EmpresaLista[]
  sugestoes: Sugestao[]
}
export type AnexoEmpresa = { tipo: 'empresa'; chave: string; empresa: Empresa }
export type AnexoContadores = { tipo: 'contadores'; chave: string; total: number; itens: ContadorGrupo[] }
export type Anexo = AnexoConsulta | AnexoEmpresa | AnexoContadores

/** Eventos enviados ao navegador enquanto o agente trabalha (NDJSON, um por linha). */
export type EventoAgente =
  | { tipo: 'etapa'; texto: string }
  | { tipo: 'anexo'; anexo: Anexo }
  | { tipo: 'fim'; texto: string; motor: string | null; ms: number; ferramentas: string[] }
  | { tipo: 'erro'; texto: string }
