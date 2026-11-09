'use client'

import { startTransition, useActionState, useCallback, useEffect, useId, useRef, useState } from 'react'
import { AlertTriangle, Copy, Eye, LoaderCircle, Save, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { atualizarUsuario, criarUsuario, type Retorno } from '@/app/dashboard/usuarios/actions'
import { MultiSelect } from '@/components/consulta/multi-select'
import type { Opcao } from '@/lib/empresas/tipos'
import type { Usuario } from '@/lib/usuarios/dados'
import { PAPEIS } from '@/lib/usuarios/papeis'
import { cn } from '@/lib/utils'

const ENTRADA =
  'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50 aria-[invalid=true]:border-red-400'
/** Anel de foco só para teclado (Tab), em todo controle. */
const FOCO = 'outline-none focus-visible:ring-2 focus-visible:ring-marca-500 focus-visible:ring-offset-2'

type Campo = 'nome' | 'email' | 'senha' | 'papel' | 'ramos' | 'grupos' | 'produto' | 'plano_ramos' | 'cota' | 'pacote' | 'validade' | 'observacao' | 'ativo'
type Erro = { campo: Campo | null; erro: string }

/**
 * Em que campo mostrar o erro do servidor. Se a action devolver `campo`, vale ele; senão, deduz pela mensagem.
 * Sem campo reconhecido, o erro aparece junto do botão de salvar.
 */
function campoDoErro(r: Retorno & { campo?: string }, papel: string): Campo | null {
  if (r.campo) return r.campo as Campo
  const m = (r.erro ?? '').toLowerCase()
  if (!m || m.startsWith('usuário criado')) return null // gravou pela metade: não é para corrigir um campo e reenviar
  if (/e-?mail|login/.test(m)) return 'email'
  if (/senha/.test(m)) return 'senha'
  if (/\bnome\b/.test(m)) return 'nome'
  if (/admin/.test(m)) return 'papel'
  if (/ramo/.test(m)) return papel === 'cliente' ? 'plano_ramos' : 'ramos'
  if (/validade|válid|vencid|\bdata\b/.test(m)) return 'validade'
  if (/por mês|cota/.test(m)) return 'cota'
  if (/pacote/.test(m)) return 'pacote'
  if (/produto/.test(m)) return 'produto'
  if (/grupo/.test(m)) return 'grupos'
  return null
}

/** Formulário de usuário. Depois de criar um, nasce de novo vazio (troca a key) para cadastrar o próximo. */
export function FormUsuario(props: { usuario?: Usuario; ramos: Opcao[]; ufs: Opcao[]; grupos: Opcao[] }) {
  const [versao, setVersao] = useState(0)
  const recomecar = useCallback(() => setVersao(v => v + 1), [])
  return <Formulario key={versao} {...props} recomecar={recomecar} />
}

function Formulario({
  usuario,
  ramos,
  ufs,
  grupos,
  recomecar
}: {
  usuario?: Usuario
  ramos: Opcao[]
  ufs: Opcao[]
  grupos: Opcao[]
  recomecar: () => void
}) {
  const uid = useId()
  const novo = !usuario
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(novo ? criarUsuario : atualizarUsuario, {})
  const [papel, setPapel] = useState<string>(usuario?.papel ?? 'equipe')
  const [selRamos, setSelRamos] = useState<string[] | undefined>(
    usuario?.papel === 'cliente' ? usuario.plano?.ramos : usuario?.ramos?.length ? usuario.ramos : undefined
  )
  const [selUfs, setSelUfs] = useState<string[] | undefined>(usuario?.plano?.ufs ?? undefined)
  const [modalidade, setModalidade] = useState<'mensal' | 'pacote'>(usuario?.plano?.modalidade ?? 'mensal')
  const [temConsulta, setTemConsulta] = useState<boolean>(usuario ? !!usuario.plano : true)
  const [selGrupos, setSelGrupos] = useState<string[] | undefined>(usuario?.grupos?.length ? usuario.grupos.map(String) : undefined)
  const [verSenha, setVerSenha] = useState(false)
  const [validade, setValidade] = useState(usuario?.plano?.validade ?? '')
  const [hoje, setHoje] = useState<string | null>(null) // só no navegador (evita diferença com o HTML do servidor)
  const [local, setLocal] = useState<Erro | null>(null) // o que a própria tela barrou antes de enviar
  const refForm = useRef<HTMLFormElement>(null)

  useEffect(() => setHoje(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })), [])
  useEffect(() => {
    if (!estado.ok) return
    if (!estado.senha) toast.success(estado.mensagem ?? 'Salvo.')
    if (novo && !estado.senha) recomecar()
  }, [estado, novo, recomecar])

  const servidor: Erro | null = estado.erro ? { campo: campoDoErro(estado, papel), erro: estado.erro } : null
  const erro = salvando ? null : (local ?? servidor)
  // erro novo (do servidor ou da tela): leva a pessoa até ele — o campo pode estar fora da tela num formulário comprido
  useEffect(() => {
    if (estado.erro || local) refForm.current?.querySelector('[role=alert]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [estado, local])

  const erroEm = (campo: Campo | null) =>
    erro && erro.campo === campo ? (
      <p id={`${uid}-erro`} role='alert' className='flex items-start gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700'>
        <AlertTriangle aria-hidden className='mt-px size-3.5 shrink-0' /> {erro.erro}
      </p>
    ) : null
  const invalido = (campo: Campo) => (erro?.campo === campo ? { 'aria-invalid': true, 'aria-describedby': `${uid}-erro` } : {})

  if (estado.ok && estado.senha) {
    const copiar = () =>
      navigator.clipboard
        .writeText(estado.senha!)
        .then(() => toast.success('Copiada.'))
        .catch(() => toast.error('Não deu para copiar: selecione a senha e copie à mão.'))
    return (
      <div role='status' className='space-y-3 rounded-2xl border border-ouro/60 bg-white p-5 ring-1 ring-ouro/30'>
        <p className='font-semibold text-marca-800'>{estado.mensagem}</p>
        <p className='text-sm text-slate-600'>Senha provisória (copie agora — ela não aparece de novo):</p>
        <div className='flex flex-wrap items-center gap-2'>
          <code className='break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-base text-slate-800'>{estado.senha}</code>
          <button type='button' onClick={copiar} className={cn('inline-flex h-9 items-center gap-1.5 rounded-lg border border-marca-300 bg-white px-3 text-xs font-semibold text-marca-800 hover:bg-marca-50', FOCO)}>
            <Copy aria-hidden className='size-3.5' /> Copiar
          </button>
        </div>
        <button type='button' onClick={recomecar} className={cn('rounded text-xs font-semibold text-marca-700 underline', FOCO)}>
          Cadastrar outro
        </button>
      </div>
    )
  }

  // as mesmas regras do servidor, conferidas antes de enviar (o servidor confere de novo)
  const conferir = (): Erro | null => {
    if (papel === 'equipe' && !selRamos?.length)
      return { campo: 'ramos', erro: 'Escolha pelo menos um ramo: sem ramo, a pessoa não vê nenhum contato nos Disparos.' }
    if (papel === 'cliente' && !temConsulta && !selGrupos?.length)
      return { campo: 'produto', erro: 'Escolha pelo menos um produto para o cliente: Consulta de dados ou um grupo de Disparos.' }
    if (papel === 'cliente' && temConsulta && !selRamos?.length) return { campo: 'plano_ramos', erro: 'Escolha pelo menos um ramo para o cliente.' }
    return null
  }

  // envio sem o "reset" automático do React 19: se o servidor recusar, o que foi digitado continua nos campos
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const barrado = conferir()
    setLocal(barrado)
    if (barrado) return
    const fd = new FormData(e.currentTarget)
    startTransition(() => acao(fd))
  }
  const mudouSelecao = <T,>(f: (v: T) => void) => (v: T) => {
    setLocal(null)
    f(v)
  }
  const validadePassou = !!hoje && !!validade && validade < hoje

  return (
    <form ref={refForm} onSubmit={enviar} className='space-y-4'>
      {usuario && <input type='hidden' name='user_id' value={usuario.user_id} />}
      <input type='hidden' name='papel' value={papel} />
      {(papel === 'equipe' || papel === 'cliente') && (selRamos ?? []).map(r => <input key={r} type='hidden' name='ramos' value={r} />)}
      {papel === 'cliente' && (selUfs ?? []).map(u => <input key={u} type='hidden' name='ufs' value={u} />)}
      {papel === 'cliente' && <input type='hidden' name='modalidade' value={modalidade} />}
      {papel === 'cliente' && temConsulta && <input type='hidden' name='tem_consulta' value='on' />}
      {papel !== 'admin' && (selGrupos ?? []).map(g => <input key={g} type='hidden' name='grupos' value={g} />)}

      <div className='grid gap-3 sm:grid-cols-2'>
        <div className='space-y-1'>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>Nome</span>
            <input name='nome' defaultValue={usuario?.nome ?? ''} required maxLength={120} autoComplete='off' className={ENTRADA} {...invalido('nome')} />
          </label>
          {erroEm('nome')}
        </div>
        <div className='space-y-1'>
          <label className='block space-y-1'>
            <span className='text-xs font-semibold text-slate-600'>E-mail (login)</span>
            <input
              name='email'
              type='email'
              defaultValue={usuario?.email}
              required={novo}
              disabled={!novo}
              autoComplete='off'
              className={cn(ENTRADA, !novo && 'bg-slate-50 text-slate-500')}
              {...invalido('email')}
            />
          </label>
          {erroEm('email')}
        </div>
        {novo && (
          <div className='space-y-1 sm:col-span-2'>
            <label htmlFor={`${uid}-senha`} className='block text-xs font-semibold text-slate-600'>
              Senha (opcional — em branco, a plataforma gera uma provisória)
            </label>
            <div className='relative'>
              <input
                id={`${uid}-senha`}
                name='senha'
                type={verSenha ? 'text' : 'password'}
                minLength={8}
                maxLength={72}
                autoComplete='new-password'
                spellCheck={false}
                className={cn(ENTRADA, 'pr-11')}
                {...invalido('senha')}
              />
              <button
                type='button'
                onClick={() => setVerSenha(v => !v)}
                aria-pressed={verSenha}
                aria-controls={`${uid}-senha`}
                aria-label='Mostrar senha'
                title={verSenha ? 'Esconder senha' : 'Mostrar senha'}
                className={cn(
                  'absolute inset-y-1 right-1 grid w-9 place-items-center rounded-lg',
                  verSenha ? 'bg-marca-100 text-marca-800' : 'text-slate-500 hover:bg-slate-100',
                  FOCO,
                  'focus-visible:ring-offset-0'
                )}
              >
                <Eye aria-hidden className='size-4' />
              </button>
            </div>
            {erroEm('senha')}
          </div>
        )}
      </div>

      <div className='space-y-1.5'>
        <p id={`${uid}-papel`} className='text-xs font-semibold text-slate-600'>
          Papel
        </p>
        <div role='group' aria-labelledby={`${uid}-papel`} className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
          {PAPEIS.map(p => (
            <button
              key={p.valor}
              type='button'
              aria-pressed={papel === p.valor}
              onClick={() => {
                setLocal(null)
                setPapel(p.valor)
              }}
              className={cn(
                'rounded-xl border px-3 py-2 text-left transition',
                FOCO,
                papel === p.valor ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100' : 'border-slate-200 bg-white hover:border-marca-300'
              )}
            >
              <span className='block text-sm font-semibold text-slate-800'>{p.titulo}</span>
              <span className='block text-[11px] leading-snug text-slate-500'>{p.nota}</span>
            </button>
          ))}
        </div>
        {erroEm('papel')}
      </div>

      {papel === 'equipe' && (
        <div className='space-y-1.5 rounded-xl bg-slate-50 p-3'>
          <MultiSelect
            rotulo='Ramos que esta pessoa responde nos disparos (pelo menos um)'
            opcoes={ramos}
            selecionados={selRamos}
            aoMudar={mudouSelecao(setSelRamos)}
            mostrarCodigo
            placeholder='Nenhum ainda'
          />
          <p className='text-[11px] text-slate-500'>Ela só vê, no painel de disparos, os contatos desses ramos.</p>
          {erroEm('ramos')}
        </div>
      )}

      {papel !== 'admin' && (
        <div className='space-y-1.5 rounded-xl bg-slate-50 p-3'>
          <MultiSelect rotulo='Grupos de que faz parte' opcoes={grupos} selecionados={selGrupos} aoMudar={mudouSelecao(setSelGrupos)} placeholder='Nenhum' />
          <p className='text-[11px] text-slate-500'>
            Vê o calendário desses grupos (as reuniões de todos do grupo).
            {papel === 'cliente' ? ' Como cliente, também entra em “Meus disparos” e vê o painel, as conversas e os leads deles.' : ''}
          </p>
          {erroEm('grupos')}
        </div>
      )}

      {papel === 'cliente' && (
        <div className='space-y-1.5'>
          <label className='flex items-center gap-2 text-sm font-semibold text-slate-700'>
            <input
              type='checkbox'
              checked={temConsulta}
              onChange={e => {
                setLocal(null)
                setTemConsulta(e.target.checked)
              }}
              className='size-4 accent-[#1a2d5a]'
              {...invalido('produto')}
            />{' '}
            Produto “Consulta de dados”
          </label>
          {erroEm('produto')}
        </div>
      )}

      {papel === 'cliente' && temConsulta && (
        <div className='space-y-3 rounded-xl bg-slate-50 p-3'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Plano do cliente</p>
          <div className='space-y-1.5'>
            <MultiSelect rotulo='Ramos contratados (pelo menos um)' opcoes={ramos} selecionados={selRamos} aoMudar={mudouSelecao(setSelRamos)} mostrarCodigo placeholder='Escolha' />
            {erroEm('plano_ramos')}
          </div>
          <MultiSelect rotulo='Estados (vazio = todos da base)' opcoes={ufs} selecionados={selUfs} aoMudar={setSelUfs} placeholder='Todos' />
          <div role='group' aria-label='Modalidade do plano' className='grid gap-2 sm:grid-cols-2'>
            {(
              [
                ['mensal', 'Por mês', 'Uma cota que renova todo dia 1º'],
                ['pacote', 'Por pacote (leva de compra)', 'Saldo que soma cada compra']
              ] as const
            ).map(([v, t, n]) => (
              <button
                key={v}
                type='button'
                aria-pressed={modalidade === v}
                onClick={() => setModalidade(v)}
                className={cn('rounded-xl border px-3 py-2 text-left', FOCO, modalidade === v ? 'border-marca-700 bg-white ring-2 ring-marca-100' : 'border-slate-200 bg-white/60')}
              >
                <span className='block text-sm font-semibold text-slate-800'>{t}</span>
                <span className='block text-[11px] text-slate-500'>{n}</span>
              </button>
            ))}
          </div>
          <div className='grid gap-3 sm:grid-cols-3'>
            {modalidade === 'mensal' ? (
              <div className='space-y-1'>
                <label className='block space-y-1'>
                  <span className='text-xs font-semibold text-slate-600'>Empresas por mês</span>
                  <input name='cota_mensal' type='number' min={1} defaultValue={usuario?.plano?.cota_mensal ?? 100} required className={ENTRADA} {...invalido('cota')} />
                </label>
                {erroEm('cota')}
              </div>
            ) : novo ? (
              <div className='space-y-1'>
                <label className='block space-y-1'>
                  <span className='text-xs font-semibold text-slate-600'>Pacote inicial (empresas)</span>
                  <input name='pacote_inicial' type='number' min={1} defaultValue={500} className={ENTRADA} {...invalido('pacote')} />
                </label>
                {erroEm('pacote')}
              </div>
            ) : (
              <p className='self-end text-xs text-slate-500'>Novas levas: no quadro “Pacotes (levas de compra)”.</p>
            )}
            <div className='space-y-1'>
              <label className='block space-y-1'>
                <span className='text-xs font-semibold text-slate-600'>Válido até (opcional)</span>
                <input name='validade' type='date' defaultValue={usuario?.plano?.validade ?? ''} onChange={e => setValidade(e.target.value)} className={ENTRADA} {...invalido('validade')} />
              </label>
              {validadePassou && erro?.campo !== 'validade' && (
                <p className='flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900'>
                  <AlertTriangle aria-hidden className='mt-px size-3.5 shrink-0' /> Essa data já passou: com ela, o cliente fica sem acesso.
                </p>
              )}
              {erroEm('validade')}
            </div>
            <div className='space-y-1'>
              <label className='block space-y-1'>
                <span className='text-xs font-semibold text-slate-600'>Observação</span>
                <input name='observacao' defaultValue={usuario?.plano?.observacao ?? ''} maxLength={500} className={ENTRADA} placeholder='contrato, valor…' {...invalido('observacao')} />
              </label>
              {erroEm('observacao')}
            </div>
          </div>
        </div>
      )}

      {!novo && (
        <div className='space-y-1.5'>
          <label className='flex items-center gap-2 text-sm text-slate-700'>
            <input type='checkbox' name='ativo' defaultChecked={usuario?.ativo} className='size-4 accent-[#1a2d5a]' {...invalido('ativo')} /> Acesso ativo
          </label>
          {erroEm('ativo')}
        </div>
      )}
      {novo && <input type='hidden' name='ativo' value='on' />}

      {erroEm(null)}
      <button
        type='submit'
        disabled={salvando}
        className={cn('inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60', FOCO)}
      >
        {salvando ? <LoaderCircle className='size-4 animate-spin' /> : novo ? <UserPlus aria-hidden className='size-4' /> : <Save aria-hidden className='size-4' />}
        {novo ? 'Criar usuário' : 'Salvar'}
      </button>
    </form>
  )
}
