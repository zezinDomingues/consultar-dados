'use client'
/* eslint-disable @next/next/no-img-element -- prévia da logo enviada (URL livre do Storage) */

import { useActionState, useRef, useState } from 'react'
import { ImageUp, LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { salvarGrupo, type Retorno } from '@/app/dashboard/disparos/grupos/actions'
import { Bolha, BolhaCliente } from '@/components/disparos/form-campanha'
import { MODELO_DIVULGACAO, MODELOS, montar, RESPOSTAS, saudacao, VARIAVEIS } from '@/lib/disparos/mensagens'
import type { FluxoGrupo, GrupoDisparo } from '@/lib/disparos/tipos'
import { cn } from '@/lib/utils'

const ENTRADA = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'

type Textos = Record<keyof typeof MODELOS | keyof typeof MODELO_DIVULGACAO, string>

export function FormGrupo({ grupo }: { grupo?: GrupoDisparo }) {
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(salvarGrupo, {})
  const [nome, setNome] = useState(grupo?.nome ?? '')
  const [logo, setLogo] = useState(grupo?.logo_url ?? '')
  const [fluxo, setFluxo] = useState<FluxoGrupo>(grupo?.fluxo ?? 'divulgacao')
  const [enviando, setEnviando] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)
  const base = (f: FluxoGrupo) => ({ ...MODELOS, ...(f === 'divulgacao' ? MODELO_DIVULGACAO : {}) }) as Textos
  const [t, setT] = useState<Textos>({ ...base(grupo?.fluxo ?? 'divulgacao'), ...(grupo?.modelo ?? {}) } as Textos)
  const set = (k: keyof Textos) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setT(x => ({ ...x, [k]: e.target.value }))

  async function subirLogo(f: File) {
    setEnviando(true)
    try {
      const fd = new FormData()
      fd.append('arquivo', f)
      const r = await fetch('/api/disparos/logo', { method: 'POST', body: fd })
      const j = (await r.json()) as { url?: string; erro?: string }
      if (!r.ok || !j.url) throw new Error(j.erro ?? 'Falha no envio.')
      setLogo(j.url)
      toast.success('Logo enviada.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Falha no envio.')
    } finally {
      setEnviando(false)
    }
  }

  const vars = { marca: nome || 'Sua Marca', empresa: 'Acme Comércio', saudacao: saudacao(), primeiro_nome: 'Maria', nome: 'Maria Souza', telefone: '(11) 98765-4321' }
  const m = (s: string) => montar(s.replaceAll('{marca}', vars.marca), vars, () => 0)
  const coleta = fluxo === 'coleta'

  return (
    <form action={acao} className='grid gap-5 xl:grid-cols-[1.2fr_1fr]'>
      {grupo && <input type='hidden' name='id' value={grupo.id} />}
      <input type='hidden' name='fluxo' value={fluxo} />
      <input type='hidden' name='logo_url' value={logo} />

      <div className='space-y-5'>
        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Marca</p>
          <div className='grid gap-3 sm:grid-cols-2'>
            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold text-slate-600'>Nome (aparece como {'{marca}'} nas mensagens)</span>
              <input name='nome' value={nome} onChange={e => setNome(e.target.value)} required maxLength={80} className={ENTRADA} />
            </label>
            <label className='block space-y-1.5'>
              <span className='text-xs font-semibold text-slate-600'>Site</span>
              <input name='site_url' defaultValue={grupo?.site_url ?? ''} placeholder='https://www.cliente.com.br' className={ENTRADA} />
            </label>
          </div>
          <div className='flex flex-wrap items-center gap-3'>
            {logo ? (
              <img src={logo} alt='' className='h-16 w-[122px] rounded-lg border border-slate-200 object-cover' />
            ) : (
              <span className='grid h-16 w-[122px] place-items-center rounded-lg border border-dashed border-slate-300 text-[11px] text-slate-400'>sem logo</span>
            )}
            <input ref={arquivo} type='file' accept='image/jpeg,image/png' className='hidden' onChange={e => e.target.files?.[0] && subirLogo(e.target.files[0])} />
            <button type='button' onClick={() => arquivo.current?.click()} disabled={enviando} className='inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700 hover:border-marca-400 disabled:opacity-60'>
              {enviando ? <LoaderCircle className='size-4 animate-spin' /> : <ImageUp className='size-4' />} Enviar logo (JPG/PNG)
            </button>
            <span className='text-[11px] text-slate-400'>Formato largo (1200×628) fica melhor no topo da mensagem.</span>
          </div>
        </section>

        <section className='space-y-4 rounded-2xl border border-slate-200 bg-white p-5'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Conversa</p>
          <div className='grid grid-cols-2 gap-2'>
            {(
              [
                ['divulgacao', 'Só divulgação', 'Logo + texto + link do site. Sem perguntas; respostas vão para o grupo.'],
                ['coleta', 'Coleta (como a OficialCert)', 'SIM → nome → número de contato → mensagem final com o site.']
              ] as const
            ).map(([v, titulo, nota]) => (
              <button
                key={v}
                type='button'
                onClick={() => {
                  setFluxo(v)
                  if (!grupo) setT(base(v))
                }}
                className={cn('rounded-xl border px-3.5 py-2.5 text-left', fluxo === v ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100' : 'border-slate-200 hover:border-marca-300')}
              >
                <span className='block text-sm font-semibold text-slate-800'>{titulo}</span>
                <span className='block text-xs text-slate-500'>{nota}</span>
              </button>
            ))}
          </div>
          <p className='text-[11px] text-slate-400'>
            Modelo das mensagens: toda campanha nova do grupo começa com estes textos (dá para ajustar em cada campanha).
            {VARIAVEIS.map(x => (
              <span key={x.nome} title={x.texto} className='ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-slate-600'>
                {x.nome}
              </span>
            ))}
          </p>
          <Campo rotulo='1ª mensagem' nome='mensagem' valor={t.mensagem} onChange={set('mensagem')} linhas={6} max={1024} />
          <div className='grid gap-3 sm:grid-cols-[1fr_200px]'>
            <Linha rotulo='Rodapé (até 60)' nome='rodape' valor={t.rodape} onChange={set('rodape')} max={60} />
            {coleta ? (
              <Linha rotulo='Botão (até 20)' nome='botao_texto' valor={t.botao_texto} onChange={set('botao_texto')} max={20} />
            ) : (
              <Linha rotulo='Botão do link (até 20)' nome='botao_site_texto' valor={t.botao_site_texto} onChange={set('botao_site_texto')} max={20} />
            )}
          </div>
          {coleta && (
            <>
              <Campo rotulo='Pergunta do nome' nome='pergunta_nome' valor={t.pergunta_nome} onChange={set('pergunta_nome')} linhas={2} max={1000} />
              <Campo rotulo='Pergunta do número de contato' nome='pergunta_contato' valor={t.pergunta_contato} onChange={set('pergunta_contato')} linhas={2} max={1000} />
              <Campo rotulo='Se escolher outro número' nome='pergunta_telefone' valor={t.pergunta_telefone} onChange={set('pergunta_telefone')} linhas={2} max={1000} />
              <Campo rotulo='Mensagem final' nome='mensagem_obrigado' valor={t.mensagem_obrigado} onChange={set('mensagem_obrigado')} linhas={4} max={1024} />
              <Linha rotulo='Botão do site na mensagem final (até 20)' nome='botao_site_texto' valor={t.botao_site_texto} onChange={set('botao_site_texto')} max={20} />
            </>
          )}
          <Campo rotulo='Se responder “não”' nome='mensagem_nao' valor={t.mensagem_nao} onChange={set('mensagem_nao')} linhas={2} max={1000} />
        </section>

        <section className='space-y-3 rounded-2xl border border-slate-200 bg-white p-5'>
          {!coleta && (
            <label className='flex items-start gap-2.5 text-sm text-slate-700'>
              <input type='checkbox' name='medir_cliques' defaultChecked={grupo?.medir_cliques ?? true} className='mt-0.5 size-4 accent-[#1a2d5a]' />
              <span>
                Medir cliques no link
                <span className='block text-xs text-slate-400'>O link passa por oficialcert.com/r/… e vai para o site. Desmarque para o link ir direto ao site do cliente (sem contar clique).</span>
              </span>
            </label>
          )}
          {coleta && <input type='hidden' name='medir_cliques' value='on' />}
          <label className='flex items-center gap-2.5 text-sm text-slate-700'>
            <input type='checkbox' name='ativo' defaultChecked={grupo?.ativo ?? true} className='size-4 accent-[#1a2d5a]' /> Grupo ativo (desativado = nenhum envio)
          </label>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Observação interna</span>
            <input name='observacao' defaultValue={grupo?.observacao ?? ''} maxLength={500} placeholder='contrato, valor, contato do cliente…' className={ENTRADA} />
          </label>
        </section>

        {estado.erro && <p className='rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'>{estado.erro}</p>}
        <button type='submit' disabled={salvando} className='inline-flex h-11 items-center gap-2 rounded-full bg-marca-800 px-6 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'>
          {salvando ? <LoaderCircle className='size-4 animate-spin' /> : <Save className='size-4' />} {grupo ? 'Salvar grupo' : 'Criar grupo'}
        </button>
      </div>

      <aside className='xl:sticky xl:top-4 xl:self-start'>
        <div className='overflow-hidden rounded-2xl border border-slate-200 bg-[#efe7dc] shadow-sm'>
          <p className='bg-[#0b3b36] px-4 py-2.5 text-xs font-semibold text-white/90'>Como chega no WhatsApp</p>
          <div className='max-h-[78vh] space-y-2 overflow-y-auto p-3'>
            {coleta ? (
              <>
                <Bolha imagem={logo || null} texto={m(t.mensagem)} rodape={t.rodape} botao={{ texto: t.botao_texto }} />
                <BolhaCliente texto={t.botao_texto} />
                <Bolha texto={m(t.pergunta_nome)} />
                <BolhaCliente texto='Maria Souza' />
                <Bolha texto={m(t.pergunta_contato)} botoes={['Usar este número', 'Informar outro']} />
                <BolhaCliente texto='Usar este número' />
                <Bolha imagem={logo || null} texto={m(t.mensagem_obrigado)} botao={{ texto: t.botao_site_texto, link: true }} />
              </>
            ) : (
              <>
                <Bolha imagem={logo || null} texto={m(t.mensagem)} rodape={t.rodape} botao={{ texto: t.botao_site_texto, link: true }} />
                <p className='py-1 text-center text-[11px] text-slate-500'>— se responder “SAIR” —</p>
                <Bolha texto={RESPOSTAS.descadastro(vars.marca)} />
              </>
            )}
          </div>
        </div>
        <p className='mt-2 text-[11px] text-slate-400'>Pela Z-API os botões aparecem no celular. Se a campanha estiver em “Responder por texto”, o link vai escrito escrito.</p>
      </aside>
    </form>
  )
}

function Campo({ rotulo, nome, valor, onChange, linhas, max }: { rotulo: string; nome: string; valor: string; onChange: React.ChangeEventHandler<HTMLTextAreaElement>; linhas: number; max: number }) {
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-semibold text-slate-600'>{rotulo}</span>
      <textarea name={nome} value={valor} onChange={onChange} rows={linhas} maxLength={max} className={cn(ENTRADA, 'resize-y leading-relaxed')} />
    </label>
  )
}

function Linha({ rotulo, nome, valor, onChange, max }: { rotulo: string; nome: string; valor: string; onChange: React.ChangeEventHandler<HTMLInputElement>; max: number }) {
  return (
    <label className='block space-y-1.5'>
      <span className='text-xs font-semibold text-slate-600'>{rotulo}</span>
      <input name={nome} value={valor} onChange={onChange} maxLength={max} className={ENTRADA} />
    </label>
  )
}
