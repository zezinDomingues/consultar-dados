'use client'
/* eslint-disable @next/next/no-img-element -- selo estático da marca (public/site/marca) */

import { useCallback, useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, Check, LoaderCircle, MessageSquare, Plus, Trash2, TriangleAlert, Wand2 } from 'lucide-react'
import { CartaoEmpresa } from './cartao-empresa'
import { PainelConsulta } from './painel-consulta'
import { TabelaContadores } from './tabela-contadores'
import type { Anexo, AnexoConsulta, EventoAgente } from '@/lib/agente/tipos'
import { cn } from '@/lib/utils'
import {
  abrirConversa,
  apagarConversa,
  listarConversas,
  salvarConversa,
  type ResumoConversa
} from '@/app/dashboard/agente/actions'

type TurnoAgente = {
  papel: 'agente'
  texto: string
  anexos: Anexo[]
  etapas: string[]
  pendente: boolean
  motor?: string | null
  ms?: number
}
type Turno = { papel: 'usuario'; texto: string } | TurnoAgente | { papel: 'erro'; texto: string }

const EXEMPLOS = [
  {
    grupo: 'Encontrar empresas',
    itens: [
      'Transportadoras de carga com Lucro Real no interior',
      'Clínicas em Campinas com contato direto, as maiores primeiro',
      'Indústrias de alimentos médias ou grandes com WhatsApp',
      'Quantas construtoras com mais de 20 anos existem na Grande SP?'
    ]
  },
  {
    grupo: 'Tirar dúvidas',
    itens: [
      'Qual a diferença entre Lucro Real e Lucro Presumido?',
      'O que muda com a reforma tributária para quem está no Presumido?',
      'Posso prospectar por WhatsApp sem ferir a LGPD?',
      'Quais escritórios contábeis atendem mais empresas de Lucro Real?'
    ]
  }
]

const CHAVE_SESSAO = 'agente:conversa:v3' // v3: links passaram para /dashboard
const CHAVE_ID = 'agente:conversa-id' // conversa aberta (o histórico completo fica no banco)

/** Agrupa o histórico como os apps de chat: Hoje, Ontem, Últimos 7 dias, Anteriores. */
function agrupar(lista: ResumoConversa[]) {
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const dia = 86_400_000
  const grupos: { titulo: string; itens: ResumoConversa[] }[] = [
    { titulo: 'Hoje', itens: [] },
    { titulo: 'Ontem', itens: [] },
    { titulo: 'Últimos 7 dias', itens: [] },
    { titulo: 'Anteriores', itens: [] }
  ]
  for (const c of lista) {
    const t = new Date(c.atualizada_em).getTime()
    const i = t >= +hoje ? 0 : t >= +hoje - dia ? 1 : t >= +hoje - 6 * dia ? 2 : 3
    grupos[i].itens.push(c)
  }
  return grupos.filter(g => g.itens.length)
}

/** O que a tela já mostrou (mais recente por último). Vai para o servidor SEPARADO do
 *  histórico: dentro das mensagens do agente, o modelo passava a imitar a nota. */
function contextoDaTela(turnos: Turno[]) {
  const notas = turnos
    .filter((t): t is TurnoAgente => t.papel === 'agente')
    .flatMap(t => t.anexos)
    .slice(-4)
    .map(a => {
      if (a.tipo === 'consulta') {
        const lista = a.empresas
          .map((e, i) => `  ${i + 1}. ${e.razao_social} (CNPJ ${e.cnpj}, ${e.municipio ?? ''})`)
          .join('\n')
        return `- Busca: filtros=${JSON.stringify(a.filtros)} · ordem=${a.ordem} · total=${a.resumo.total.n}\n  Tabela, em ordem:\n${lista}`
      }
      if (a.tipo === 'empresa') return `- Ficha: ${a.empresa.razao_social} (CNPJ ${a.empresa.cnpj})`
      return `- Contadores: ${a.itens.map(c => c.email).join(', ')}`
    })
  return notas.join('\n')
}

