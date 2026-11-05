'use client'
/* eslint-disable @next/next/no-img-element -- prévia da imagem que vai no WhatsApp (URL livre) */

import { useActionState, useMemo, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, ExternalLink, FlaskConical, LoaderCircle, Play, Reply, Save, SlidersHorizontal } from 'lucide-react'
import { enviarTeste, salvarCampanha, type Retorno } from '@/app/dashboard/disparos/actions'
import { fmtCnpj, montar, RESPOSTAS, saudacao, VARIAVEIS, type CampanhaEditavel } from '@/lib/disparos/mensagens'
import { ORDENS, type Filtros } from '@/lib/empresas/filtros'
import { fmtInt } from '@/lib/formatar'
import { cn } from '@/lib/utils'

type Inicial = CampanhaEditavel

const ENTRADA =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-marca-400 focus:ring-4 focus:ring-marca-50'

export function FormCampanha({
  inicial,
  filtros,
  rotulos,
  hrefAjustar,
  elegiveis,
  exemplo,
  numeros
}: {
  inicial: Inicial
  filtros: Filtros
  rotulos: string[]
  hrefAjustar: string
  elegiveis: { com_whatsapp: number; elegiveis: number; elegiveis_sem_excluir: number } | null
  exemplo: { empresa: string; municipio: string }
  numeros: { id: number; rotulo: string; status: string | null }[]
}) {
  const [v, setV] = useState<Inicial>({ ...inicial, formato: inicial.formato === 'enquete' ? 'botao' : inicial.formato })
  const [estado, salvar, salvando] = useActionState<Retorno, FormData>(salvarCampanha, {})
  const [teste, testar, testando] = useActionState<Retorno, FormData>(enviarTeste, {})
  const editando = !!inicial.id
  const set =
    <K extends keyof Inicial>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV(x => ({ ...x, [k]: e.target.value }))
  const botao = v.formato === 'botao'

  // pré-visualização com uma empresa real dos filtros (sempre a 1ª variação, para não "piscar" enquanto digita)
  const vars = useMemo(
    () => ({ ...exemplo, saudacao: saudacao(), primeiro_nome: 'Maria', nome: 'Maria Souza', cnpj: fmtCnpj('11222333000181') }),
    [exemplo]
  )
  const fixo = () => 0
  const primeira = montar(v.mensagem, vars, fixo)
  const previa = {
    primeira: botao || /\bSIM\b/.test(primeira) ? primeira : `${primeira}\n\n${RESPOSTAS.sem_botao}`,
    nome: montar(v.pergunta_nome, vars, fixo),
    cnpj: montar(v.pergunta_cnpj, vars, fixo),
    final: botao ? montar(v.mensagem_obrigado, vars, fixo) : `${montar(v.mensagem_obrigado, vars, fixo)}\n\n👉 ${v.site_url}`
  }
  const disponiveis = elegiveis ? (v.excluir_compartilhados ? elegiveis.elegiveis : elegiveis.elegiveis_sem_excluir) : null

  return (
    <form action={salvar} className='grid gap-5 xl:grid-cols-[1.2fr_1fr]'>
      {inicial.id && <input type='hidden' name='id' value={inicial.id} />}
      <input type='hidden' name='filtros' value={JSON.stringify(filtros)} />
      <input type='hidden' name='formato' value={v.formato} />

      <div className='space-y-5'>
        {/* ---------- público ---------- */}
        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Para quem</p>
          <div className='mt-3 flex flex-wrap items-center gap-1.5'>
            {rotulos.length ? (
              rotulos.map(r => (
                <span key={r} className='rounded-full border border-marca-200 bg-marca-50 px-2.5 py-1 text-xs text-marca-900'>
                  {r}
                </span>
              ))
            ) : (
              <span className='text-sm text-slate-500'>Toda a base com WhatsApp (nenhum filtro).</span>
            )}
            {!editando && (
              <Link href={hrefAjustar} className='inline-flex items-center gap-1 px-2 text-xs font-semibold text-marca-700 hover:underline'>
                <SlidersHorizontal className='size-3.5' /> ajustar na Consulta
              </Link>
            )}
          </div>
          {elegiveis && (
            <p className='mt-3 text-sm text-slate-600'>
              <strong className='font-serif text-xl text-marca-800'>{fmtInt(disponiveis)}</strong> empresas podem receber agora
              <span className='text-slate-400'> · {fmtInt(elegiveis.com_whatsapp)} têm celular nos filtros; quem já foi contatado nunca entra de novo</span>
            </p>
          )}
          <div className='mt-4 grid gap-4 sm:grid-cols-2'>
            <label className='block space-y-1.5 sm:col-span-2'>
              <span className='text-xs font-semibold text-slate-600'>Nome da campanha</span>
              <input name='nome' value={v.nome} onChange={set('nome')} required maxLength={120} className={ENTRADA} />
            </label>
            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold text-slate-600'>Ordem de envio</span>
              <select name='ordem' value={v.ordem} onChange={set('ordem')} className={ENTRADA}>
                {Object.entries(ORDENS).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold text-slate-600'>Limite de envios (opcional)</span>
              <input
                name='limite_total'
                type='number'
                min={1}
                value={v.limite_total ?? ''}
                onChange={e => setV(x => ({ ...x, limite_total: e.target.value ? Number(e.target.value) : null }))}
                placeholder='sem limite'
                className={ENTRADA}
              />
            </label>
            <label className='flex items-start gap-2.5 text-sm text-slate-700 sm:col-span-2'>
              <input
                type='checkbox'
                name='excluir_compartilhados'
                checked={v.excluir_compartilhados}
                onChange={e => setV(x => ({ ...x, excluir_compartilhados: e.target.checked }))}
                className='mt-0.5 size-4 accent-[#1a2d5a]'
              />
              <span>
                Pular celulares que aparecem em mais de uma empresa
                <span className='block text-xs text-slate-400'>Costumam ser do contador ou de um grupo — a mensagem fala de uma empresa só.</span>
              </span>
            </label>
          </div>
        </section>

        {/* ---------- 1ª mensagem ---------- */}
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='flex flex-wrap items-baseline justify-between gap-2'>
            <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>1 · Primeira mensagem</p>
            <p className='text-[11px] text-slate-400'>
              {VARIAVEIS.map(x => (
                <span key={x.nome} title={x.texto} className='ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600'>
                  {x.nome}
                </span>
              ))}
            </p>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {(
              [
                ['botao', 'Com botão', 'Logo + texto + botão “Quero a consulta”'],
                ['texto', 'Responder SIM', 'Logo + texto pedindo “SIM” (se o celular não mostrar botões)']
              ] as const
            ).map(([f, titulo, nota]) => (
              <button
                key={f}
                type='button'
                onClick={() => setV(x => ({ ...x, formato: f }))}
                className={cn(
                  'rounded-xl border px-3.5 py-2.5 text-left transition',
                  v.formato === f ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100' : 'border-slate-200 hover:border-marca-300'
                )}
              >
                <span className='block text-sm font-semibold text-slate-800'>{titulo}</span>
                <span className='block text-xs text-slate-500'>{nota}</span>
              </button>
            ))}
          </div>
          <label className='block space-y-1.5'>
            <span className='text-xs font-semibold text-slate-600'>Imagem no topo (logo) — endereço público</span>
            <div className='flex items-center gap-2'>
              {v.imagem_url && <img src={v.imagem_url} alt='' className='h-10 w-[76px] shrink-0 rounded-md border border-slate-200 object-cover' />}
              <input name='imagem_url' value={v.imagem_url ?? ''} onChange={set('imagem_url')} placeholder='sem imagem' className={ENTRADA} />
            </div>
          </label>
          <Texto rotulo='Texto' nome='mensagem' valor={v.mensagem} onChange={set('mensagem')} linhas={7} max={1024} />
          <div className='grid gap-3 sm:grid-cols-[1fr_200px]'>
            <Linha rotulo='Rodapé (cinza, até 60)' nome='rodape' valor={v.rodape ?? ''} onChange={set('rodape')} max={60} obrigatorio={false} />
            {botao ? (
              <Linha rotulo='Botão (até 20)' nome='botao_texto' valor={v.botao_texto} onChange={set('botao_texto')} max={20} />
            ) : (
              <input type='hidden' name='botao_texto' value={v.botao_texto} />
            )}
          </div>
        </section>

        {/* ---------- coleta ---------- */}
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>2 · Depois do “quero”: coleta pela conversa</p>
          <Texto rotulo='Pergunta do nome completo' nome='pergunta_nome' valor={v.pergunta_nome} onChange={set('pergunta_nome')} linhas={3} max={1000} />
          <Texto rotulo='Pergunta do CNPJ' nome='pergunta_cnpj' valor={v.pergunta_cnpj} onChange={set('pergunta_cnpj')} linhas={3} max={1000} />
          <p className='text-xs text-slate-400'>
            O telefone vem da própria conversa. Nome sem sobrenome ou CNPJ inválido: o robô pede de novo (até 3 vezes; depois chama a equipe).
          </p>
        </section>

        {/* ---------- final ---------- */}
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>3 · Mensagem final (com a logo)</p>
          <Texto rotulo='Texto' nome='mensagem_obrigado' valor={v.mensagem_obrigado} onChange={set('mensagem_obrigado')} linhas={6} max={1024} />
          <div className='grid gap-3 sm:grid-cols-[200px_1fr]'>
            <Linha rotulo='Botão do site (até 20)' nome='botao_site_texto' valor={v.botao_site_texto} onChange={set('botao_site_texto')} max={20} />
            <Linha rotulo='Endereço que o botão abre' nome='site_url' valor={v.site_url} onChange={set('site_url')} max={300} />
          </div>
          <Texto rotulo='Se responder “não”' nome='mensagem_nao' valor={v.mensagem_nao} onChange={set('mensagem_nao')} linhas={2} max={1000} />
          <p className='text-xs text-slate-400'>
            Fixos: “SAIR” (e parecidos) descadastra na hora. Perguntas e áudios vão para “Precisam de atenção”, para alguém da equipe responder.
          </p>
        </section>

        {estado.erro && <p className='rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'>{estado.erro}</p>}
        <div className='flex flex-wrap gap-2'>
          {editando ? (
            <button type='submit' disabled={salvando} className='inline-flex h-11 items-center gap-2 rounded-full bg-marca-800 px-6 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'>
              {salvando ? <LoaderCircle className='size-4 animate-spin' /> : <Save className='size-4' />} Salvar alterações
            </button>
          ) : (
            <>
              <button
                type='submit'
                name='ativar'
                value='true'
                disabled={salvando}
                className='inline-flex h-11 items-center gap-2 rounded-full bg-marca-800 px-6 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'
              >
                {salvando ? <LoaderCircle className='size-4 animate-spin' /> : <Play className='size-4' />} Criar e ativar
              </button>
              <button
                type='submit'
                disabled={salvando}
                className='inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 hover:border-marca-400 disabled:opacity-60'
              >
                <Save className='size-4' /> Criar pausada (para testar)
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---------- pré-visualização e teste ---------- */}
      <aside className='space-y-4 xl:sticky xl:top-4 xl:self-start'>
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-[#efe7dc] shadow-sm'>
          <p className='bg-[#0b3b36] px-4 py-2.5 text-xs font-semibold text-white/90'>Como chega no WhatsApp · exemplo: {exemplo.empresa}</p>
          <div className='max-h-[78vh] space-y-2 overflow-y-auto p-3'>
            <Bolha imagem={v.imagem_url} texto={previa.primeira} rodape={v.rodape} botao={botao ? { texto: v.botao_texto } : undefined} />
            <BolhaCliente texto={botao ? v.botao_texto : 'Sim'} />
            <Bolha texto={previa.nome} />
            <BolhaCliente texto='Maria Souza' />
            <Bolha texto={previa.cnpj} />
            <BolhaCliente texto='11.222.333/0001-81' />
            <Bolha imagem={v.imagem_url} texto={previa.final} botao={botao ? { texto: v.botao_site_texto, link: true } : undefined} />
          </div>
        </div>

        <div className='rounded-2xl border border-slate-200 bg-white p-4'>
          <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            <FlaskConical className='size-3.5 text-ouro-escuro' /> Testar a conversa no meu WhatsApp
          </p>
          {editando ? (
            <>
              <p className='mt-1 text-xs text-slate-400'>
                Salva os textos e manda a 1ª mensagem de verdade. Responda no celular como um cliente (toque no botão, mande nome e CNPJ).
                Fica fora do funil.
              </p>
              {numeros.length ? (
                <div className='mt-3 flex flex-wrap gap-2'>
                  <select name='teste_numero' defaultValue={numeros[0]?.id} className={cn(ENTRADA, 'h-10 w-auto py-0')}>
                    {numeros.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.rotulo}
                        {n.status !== 'WORKING' ? ' (desconectado)' : ''}
                      </option>
                    ))}
                  </select>
                  <input name='teste_telefone' placeholder='(11) 99999-9999' className={cn(ENTRADA, 'h-10 w-44 py-0')} />
                  <button
                    type='submit'
                    formAction={testar}
                    disabled={testando}
                    className='inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-marca-400 disabled:opacity-60'
                  >
                    {testando ? <LoaderCircle className='size-4 animate-spin' /> : <FlaskConical className='size-4' />} Enviar teste
                  </button>
                </div>
              ) : (
                <p className='mt-3 text-xs text-amber-700'>Cadastre um número em “Números e regras” para testar.</p>
              )}
            </>
          ) : (
            <p className='mt-1 text-xs text-slate-500'>Clique em “Criar pausada” e teste na tela da campanha — o teste usa os textos salvos.</p>
          )}
          {teste.erro && <p className='mt-2 text-xs text-red-600'>{teste.erro}</p>}
          {teste.mensagem && (
            <p className='mt-2 flex items-start gap-1.5 text-xs text-emerald-700'>
              <CheckCircle2 className='mt-px size-3.5 shrink-0' /> {teste.mensagem}
            </p>
          )}
        </div>
      </aside>
    </form>
  )
}

