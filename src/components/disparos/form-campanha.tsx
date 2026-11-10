'use client'
/* eslint-disable @next/next/no-img-element -- prévia da imagem que vai no WhatsApp (URL livre) */

import { startTransition, useActionState, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ExternalLink,
  FlaskConical,
  LoaderCircle,
  Gauge,
  Play,
  Reply,
  Save,
  SlidersHorizontal,
  TriangleAlert
} from 'lucide-react'
import { enviarTeste, salvarCampanha, type Retorno } from '@/app/dashboard/disparos/actions'
import { DivisaoDisparos, LOTE_SEM_LIMITE } from '@/components/disparos/divisao-disparos'
import { montar, RESPOSTAS, saudacao, VARIAVEIS, type CampanhaEditavel } from '@/lib/disparos/mensagens'
import type { Divisao } from '@/lib/disparos/tipos'
import { ORDENS, type Filtros } from '@/lib/empresas/filtros'
import { fmtInt } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { cn } from '@/lib/utils'

type Inicial = CampanhaEditavel

const QUANTIDADES = [100, 300, 500, 1000, 2000] as const
/** Campanha nova nasce com 100: "Sem limite" (a base inteira) só por escolha explícita — volume alto derruba número. */
export const QUANTIDADE_PADRAO = 100

type Envio = 'ativar' | 'pausada' | 'salvar' | 'teste'

const ENTRADA =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-marca-400 focus:ring-4 focus:ring-marca-50'