export function Chat() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [conversaId, setConversaId] = useState<string | null>(null)
  const [historico, setHistorico] = useState<ResumoConversa[] | null>(null)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const estavaEnviando = useRef(false)
  // salvamentos em fila: o 2º espera o 1º e usa o mesmo id (sem conversa duplicada)
  const filaSalvar = useRef<Promise<string | null>>(Promise.resolve(null))
  const idAtual = useRef<string | null>(null)
  idAtual.current = conversaId

  const recarregarHistorico = useCallback(() => {
    listarConversas()
      .then(setHistorico)
      .catch(() => setHistorico(h => h ?? []))
  }, [])

  // A conversa aberta sobrevive a idas e vindas entre as páginas; o histórico vem do banco.
  useEffect(() => {
    try {
      const salvo: Turno[] = JSON.parse(sessionStorage.getItem(CHAVE_SESSAO) ?? '[]')
      setTurnos(salvo.filter(t => !(t.papel === 'agente' && t.pendente)))
      setConversaId(sessionStorage.getItem(CHAVE_ID))
    } catch {}
    recarregarHistorico()
  }, [recarregarHistorico])
  useEffect(() => {
    if (enviando) return
    try {
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(turnos))
      if (conversaId) sessionStorage.setItem(CHAVE_ID, conversaId)
      else sessionStorage.removeItem(CHAVE_ID)
    } catch {}
  }, [turnos, enviando, conversaId])

  // Ao terminar cada resposta, grava a conversa no histórico (cria na 1ª pergunta).
  useEffect(() => {
    const terminou = estavaEnviando.current && !enviando
    estavaEnviando.current = enviando
    if (!terminou || !turnos.length) return
    const titulo = turnos.find(t => t.papel === 'usuario')?.texto ?? 'Conversa'
    const paraSalvar = turnos.filter(t => !(t.papel === 'agente' && t.pendente))
    filaSalvar.current = filaSalvar.current
      .then(anterior => salvarConversa(idAtual.current ?? anterior, titulo, paraSalvar))
      .then(id => {
        idAtual.current = id
        setConversaId(id)
        recarregarHistorico()
        return id
      })
      .catch(() => idAtual.current)
  }, [enviando, turnos, conversaId, recarregarHistorico])

  function novaConversa() {
    if (enviando) return
    setTurnos([])
    setConversaId(null)
    idAtual.current = null
    filaSalvar.current = Promise.resolve(null)
    setTexto('')
    campo.current?.focus()
  }

  async function abrir(id: string) {
    if (enviando || id === conversaId) return
    const c = await abrirConversa(id)
    if (!c) return recarregarHistorico()
    setTurnos(c.turnos as Turno[])
    setConversaId(c.id)
    idAtual.current = c.id
    filaSalvar.current = Promise.resolve(c.id)
  }

  async function apagar(id: string) {
    if (enviando || !confirm('Apagar esta conversa do histórico?')) return
    setHistorico(h => h?.filter(c => c.id !== id) ?? h)
    await apagarConversa(id)
    if (id === conversaId) novaConversa()
    recarregarHistorico()
  }
  const ultimoTurno = turnos.at(-1)
  const rolarChave = `${turnos.length}:${ultimoTurno?.papel === 'agente' ? `${ultimoTurno.etapas.length}:${ultimoTurno.anexos.length}:${!!ultimoTurno.texto}` : ''}`
  useEffect(() => {
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [rolarChave])

  function atualizarUltimo(muda: (t: TurnoAgente) => TurnoAgente) {
    setTurnos(atual => {
      const i = atual.length - 1
      const t = atual[i]
      if (!t || t.papel !== 'agente') return atual
      return [...atual.slice(0, i), muda(t)]
    })
  }

  function aplicar(e: EventoAgente) {
    if (e.tipo === 'etapa') atualizarUltimo(t => ({ ...t, etapas: [...t.etapas, e.texto] }))
    else if (e.tipo === 'anexo')
      atualizarUltimo(t => {
        const i = t.anexos.findIndex(a => a.chave === e.anexo.chave)
        const anexos = i >= 0 ? t.anexos.map((a, j) => (j === i ? e.anexo : a)) : [...t.anexos, e.anexo]
        return { ...t, anexos }
      })
    else if (e.tipo === 'fim')
      atualizarUltimo(t => ({
        ...t,
        texto: e.texto,
        motor: e.motor,
        ms: e.ms,
        pendente: false
      }))
    else if (e.tipo === 'erro') throw new Error(e.texto)
  }

  async function enviar(pergunta: string) {
    const t = pergunta.trim()
    if (!t || enviando) return
    const base = turnos.filter(x => x.papel !== 'erro')
    const historico = [...base, { papel: 'usuario' as const, texto: t }].map(x => ({
      papel: x.papel,
      texto: x.papel === 'agente' ? x.texto || '(mostrei o resultado na tela)' : x.texto
    }))
    const contexto = contextoDaTela(base)
    setTurnos([
      ...base,
      { papel: 'usuario', texto: t },
      { papel: 'agente', texto: '', anexos: [], etapas: [], pendente: true }
    ])
    setTexto('')
    setEnviando(true)
    try {
      const r = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico, contexto })
      })
      if (!r.ok || !r.body) {
        const j = await r.json().catch(() => ({}))
        throw new Error(j.erro || `Erro ${r.status}`)
      }
      const leitor = r.body.getReader()
      const dec = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { done, value } = await leitor.read()
        if (done) break
        buffer += dec.decode(value, { stream: true })
        let i
        while ((i = buffer.indexOf('\n')) >= 0) {
          const linha = buffer.slice(0, i).trim()
          buffer = buffer.slice(i + 1)
          if (linha) aplicar(JSON.parse(linha))
        }
      }
      atualizarUltimo(t =>
        t.pendente
          ? {
              ...t,
              pendente: false,
              texto: t.texto || 'A resposta foi interrompida.'
            }
          : t
      )
    } catch (e) {
      setTurnos(atual => {
        const ultimo = atual.at(-1)
        const semVazio = ultimo?.papel === 'agente' && !ultimo.anexos.length ? atual.slice(0, -1) : atual
        return [...semVazio, { papel: 'erro', texto: (e as Error).message }]
      })
    } finally {
      setEnviando(false)
      campo.current?.focus()
    }
  }

  const ultimaPergunta = [...turnos].reverse().find(t => t.papel === 'usuario')?.texto
  const iUltimoAgente = turnos.findLastIndex(t => t.papel === 'agente')

  return (
    <div className='flex h-screen'>
      <aside className='hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex'>
        <div className='p-4'>
          <button
            onClick={novaConversa}
            disabled={enviando}
            className='flex w-full items-center justify-center gap-2 rounded-full bg-marca-800 px-4 py-2.5 text-sm font-bold tracking-wide text-creme shadow-md shadow-marca-900/15 transition hover:bg-marca-950 disabled:opacity-50'
          >
            <Plus className='size-4' /> Nova conversa
          </button>
        </div>
        <div className='px-4 pb-2'>
          <span className='rotulo-secao'>Histórico</span>
        </div>
        <nav className='flex-1 space-y-4 overflow-y-auto px-2 pb-4' aria-label='Histórico de conversas'>
          {historico === null ? (
            <div className='space-y-2 px-2 pt-1'>
              {[0, 1, 2, 3].map(i => (
                <div key={i} className='h-8 animate-pulse rounded-lg bg-slate-100' />
              ))}
            </div>
          ) : historico.length === 0 ? (
            <p className='px-3 pt-1 text-xs leading-relaxed text-slate-400'>
              Suas conversas aparecem aqui e ficam salvas para você retomar depois.
            </p>
          ) : (
            agrupar(historico).map(g => (
              <div key={g.titulo}>
                <p className='px-3 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400'>{g.titulo}</p>
                <ul className='space-y-0.5'>
                  {g.itens.map(c => (
                    <li key={c.id} className='group relative'>
                      <button
                        onClick={() => abrir(c.id)}
                        title={c.titulo}
                        className={cn(
                          'flex w-full items-center gap-2 rounded-lg py-2 pl-3 pr-9 text-left text-[13px] transition',
                          c.id === conversaId
                            ? 'bg-marca-50 font-semibold text-marca-800'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-marca-800'
                        )}
                      >
                        <MessageSquare
                          className={cn(
                            'size-3.5 shrink-0',
                            c.id === conversaId ? 'text-ouro-escuro' : 'text-slate-400'
                          )}
                        />
                        <span className='truncate'>{c.titulo}</span>
                      </button>
                      <button
                        onClick={() => apagar(c.id)}
                        aria-label={`Apagar conversa: ${c.titulo}`}
                        className='absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100'
                      >
                        <Trash2 className='size-3.5' />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </nav>
      </aside>

      <div className='flex min-w-0 flex-1 flex-col'>
        <header className='flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4'>
          <div className='flex items-center gap-3'>
            <img src='/site/marca/simbolo-escuro.svg' alt='' className='size-10 drop-shadow-sm' />
            <div>
              <h1 className='font-serif text-lg font-bold leading-tight text-marca-800'>Agente de IA</h1>
              <p className='text-xs text-slate-500'>
                Encontra empresas na base e tira dúvidas de tributação e prospecção
              </p>
            </div>
          </div>
          {turnos.length > 0 && (
            <button
              onClick={novaConversa}
              disabled={enviando}
              className='flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50 lg:hidden'
            >
              <Plus className='size-3.5' /> Nova conversa
            </button>
          )}
        </header>

        <div className='flex-1 overflow-y-auto'>
          <div className='mx-auto max-w-6xl space-y-6 px-6 py-6'>
            {turnos.length === 0 && (
              <div className='py-8'>
                <div className='text-center'>
                  {/* selo plano (nítido em tamanho pequeno; o 3D descolava o OC do anel), só flutuando */}
                  <img src='/site/marca/simbolo-escuro.svg' alt='OficialCert' className='selo-flutua mx-auto size-20' />
                  <h2 className='mt-5 font-serif text-[2rem] font-bold tracking-[-0.02em] text-marca-800'>
                    O que você quer encontrar?
                  </h2>
                  <p className='mx-auto mt-1 max-w-xl text-sm text-slate-500'>
                    Peça em português. O agente monta os filtros, consulta as 628 mil empresas e mostra o resultado
                    igual à Consulta — com indicadores, tabela e contatos. Dúvidas de tributação ele responde direto.
                  </p>
                </div>
                <div className='mx-auto mt-8 grid max-w-4xl gap-6 md:grid-cols-2'>
                  {EXEMPLOS.map(g => (
                    <div key={g.grupo}>
                      <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400'>{g.grupo}</p>
                      <div className='space-y-2'>
                        {g.itens.map(e => (
                          <button
                            key={e}
                            onClick={() => enviar(e)}
                            className='w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 transition hover:border-marca-300 hover:text-marca-900 hover:shadow-sm'
                          >
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {turnos.map((t, i) =>
              t.papel === 'usuario' ? (
                <div key={i} className='flex justify-end'>
                  <div className='max-w-[75%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-marca-800 px-4 py-2.5 text-sm text-creme shadow-sm shadow-marca-900/10'>
                    {t.texto}
                  </div>
                </div>
              ) : t.papel === 'erro' ? (
                <div
                  key={i}
                  className='flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'
                >
                  <TriangleAlert className='mt-0.5 size-4 shrink-0' />
                  <div className='flex-1'>{t.texto}</div>
                  {i === turnos.length - 1 && ultimaPergunta && (
                    <button
                      onClick={() => {
                        setTurnos(atual => atual.slice(0, -2))
                        enviar(ultimaPergunta)
                      }}
                      className='shrink-0 font-medium underline'
                    >
                      Tentar de novo
                    </button>
                  )}
                </div>
              ) : (
                <RespostaAgente key={i} turno={t} ultimo={i === iUltimoAgente} aoSugerir={enviar} ocupado={enviando} />
              )
            )}
            <div ref={fim} />
          </div>
        </div>

        <div className='border-t border-slate-200 bg-white px-6 py-4'>
          <form
            className='mx-auto flex max-w-6xl items-end gap-2'
            onSubmit={e => {
              e.preventDefault()
              enviar(texto)
            }}
          >
            <textarea
              ref={campo}
              value={texto}
              onChange={e => setTexto(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  enviar(texto)
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder='Ex.: transportadoras de médio porte em Sorocaba com WhatsApp'
              className='field-sizing-content max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition focus:border-marca-400 focus:bg-white focus:ring-4 focus:ring-marca-50'
            />
            <button
              type='submit'
              disabled={enviando || !texto.trim()}
              aria-label='Enviar'
              className='grid size-11 shrink-0 place-items-center rounded-xl bg-marca-800 text-white transition hover:bg-marca-900 disabled:opacity-40'
            >
              {enviando ? <LoaderCircle className='size-5 animate-spin' /> : <ArrowUp className='size-5' />}
            </button>
          </form>
          <p className='mx-auto mt-2 max-w-6xl text-[11px] text-slate-400'>
            Dados da Receita Federal (o regime é histórico, da ECF). Respostas sobre tributação são orientação geral,
            não consultoria.
          </p>
        </div>
      </div>
    </div>
  )
}

function RespostaAgente({
  turno,
  ultimo,
  aoSugerir,
  ocupado
}: {
  turno: TurnoAgente
  ultimo: boolean
  aoSugerir: (p: string) => void
  ocupado: boolean
}) {
  const sugestoes =
    ultimo && !turno.pendente
      ? (turno.anexos.filter((a): a is AnexoConsulta => a.tipo === 'consulta').at(-1)?.sugestoes ?? [])
      : []

  return (
    <div className='flex gap-3' data-turno='agente'>
      <img src='/site/marca/simbolo-escuro.svg' alt='OficialCert' className='size-8 shrink-0' />
      <div className='min-w-0 flex-1 space-y-3'>
        {turno.pendente && (
          <ol className='space-y-1.5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm'>
            {(turno.etapas.length ? turno.etapas : ['Entendendo o pedido']).map((e, i, todas) => {
              const atual = i === todas.length - 1
              return (
                <li key={i} className={cn('flex items-center gap-2', atual ? 'text-slate-700' : 'text-slate-400')}>
                  {atual ? (
                    <LoaderCircle className='size-3.5 animate-spin text-marca-500' />
                  ) : (
                    <Check className='size-3.5 text-emerald-500' />
                  )}
                  {e}
                  {atual && '…'}
                </li>
              )
            })}
          </ol>
        )}

        {turno.texto && (
          <div className='prose-agente text-[15px] leading-relaxed text-slate-800'>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{turno.texto}</ReactMarkdown>
          </div>
        )}

        {turno.anexos.map(a =>
          a.tipo === 'consulta' ? (
            <PainelConsulta key={a.chave} anexo={a} />
          ) : a.tipo === 'empresa' ? (
            <CartaoEmpresa key={a.chave} e={a.empresa} />
          ) : (
            <TabelaContadores key={a.chave} anexo={a} />
          )
        )}

        {sugestoes.length > 0 && (
          <div className='flex flex-wrap items-center gap-2'>
            <span className='flex items-center gap-1 text-xs font-medium text-slate-500'>
              <Wand2 className='size-3.5 text-marca-500' /> Refinar:
            </span>
            {sugestoes.map(s => (
              <button
                key={s.rotulo}
                disabled={ocupado}
                onClick={() => aoSugerir(s.pergunta)}
                className='rounded-full border border-marca-200 bg-white px-3 py-1 text-xs text-marca-800 transition hover:bg-marca-50 disabled:opacity-50'
              >
                {s.rotulo}
              </button>
            ))}
          </div>
        )}

        {!turno.pendente && turno.motor && (
          <p className='text-[11px] text-slate-400'>
            {turno.motor.split(' · ')[0]}
            {turno.ms != null && ` · ${(turno.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`}
          </p>
        )}
      </div>
    </div>
  )
}
