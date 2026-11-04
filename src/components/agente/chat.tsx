'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ArrowUp, ExternalLink, LoaderCircle, MessageCircle, RotateCcw, Sparkles, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade } from '@/components/consulta/selos'
import { fmtInt, fmtMoeda } from '@/lib/formatar'
import type { Anexo } from '@/lib/agente/ferramentas'
import { cn } from '@/lib/utils'

type Turno =
  | { papel: 'usuario'; texto: string }
  | { papel: 'agente'; texto: string; anexos?: Anexo[]; motor?: string | null; ms?: number; ferramentas?: string[] }
  | { papel: 'erro'; texto: string }

const EXEMPLOS = [
  'Quais indústrias de alimentos no interior têm Lucro Real e WhatsApp?',
  'Me traga 10 clínicas em Campinas com e-mail próprio, as maiores primeiro.',
  'Quantas construtoras com mais de 20 anos existem na Grande SP?',
  'Qual a diferença entre Lucro Real e Lucro Presumido?',
  'Quais escritórios contábeis atendem mais empresas de Lucro Real?',
  'Farmácias de manipulação em Ribeirão Preto'
]

const CHAVE_SESSAO = 'agente:conversa'

/** O agente só recebe texto de volta; esta nota diz a ele quais empresas a tela mostrou,
 *  para perguntas como "e o WhatsApp da segunda?". */
function comContexto(t: Extract<Turno, { papel: 'agente' }>) {
  const linhas = (t.anexos ?? []).flatMap(a =>
    a.empresas.map((e, i) => `${i + 1}. ${e.razao_social} (CNPJ ${e.cnpj}, ${e.municipio ?? ''})`)
  )
  return linhas.length ? `${t.texto}\n\n[Empresas mostradas na tela, em ordem:\n${linhas.join('\n')}]` : t.texto
}