export function FormCampanha({
  inicial,
  filtros,
  rotulos,
  hrefAjustar,
  elegiveis,
  exemplo,
  numeros,
  grupo,
  divisao,
  ritmo
}: {
  inicial: Inicial
  filtros: Filtros
  rotulos: string[]
  hrefAjustar: string
  elegiveis: { com_whatsapp: number; elegiveis: number; elegiveis_sem_excluir: number } | null
  exemplo: { empresa: string; municipio: string }
  numeros: { id: number; rotulo: string; status: string | null }[]
  /** grupo da campanha: dá a marca ({marca}) e o fluxo (coleta ou só divulgação) */
  grupo: { id: number; nome: string; fluxo: 'coleta' | 'divulgacao'; medir_cliques: boolean }
  /** campanha salva: o que já saiu + a fila (nova campanha calcula a prévia na hora) */
  divisao?: Divisao | null
  /** disparos/dia que os números ativos do grupo aguentam (limite diário × janela × intervalo) */
  ritmo: { porDia: number; numeros: number }
}) {
  const divulgacao = grupo.fluxo === 'divulgacao'
  const editando = !!inicial.id
  const [v, setV] = useState<Inicial>({
    ...inicial,
    formato: inicial.formato === 'enquete' ? 'botao' : inicial.formato,
    limite_total: editando ? inicial.limite_total : (inicial.limite_total ?? QUANTIDADE_PADRAO)
  })
  // "Sem limite" só quando a pessoa clicou nele (campo de quantidade apagado NÃO vira sem limite)
  const [semLimite, setSemLimite] = useState(editando && inicial.limite_total === null)
  const [estado, salvar, salvando] = useActionState<Retorno, FormData>(salvarCampanha, {})
  const [teste, testar, testando] = useActionState<Retorno, FormData>(enviarTeste, {})
  // salvar e testar nunca rodam juntos: um envio por vez, com o indicador no botão que foi clicado
  const ocupado = salvando || testando
  const [envio, setEnvio] = useState<Envio | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const quantidade = useRef<HTMLInputElement>(null)
  const set =
    <K extends keyof Inicial>(k: K) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setV(x => ({ ...x, [k]: e.target.value }))
  const botao = v.formato === 'botao'

  // pré-visualização com uma empresa real dos filtros (sempre a 1ª variação, para não "piscar" enquanto digita)
  const vars = useMemo(
    () => ({
      ...exemplo,
      marca: grupo.nome,
      saudacao: saudacao(),
      primeiro_nome: 'Maria',
      nome: 'Maria Souza',
      telefone: '(11) 98765-4321'
    }),
    [exemplo, grupo.nome]
  )
  const fixo = () => 0
  const primeira = montar(v.mensagem, vars, fixo)
  const previa = {
    primeira: divulgacao
      ? botao
        ? primeira
        : `${primeira}\n\n👉 ${grupo.medir_cliques ? 'https://www.oficialcert.com/r/Ab3dE5gH7k' : v.site_url}`
      : botao || /\bSIM\b/.test(primeira)
        ? primeira
        : `${primeira}\n\n${RESPOSTAS.sem_botao}`,
    nome: montar(v.pergunta_nome, vars, fixo),
    contato: montar(v.pergunta_contato, vars, fixo),
    final: botao
      ? montar(v.mensagem_obrigado, vars, fixo)
      : `${montar(v.mensagem_obrigado, vars, fixo)}\n\n👉 ${v.site_url}`
  }
  const disponiveis = elegiveis
    ? v.excluir_compartilhados
      ? elegiveis.elegiveis
      : elegiveis.elegiveis_sem_excluir
    : null
  const escolherQuantidade = (q: number | null) => {
    setV(x => ({ ...x, limite_total: q }))
    setSemLimite(false)
    setAviso(null)
  }

  /**
   * Envio pelo onSubmit (não pelo `action` do form): o React 19 limpa os campos não controlados depois de uma
   * action de formulário, e aqui a pessoa perderia o telefone de teste quando o servidor recusa. Também é aqui que
   * fica a trava de um envio por vez e a confirmação antes de ativar.
   */
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (ocupado) return
    const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
    const tipo = (botao?.dataset.envio as Envio | undefined) ?? (editando ? 'salvar' : 'pausada')
    if (tipo !== 'teste' && v.limite_total === null && !semLimite) {
      setAviso('Escolha quantos disparos (ou “Sem limite”).')
      quantidade.current?.focus()
      return
    }
    if (tipo === 'ativar') {
      const dias = ritmo.porDia ? Math.ceil((v.limite_total ?? LOTE_SEM_LIMITE) / ritmo.porDia) : null
      const quanto = v.limite_total
        ? `até ${fmtInt(v.limite_total)} mensagens`
        : `SEM LIMITE — até acabar a base (${fmtInt(disponiveis)} empresas)`
      const ok = window.confirm(
        `Criar e ativar agora? A campanha começa a enviar ${quanto} no próximo horário de envio` +
          (dias ? ` (cerca de ${fmtInt(dias)} ${dias === 1 ? 'dia' : 'dias'}${v.limite_total ? '' : ' para cada 1.000'}).` : '.')
      )
      if (!ok) return
    }
    const fd = new FormData(e.currentTarget, botao)
    setAviso(null)
    setEnvio(tipo)
    startTransition(() => (tipo === 'teste' ? testar(fd) : salvar(fd)))
  }
  const girando = (tipo: Envio) => ocupado && envio === tipo

  return (
    <form onSubmit={enviar} aria-busy={ocupado} className='grid gap-5 xl:grid-cols-[1.2fr_1fr]'>
      {inicial.id && <input type='hidden' name='id' value={inicial.id} />}
      <input type='hidden' name='filtros' value={JSON.stringify(filtros)} />
      <input type='hidden' name='grupo_id' value={grupo.id} />
      <input type='hidden' name='formato' value={v.formato} />

      <div className='space-y-5'>
        {/* ---------- público ---------- */}
        <section className='rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Para quem</p>
          <div className='mt-3 flex flex-wrap items-center gap-1.5'>
            {rotulos.length ? (
              rotulos.map(r => (
                <span
                  key={r}
                  className='rounded-full border border-marca-200 bg-marca-50 px-2.5 py-1 text-xs text-marca-900'
                >
                  {r}
                </span>
              ))
            ) : (
              <span className='text-sm text-slate-500'>Toda a base com WhatsApp (nenhum filtro).</span>
            )}
            {!editando && (
              <Link
                href={hrefAjustar}
                className='inline-flex items-center gap-1 px-2 text-xs font-semibold text-marca-700 hover:underline'
              >
                <SlidersHorizontal className='size-3.5' /> ajustar na Consulta
              </Link>
            )}
          </div>
          {elegiveis && (
            <p className='mt-3 text-sm text-slate-600'>
              <strong className='font-serif text-xl text-marca-800'>{fmtInt(disponiveis)}</strong>{' '}
              {disponiveis === 1 ? 'empresa pode' : 'empresas podem'} receber agora
              <span className='text-slate-500'>
                {' '}
                · {fmtInt(elegiveis.com_whatsapp)} têm celular nos filtros; quem já foi contatado nunca entra de novo
              </span>
            </p>
          )}
          <div className='mt-4 grid gap-4 sm:grid-cols-2'>
            <label className='block space-y-1.5 sm:col-span-2'>
              <span className='text-xs font-semibold text-slate-600'>Nome da campanha</span>
              <input name='nome' value={v.nome} onChange={set('nome')} required maxLength={120} className={ENTRADA} />
            </label>

            {/* ---------- quantidade ---------- */}
            <fieldset className='space-y-2 sm:col-span-2'>
              <legend className='mb-2 block text-xs font-semibold text-slate-600'>
                Quantos disparos <span className='font-normal text-slate-500'>· comece pequeno: o padrão é 100</span>
              </legend>
              <div className='flex flex-wrap items-center gap-1.5'>
                {QUANTIDADES.map(q => (
                  <button
                    key={q}
                    type='button'
                    aria-pressed={v.limite_total === q}
                    onClick={() => escolherQuantidade(q)}
                    className={cn(
                      'h-9 rounded-full border px-3.5 text-sm font-semibold tabular-nums transition',
                      v.limite_total === q
                        ? 'border-marca-800 bg-marca-800 text-creme'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-marca-300'
                    )}
                  >
                    {fmtInt(q)}
                  </button>
                ))}
                <input
                  ref={quantidade}
                  name='limite_total'
                  type='number'
                  min={1}
                  value={v.limite_total ?? ''}
                  onChange={e => {
                    setV(x => ({ ...x, limite_total: e.target.value ? Number(e.target.value) : null }))
                    setSemLimite(false)
                    setAviso(null)
                  }}
                  placeholder='outra'
                  aria-label='Outra quantidade de disparos'
                  aria-invalid={!!aviso}
                  className={cn(ENTRADA, 'h-9 w-28 py-0 tabular-nums', aviso && 'border-red-400')}
                />
                <button
                  type='button'
                  aria-pressed={semLimite}
                  onClick={() => {
                    setV(x => ({ ...x, limite_total: null }))
                    setSemLimite(true)
                    setAviso(null)
                  }}
                  className={cn(
                    'h-9 rounded-full border border-dashed px-3.5 text-sm font-semibold transition',
                    semLimite
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-300 bg-white text-slate-600 hover:border-amber-400'
                  )}
                >
                  Sem limite…
                </button>
              </div>
              {aviso && (
                <p role='alert' className='text-xs font-semibold text-red-700'>
                  {aviso}
                </p>
              )}
              {semLimite ? (
                <div role='alert' className='flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-900'>
                  <TriangleAlert className='mt-px size-4 shrink-0' aria-hidden />
                  <p>
                    <strong>Sem limite manda para a base inteira dos filtros</strong>
                    {disponiveis !== null && <> ({fmtInt(disponiveis)} empresas)</>}, em lotes de 1.000, até acabar.
                    Volume alto de uma vez é o que mais derruba número de WhatsApp: para começar, prefira uma quantidade.
                  </p>
                </div>
              ) : (
                <p className='text-xs text-slate-500'>
                  {v.limite_total
                    ? `Conta só as mensagens que saíram (celular sem WhatsApp não conta). Ao chegar em ${fmtInt(v.limite_total)}, a campanha encerra sozinha.`
                    : 'Escolha uma quantidade.'}
                  {disponiveis !== null && v.limite_total && v.limite_total > disponiveis && (
                    <span className='text-amber-800'> Há só {fmtInt(disponiveis)} empresas disponíveis.</span>
                  )}
                </p>
              )}
              <Ritmo quantidade={v.limite_total} ritmo={ritmo} />
            </fieldset>

            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold text-slate-600'>Dentro de cada nicho, começar por</span>
              <select name='ordem' value={v.ordem} onChange={set('ordem')} className={ENTRADA}>
                {Object.entries(ORDENS).map(([k, r]) => (
                  <option key={k} value={k}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className='flex items-start gap-2.5 self-end pb-1 text-sm text-slate-700'>
              <input
                type='checkbox'
                name='excluir_compartilhados'
                checked={v.excluir_compartilhados}
                onChange={e => setV(x => ({ ...x, excluir_compartilhados: e.target.checked }))}
                className='mt-0.5 size-4 accent-[#1a2d5a]'
              />
              <span>
                Pular celulares que aparecem em mais de uma empresa
                <span className='block text-xs text-slate-400'>
                  Costumam ser do contador ou de um grupo — a mensagem fala de uma empresa só.
                </span>
              </span>
            </label>
          </div>
          <DivisaoDisparos
            quantidade={v.limite_total}
            consulta={
              editando
                ? undefined
                : { filtros, ordem: v.ordem, excluir_compartilhados: v.excluir_compartilhados, grupo_id: grupo.id }
            }
            salva={editando ? divisao : undefined}
            alterada={
              editando &&
              (v.limite_total !== inicial.limite_total ||
                v.ordem !== inicial.ordem ||
                v.excluir_compartilhados !== inicial.excluir_compartilhados)
            }
          />
        </section>

        {/* ---------- 1ª mensagem ---------- */}
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <div className='flex flex-wrap items-baseline justify-between gap-2'>
            <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>1 · Primeira mensagem</p>
            <p className='text-[11px] text-slate-400'>
              {VARIAVEIS.map(x => (
                <span
                  key={x.nome}
                  title={x.texto}
                  className='ml-2 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600'
                >
                  {x.nome}
                </span>
              ))}
            </p>
          </div>
          <div className='grid grid-cols-2 gap-2'>
            {(
              [
                ['texto', 'Responder por texto', 'Logo + texto; a pessoa responde SIM, 1 ou 2 (sem botões)'],
                ['botao', 'Com botões', 'Logo + texto + botões tocáveis (Z-API)']
              ] as const
            ).map(([f, titulo, nota]) => (
              <button
                key={f}
                type='button'
                aria-pressed={v.formato === f}
                onClick={() => setV(x => ({ ...x, formato: f }))}
                className={cn(
                  'rounded-xl border px-3.5 py-2.5 text-left transition',
                  v.formato === f
                    ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100'
                    : 'border-slate-200 hover:border-marca-300'
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
              {v.imagem_url && (
                <img
                  src={v.imagem_url}
                  alt=''
                  className='h-10 w-[76px] shrink-0 rounded-md border border-slate-200 object-cover'
                />
              )}
              <input
                name='imagem_url'
                value={v.imagem_url ?? ''}
                onChange={set('imagem_url')}
                placeholder='sem imagem'
                className={ENTRADA}
              />
            </div>
          </label>
          <Texto rotulo='Texto' nome='mensagem' valor={v.mensagem} onChange={set('mensagem')} linhas={7} max={1024} />
          <div className='grid gap-3 sm:grid-cols-[1fr_200px]'>
            <Linha
              rotulo='Rodapé (cinza, até 60)'
              nome='rodape'
              valor={v.rodape ?? ''}
              onChange={set('rodape')}
              max={60}
              obrigatorio={false}
            />
            {botao && !divulgacao ? (
              <Linha
                rotulo='Botão (até 20)'
                nome='botao_texto'
                valor={v.botao_texto}
                onChange={set('botao_texto')}
                max={20}
              />
            ) : (
              <input type='hidden' name='botao_texto' value={v.botao_texto} />
            )}
          </div>
        </section>

        {/* ---------- coleta (só no fluxo de coleta) ---------- */}
        {divulgacao ? (
          <>
            {(
              [
                'pergunta_nome',
                'pergunta_contato',
                'botao_mesmo_numero',
                'botao_outro_numero',
                'pergunta_telefone',
                'mensagem_obrigado'
              ] as const
            ).map(k => (
              <input key={k} type='hidden' name={k} value={v[k]} />
            ))}
          </>
        ) : (
          <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
            <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
              2 · Depois do “quero”: coleta pela conversa
            </p>
            <Texto
              rotulo='Pergunta do nome completo'
              nome='pergunta_nome'
              valor={v.pergunta_nome}
              onChange={set('pergunta_nome')}
              linhas={3}
              max={1000}
            />
            <Texto
              rotulo='Pergunta do número de contato'
              nome='pergunta_contato'
              valor={v.pergunta_contato}
              onChange={set('pergunta_contato')}
              linhas={3}
              max={1000}
            />
            {botao ? (
              <div className='grid gap-3 sm:grid-cols-2'>
                <Linha
                  rotulo='Botão “este número” (até 20)'
                  nome='botao_mesmo_numero'
                  valor={v.botao_mesmo_numero}
                  onChange={set('botao_mesmo_numero')}
                  max={20}
                />
                <Linha
                  rotulo='Botão “outro número” (até 20)'
                  nome='botao_outro_numero'
                  valor={v.botao_outro_numero}
                  onChange={set('botao_outro_numero')}
                  max={20}
                />
              </div>
            ) : (
              <>
                <input type='hidden' name='botao_mesmo_numero' value={v.botao_mesmo_numero} />
                <input type='hidden' name='botao_outro_numero' value={v.botao_outro_numero} />
              </>
            )}
            <Texto
              rotulo='Se escolher outro número'
              nome='pergunta_telefone'
              valor={v.pergunta_telefone}
              onChange={set('pergunta_telefone')}
              linhas={2}
              max={1000}
            />
            <p className='text-xs text-slate-400'>
              Nome sem sobrenome ou número inválido: o robô pede de novo (até 3 vezes; depois chama a equipe). Se a
              pessoa já mandar o número direto, ele é aceito.
            </p>
          </section>
        )}

        {/* ---------- final ---------- */}
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            {divulgacao ? '2 · Link da divulgação' : '3 · Mensagem final (com a logo)'}
          </p>
          {!divulgacao && (
            <Texto
              rotulo='Texto'
              nome='mensagem_obrigado'
              valor={v.mensagem_obrigado}
              onChange={set('mensagem_obrigado')}
              linhas={6}
              max={1024}
            />
          )}
          <div className='grid gap-3 sm:grid-cols-[200px_1fr]'>
            <Linha
              rotulo={divulgacao ? 'Botão do link (até 20)' : 'Botão do site (até 20)'}
              nome='botao_site_texto'
              valor={v.botao_site_texto}
              onChange={set('botao_site_texto')}
              max={20}
            />
            <Linha
              rotulo='Endereço que o link abre'
              nome='site_url'
              valor={v.site_url}
              onChange={set('site_url')}
              max={300}
            />
          </div>
          {divulgacao && grupo.medir_cliques && (
            <p className='text-xs text-slate-400'>
              O link passa por oficialcert.com/r/… para contar quem clicou e segue para este endereço.
            </p>
          )}
          <Texto
            rotulo='Se responder “não”'
            nome='mensagem_nao'
            valor={v.mensagem_nao}
            onChange={set('mensagem_nao')}
            linhas={2}
            max={1000}
          />
          <p className='text-xs text-slate-400'>
            Fixos: “SAIR” (e parecidos) descadastra na hora. Perguntas e áudios vão para “Precisam de atenção”, para
            alguém da equipe responder.
          </p>
        </section>

        {estado.erro && (
          <p role='alert' className='rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'>
            {estado.erro}
          </p>
        )}
        <div className='flex flex-wrap gap-2'>
          {editando ? (
            <button
              type='submit'
              data-envio='salvar'
              disabled={ocupado}
              className='inline-flex h-11 items-center gap-2 rounded-full bg-marca-800 px-6 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'
            >
              {girando('salvar') ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <Save className='size-4' aria-hidden />}{' '}
              {girando('salvar') ? 'Salvando…' : 'Salvar alterações'}
            </button>
          ) : (
            <>
              <button
                type='submit'
                data-envio='ativar'
                disabled={ocupado}
                className='inline-flex h-11 items-center gap-2 rounded-full bg-marca-800 px-6 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'
              >
                {girando('ativar') ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <Play className='size-4' aria-hidden />}{' '}
                {girando('ativar') ? 'Criando…' : 'Criar e ativar'}
              </button>
              <button
                type='submit'
                data-envio='pausada'
                disabled={ocupado}
                className='inline-flex h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm font-bold text-slate-700 hover:border-marca-400 disabled:opacity-60'
              >
                {girando('pausada') ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <Save className='size-4' aria-hidden />}{' '}
                {girando('pausada') ? 'Criando…' : 'Criar pausada (para testar)'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ---------- pré-visualização e teste ---------- */}
      <aside className='space-y-4 xl:sticky xl:top-4 xl:self-start'>
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-[#efe7dc] shadow-sm'>
          <p className='bg-[#0b3b36] px-4 py-2.5 text-xs font-semibold text-white/90'>
            {grupo.nome} · como chega no WhatsApp · exemplo: {exemplo.empresa}
          </p>
          <div className='max-h-[78vh] space-y-2 overflow-y-auto p-3'>
            {divulgacao ? (
              <Bolha
                imagem={v.imagem_url}
                texto={previa.primeira}
                rodape={v.rodape}
                botao={botao ? { texto: v.botao_site_texto, link: true } : undefined}
              />
            ) : (
              <>
                <Bolha
                  imagem={v.imagem_url}
                  texto={previa.primeira}
                  rodape={v.rodape}
                  botao={botao ? { texto: v.botao_texto } : undefined}
                />
                <BolhaCliente texto={botao ? v.botao_texto : 'Sim'} />
                <Bolha texto={previa.nome} />
                <BolhaCliente texto='Maria Souza' />
                <Bolha
                  texto={
                    botao ? previa.contato : `${previa.contato}\n\n${RESPOSTAS.contato_sem_botao('(11) 99999-0000')}`
                  }
                  botoes={botao ? [v.botao_mesmo_numero, v.botao_outro_numero] : undefined}
                />
                <BolhaCliente texto={botao ? v.botao_outro_numero : '2'} />
                <Bolha texto={v.pergunta_telefone} />
                <BolhaCliente texto='(11) 98765-4321' />
                <Bolha
                  imagem={v.imagem_url}
                  texto={previa.final}
                  botao={botao ? { texto: v.botao_site_texto, link: true } : undefined}
                />
              </>
            )}
          </div>
        </div>

        <div className='rounded-2xl border border-slate-200 bg-white p-4'>
          <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            <FlaskConical className='size-3.5 text-ouro-escuro' /> Testar a conversa no meu WhatsApp
          </p>
          {editando ? (
            <>
              <p className='mt-1 text-xs text-slate-500'>
                Salva os textos e manda a 1ª mensagem de verdade. Responda no celular como um cliente (SIM, nome,
                número). Fica fora do funil.
              </p>
              {numeros.length ? (
                <div className='mt-3 flex flex-wrap gap-2'>
                  <select
                    name='teste_numero'
                    defaultValue={numeros[0]?.id}
                    aria-label='Número que envia o teste'
                    className={cn(ENTRADA, 'h-10 w-auto max-w-full py-0')}
                  >
                    {numeros.map(n => (
                      <option key={n.id} value={n.id}>
                        {n.rotulo}
                        {n.status !== 'WORKING' ? ' (desconectado)' : ''}
                      </option>
                    ))}
                  </select>
                  <input
                    name='teste_telefone'
                    type='tel'
                    placeholder='(11) 99999-9999'
                    aria-label='Seu WhatsApp para o teste'
                    className={cn(ENTRADA, 'h-10 w-44 py-0')}
                  />
                  <button
                    type='submit'
                    data-envio='teste'
                    disabled={ocupado}
                    className='inline-flex h-10 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:border-marca-400 disabled:opacity-60'
                  >
                    {girando('teste') ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <FlaskConical className='size-4' aria-hidden />}{' '}
                    {girando('teste') ? 'Enviando…' : 'Enviar teste'}
                  </button>
                </div>
              ) : (
                <p className='mt-3 text-xs text-amber-700'>Cadastre um número em “Números e regras” para testar.</p>
              )}
            </>
          ) : (
            <p className='mt-1 text-xs text-slate-500'>
              Clique em “Criar pausada” e teste na tela da campanha — o teste usa os textos salvos.
            </p>
          )}
          {teste.erro && (
            <p role='alert' className='mt-2 text-xs text-red-700'>
              {teste.erro}
            </p>
          )}
          {teste.mensagem && (
            <p role='status' className='mt-2 flex items-start gap-1.5 text-xs text-marca-800'>
              <CheckCircle2 className='mt-px size-3.5 shrink-0 text-ouro-escuro' aria-hidden /> {teste.mensagem}
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
        <span className={cn('font-normal', valor.length > max * 0.9 ? 'text-amber-700' : 'text-slate-400')}>
          {valor.length}/{max}
        </span>
      </span>
      <textarea
        name={nome}
        value={valor}
        onChange={onChange}
        rows={linhas}
        required
        maxLength={max}
        className={cn(ENTRADA, 'resize-y font-[inherit] leading-relaxed')}
      />
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
export function Formatado({ texto }: { texto: string }) {
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

export function Bolha({
  texto,
  imagem,
  rodape,
  botao,
  botoes
}: {
  texto: string
  imagem?: string | null
  rodape?: string | null
  botao?: { texto: string; link?: boolean }
  botoes?: string[]
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
      {botoes?.map(b => (
        <p
          key={b}
          className='flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-[13px] font-medium text-[#0b8a5f]'
        >
          <Reply className='size-3.5' /> {b}
        </p>
      ))}
      {botao && (
        <p className='flex items-center justify-center gap-1.5 border-t border-slate-100 py-2 text-[13px] font-medium text-[#0b8a5f]'>
          {botao.link ? <ExternalLink className='size-3.5' /> : <Reply className='size-3.5' />} {botao.texto}
        </p>
      )}
    </div>
  )
}

export function BolhaCliente({ texto }: { texto: string }) {
  return (
    <div className='flex justify-end'>
      <p className='max-w-[70%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-1.5 text-[13px] text-slate-800 shadow-sm'>
        {texto}
      </p>
    </div>
  )
}

/** Quanto tempo a quantidade leva no ritmo dos números do grupo (em destaque: é o que protege o número). */
function Ritmo({ quantidade, ritmo }: { quantidade: number | null; ritmo: { porDia: number; numeros: number } }) {
  if (!ritmo.porDia) {
    return (
      <p className='flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900'>
        <Gauge className='mt-px size-4 shrink-0' aria-hidden />
        Nenhum número ativo neste grupo: a campanha só envia depois de cadastrar um.
      </p>
    )
  }
  const alvo = quantidade ?? LOTE_SEM_LIMITE
  const dias = Math.ceil(alvo / ritmo.porDia)
  return (
    <div className='flex items-start gap-2.5 rounded-xl border border-marca-100 bg-marca-50/60 px-3 py-2.5 text-xs text-slate-700'>
      <Gauge className='mt-px size-4 shrink-0 text-ouro-escuro' aria-hidden />
      <p>
        <strong className='text-marca-800'>
          Ritmo: até {fmtInt(ritmo.porDia)}/dia
        </strong>{' '}
        com {ritmo.numeros} {ritmo.numeros === 1 ? 'número' : 'números'} →{' '}
        <strong className='text-marca-800'>
          {dias <= 1
            ? 'cabe em 1 dia de envio'
            : `~${fmtInt(dias)} dias de envio${quantidade ? '' : ' para cada 1.000'}`}
        </strong>
        .
        {dias > 1 && (
          <>
            {' '}
            Para ir mais rápido, aumente aos poucos o limite diário ou acrescente números em{' '}
            <Link href={ROTAS.numeros} className='font-semibold text-marca-700 underline'>
              Números e regras
            </Link>
            .
          </>
        )}
      </p>
    </div>
  )
}