function Texto({
  rotulo,
  nome,
  valor,
  onChange,
  linhas,
  max
}: {
  rotulo: string
  nome: string
  valor: string
  onChange: React.ChangeEventHandler<HTMLTextAreaElement>
  linhas: number
  max: number
}) {
  return (
    <label className='block space-y-1.5'>
      <span className='flex justify-between text-xs font-semibold text-slate-600'>
        {rotulo}
        <span className={cn('font-normal', valor.length > max * 0.9 ? 'text-amber-600' : 'text-slate-300')}>
          {valor.length}/{max}
        </span>
      </span>
      <textarea name={nome} value={valor} onChange={onChange} rows={linhas} required maxLength={max} className={cn(ENTRADA, 'resize-y font-[inherit] leading-relaxed')} />
    </label>
  )
}

function Linha({
  rotulo,
  nome,
  valor,
  onChange,
  max,
  obrigatorio = true
}: {
  rotulo: string
  nome: string
  valor: string
  onChange: React.ChangeEventHandler<HTMLInputElement>
  max: number
  obrigatorio?: boolean
}) {
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-semibold text-slate-600'>{rotulo}</span>
      <input name={nome} value={valor} onChange={onChange} required={obrigatorio} maxLength={max} className={ENTRADA} />
    </label>
  )
}