export function Chat() {
  const [turnos, setTurnos] = useState<Turno[]>([])
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const fim = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)

  // A conversa sobrevive a trocas de página (até fechar a aba).
  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(CHAVE_SESSAO)
      if (salvo) setTurnos(JSON.parse(salvo))
    } catch {}
  }, [])
  useEffect(() => {
    try {
      sessionStorage.setItem(CHAVE_SESSAO, JSON.stringify(turnos))
    } catch {}
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [turnos, enviando])

  async function enviar(pergunta: string) {
    const t = pergunta.trim()
    if (!t || enviando) return
    const novos: Turno[] = [...turnos.filter(x => x.papel !== 'erro'), { papel: 'usuario', texto: t }]
    setTurnos(novos)
    setTexto('')
    setEnviando(true)
    try {
      const historico = novos
        .filter((x): x is Exclude<Turno, { papel: 'erro' }> => x.papel !== 'erro')
        .map(x => ({ papel: x.papel, texto: x.papel === 'agente' ? comContexto(x) : x.texto }))
      const r = await fetch('/api/agente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ historico })
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.erro || `Erro ${r.status}`)
      setTurnos(atual => [...atual, { papel: 'agente', ...j }])
    } catch (e) {
      setTurnos(atual => [...atual, { papel: 'erro', texto: (e as Error).message }])
    } finally {
      setEnviando(false)
      campo.current?.focus()
    }
  }

  const ultimaPergunta = [...turnos].reverse().find(t => t.papel === 'usuario')?.texto

  return (
    <div className='flex h-screen flex-col'>
      <header className='flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4'>
        <div className='flex items-center gap-3'>
          <div className='grid size-9 place-items-center rounded-lg bg-marca-900 text-white'>
            <Sparkles className='size-4.5' />
          </div>
          <div>
            <h1 className='font-semibold leading-tight'>Agente de IA</h1>
            <p className='text-xs text-slate-500'>Pergunte sobre as empresas da base ou tire dúvidas de tributação</p>
          </div>
        </div>
        {turnos.length > 0 && (
          <button
            onClick={() => setTurnos([])}
            disabled={enviando}
            className='flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50'
          >
            <RotateCcw className='size-3.5' /> Nova conversa
          </button>
        )}
      </header>

      <div className='flex-1 overflow-y-auto'>
        <div className='mx-auto max-w-4xl space-y-6 px-6 py-6'>
          {turnos.length === 0 && (
            <div className='py-10 text-center'>
              <Sparkles className='mx-auto size-10 text-marca-400' />
              <h2 className='mt-4 text-xl font-semibold'>O que você quer encontrar?</h2>
              <p className='mx-auto mt-1 max-w-lg text-sm text-slate-500'>
                Peça em português: o agente monta os filtros, consulta as 628 mil empresas e devolve a lista com o link
                para a Consulta. Também responde dúvidas gerais sobre regimes e tributação.
              </p>
              <div className='mx-auto mt-6 grid max-w-2xl gap-2 sm:grid-cols-2'>
                {EXEMPLOS.map(e => (
                  <button
                    key={e}
                    onClick={() => enviar(e)}
                    className='rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-600 transition hover:border-marca-300 hover:text-marca-900'
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turnos.map((t, i) =>
            t.papel === 'usuario' ? (
              <div key={i} className='flex justify-end'>
                <div className='max-w-[80%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-marca-800 px-4 py-2.5 text-sm text-white'>
                  {t.texto}
                </div>
              </div>
            ) : t.papel === 'erro' ? (
              <div key={i} className='flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800'>
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
              <RespostaAgente key={i} turno={t} />
            )
          )}

          {enviando && (
            <div className='flex items-center gap-3 text-sm text-slate-500'>
              <div className='grid size-8 place-items-center rounded-full bg-marca-50 text-marca-600'>
                <LoaderCircle className='size-4 animate-spin' />
              </div>
              Consultando a base…
            </div>
          )}
          <div ref={fim} />
        </div>
      </div>

      <div className='border-t border-slate-200 bg-white px-6 py-4'>
        <form
          className='mx-auto flex max-w-4xl items-end gap-2'
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
            className='max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none transition field-sizing-content focus:border-marca-400 focus:bg-white focus:ring-4 focus:ring-marca-50'
          />
          <button
            type='submit'
            disabled={enviando || !texto.trim()}
            aria-label='Enviar'
            className='grid size-11 shrink-0 place-items-center rounded-xl bg-marca-800 text-white transition hover:bg-marca-900 disabled:opacity-40'
          >
            <ArrowUp className='size-5' />
          </button>
        </form>
        <p className='mx-auto mt-2 max-w-4xl text-[11px] text-slate-400'>
          Respostas sobre tributação são orientação geral, não consultoria. Os dados vêm da base; o regime é histórico (ECF).
        </p>
      </div>
    </div>
  )
}

function RespostaAgente({ turno }: { turno: Extract<Turno, { papel: 'agente' }> }) {
  return (
    <div className='flex gap-3'>
      <div className='grid size-8 shrink-0 place-items-center rounded-full bg-marca-50 text-marca-700'>
        <Sparkles className='size-4' />
      </div>
      <div className='min-w-0 flex-1 space-y-3'>
        <div className='prose-agente text-sm leading-relaxed text-slate-800'>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{turno.texto}</ReactMarkdown>
        </div>
        {turno.anexos?.map((a, i) => <TabelaEmpresas key={i} anexo={a} />)}
        {turno.motor && (
          <p className='text-[11px] text-slate-400'>
            {turno.motor}
            {turno.ms != null && ` · ${(turno.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s`}
            {!!turno.ferramentas?.length && ` · consultou: ${[...new Set(turno.ferramentas)].join(', ')}`}
          </p>
        )}
      </div>
    </div>
  )
}

function TabelaEmpresas({ anexo }: { anexo: Anexo }) {
  if (!anexo.empresas.length) return null
  return (
    <div className='overflow-hidden rounded-xl border border-slate-200 bg-white'>
      <div className='flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2.5 text-sm'>
        <span className='text-slate-600'>
          <strong className='text-slate-900'>{fmtInt(anexo.total)}</strong> empresas encontradas
          {anexo.total > anexo.empresas.length && ` · mostrando ${anexo.empresas.length}`}
        </span>
        <Link href={anexo.href} className='flex items-center gap-1 font-medium text-marca-700 hover:underline'>
          Abrir na consulta <ExternalLink className='size-3.5' />
        </Link>
      </div>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-[720px] text-left text-sm'>
          <tbody>
            {anexo.empresas.map(e => (
              <tr key={e.cnpj} className='border-t border-slate-100 align-top first:border-0'>
                <td className='py-2.5 pl-4 pr-2'>
                  <SeloPrioridade prioridade={e.prioridade as 'A'} score={e.score} />
                </td>
                <td className='max-w-[280px] px-2 py-2.5'>
                  <Link href={`/empresa/${e.cnpj}`} className='line-clamp-1 font-medium text-slate-900 hover:text-marca-700'>
                    {e.razao_social}
                  </Link>
                  <p className='truncate text-xs text-slate-500'>{e.ramo}</p>
                </td>
                <td className='px-2 py-2.5 text-slate-600'>{e.municipio}</td>
                <td className='whitespace-nowrap px-2 py-2.5 text-xs text-slate-500'>
                  {e.porte ? PORTE_CURTO[e.porte] ?? e.porte : '—'} · {fmtMoeda(e.capital_social, true)}
                  <br />
                  {e.regime}
                </td>
                <td className='px-2 py-2.5 pr-4 text-xs'>
                  {e.whatsapp_link ? (
                    <a
                      href={e.whatsapp_link}
                      target='_blank'
                      rel='noreferrer'
                      className='inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-emerald-50 px-2 py-1 font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 hover:bg-emerald-100'
                    >
                      <MessageCircle className='size-3.5' /> {e.whatsapp}
                    </a>
                  ) : e.email ? (
                    <a href={`mailto:${e.email}`} className={cn('block max-w-[180px] truncate hover:underline', e.email_tipo === 'Escritório contábil' ? 'text-amber-700' : 'text-marca-700')}>
                      {e.email}
                    </a>
                  ) : (
                    <span className='text-slate-400'>sem contato</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