/** Formatação do WhatsApp (*negrito*, _itálico_). */
function Formatado({ texto }: { texto: string }) {
  const partes = texto.split(/(\*[^*\n]+\*|_[^_\n]+_)/g)
  return (
    <>
      {partes.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') && p.length > 2 ? (
          <strong key={i}>{p.slice(1, -1)}</strong>
        ) : p.startsWith('_') && p.endsWith('_') && p.length > 2 ? (
          <em key={i}>{p.slice(1, -1)}</em>
        ) : (
          <span key={i}>{p}</span>
        )
      )}
    </>
  )
}

function Bolha({
  texto,
  imagem,
  rodape,
  botao
}: {
  texto: string
  imagem?: string | null
  rodape?: string | null
  botao?: { texto: string; link?: boolean }
}) {
  return (
    <div className='max-w-[88%] overflow-hidden rounded-xl rounded-tl-sm bg-white text-[13px] leading-relaxed text-slate-800 shadow-sm'>
      {imagem && <img src={imagem} alt='' className='aspect-[1.91/1] w-full object-cover' />}
      <div className='whitespace-pre-wrap break-words px-3 py-2'>
        <Formatado texto={texto} />
        {rodape && !botao && (
          <span className='block pt-2 italic text-slate-500'>
            <Formatado texto={rodape} />
          </span>
        )}
        {rodape && botao && <span className='block pt-1.5 text-[11.5px] text-slate-400'>{rodape}</span>}
      </div>
      {botao && (
        <p className='flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-[13px] font-medium text-[#0b8a5f]'>
          {botao.link ? <ExternalLink className='size-3.5' /> : <Reply className='size-3.5' />} {botao.texto}
        </p>
      )}
    </div>
  )
}

function BolhaCliente({ texto }: { texto: string }) {
  return (
    <div className='flex justify-end'>
      <p className='max-w-[70%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-1.5 text-[13px] text-slate-800 shadow-sm'>{texto}</p>
    </div>
  )
}
