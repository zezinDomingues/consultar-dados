'use client'

import { useActionState, useEffect, useState } from 'react'
import { Copy, LoaderCircle, Save, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { atualizarUsuario, criarUsuario, type Retorno } from '@/app/dashboard/usuarios/actions'
import { MultiSelect } from '@/components/consulta/multi-select'
import type { Opcao } from '@/lib/empresas/tipos'
import type { Usuario } from '@/lib/usuarios/dados'
import { PAPEIS } from '@/lib/usuarios/papeis'
import { cn } from '@/lib/utils'

const ENTRADA = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'


export function FormUsuario({ usuario, ramos, ufs, grupos }: { usuario?: Usuario; ramos: Opcao[]; ufs: Opcao[]; grupos: Opcao[] }) {
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

  useEffect(() => {
    if (estado.ok && !estado.senha) toast.success(estado.mensagem ?? 'Salvo.')
  }, [estado])

  if (estado.ok && estado.senha) {
    return (
      <div className='space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5'>
        <p className='font-semibold text-emerald-900'>{estado.mensagem}</p>
        <p className='text-sm text-emerald-900'>Senha provisória (copie agora — ela não aparece de novo):</p>
        <div className='flex items-center gap-2'>
          <code className='rounded-lg bg-white px-3 py-2 font-mono text-base text-slate-800'>{estado.senha}</code>
          <button
            type='button'
            onClick={() => navigator.clipboard.writeText(estado.senha!).then(() => toast.success('Copiada.'))}
            className='inline-flex h-9 items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800'
          >
            <Copy className='size-3.5' /> Copiar
          </button>
        </div>
        <button type='button' onClick={() => window.location.reload()} className='text-xs font-semibold text-emerald-800 underline'>
          Cadastrar outro
        </button>
      </div>
    )
  }

  return (
    <form action={acao} className='space-y-4'>
      {usuario && <input type='hidden' name='user_id' value={usuario.user_id} />}
      <input type='hidden' name='papel' value={papel} />
      {(papel === 'equipe' || papel === 'cliente') && (selRamos ?? []).map(r => <input key={r} type='hidden' name='ramos' value={r} />)}
      {papel === 'cliente' && (selUfs ?? []).map(u => <input key={u} type='hidden' name='ufs' value={u} />)}
      {papel === 'cliente' && <input type='hidden' name='modalidade' value={modalidade} />}
      {papel === 'cliente' && temConsulta && <input type='hidden' name='tem_consulta' value='on' />}
      {papel === 'cliente' && (selGrupos ?? []).map(g => <input key={g} type='hidden' name='grupos' value={g} />)}

      <div className='grid gap-3 sm:grid-cols-2'>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>Nome</span>
          <input name='nome' defaultValue={usuario?.nome ?? ''} required maxLength={120} className={ENTRADA} />
        </label>
        <label className='block space-y-1'>
          <span className='text-xs font-semibold text-slate-600'>E-mail (login)</span>
          <input name='email' type='email' defaultValue={usuario?.email} required={novo} disabled={!novo} className={cn(ENTRADA, !novo && 'bg-slate-50 text-slate-500')} />
        </label>
        {novo && (
          <label className='block space-y-1 sm:col-span-2'>
            <span className='text-xs font-semibold text-slate-600'>Senha (opcional — em branco, a plataforma gera uma provisória)</span>
            <input name='senha' type='text' minLength={8} maxLength={72} autoComplete='new-password' className={ENTRADA} />
          </label>
        )}
      </div>

      <div className='grid gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        {PAPEIS.map(p => (
          <button
            key={p.valor}
            type='button'
            onClick={() => setPapel(p.valor)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left transition',
              papel === p.valor ? 'border-marca-700 bg-marca-50 ring-2 ring-marca-100' : 'border-slate-200 bg-white hover:border-marca-300'
            )}
          >
            <span className='block text-sm font-semibold text-slate-800'>{p.titulo}</span>
            <span className='block text-[11px] leading-snug text-slate-500'>{p.nota}</span>
          </button>
        ))}
      </div>

      {papel === 'equipe' && (
        <div className='space-y-1.5 rounded-xl bg-slate-50 p-3'>
          <MultiSelect rotulo='Ramos que esta pessoa responde nos disparos' opcoes={ramos} selecionados={selRamos} aoMudar={setSelRamos} mostrarCodigo placeholder='Nenhum ainda' />
          <p className='text-[11px] text-slate-400'>Ela só vê, no painel de disparos, os contatos desses ramos.</p>
        </div>
      )}

      {papel === 'cliente' && (
        <div className='space-y-1.5 rounded-xl bg-slate-50 p-3'>
          <MultiSelect rotulo='Disparos: grupos que este cliente acompanha' opcoes={grupos} selecionados={selGrupos} aoMudar={setSelGrupos} placeholder='Nenhum' />
          <p className='text-[11px] text-slate-400'>Ele entra em “Meus disparos” e vê só o painel, as conversas e os leads desses grupos.</p>
        </div>
      )}

      {papel === 'cliente' && (
        <label className='flex items-center gap-2 text-sm font-semibold text-slate-700'>
          <input type='checkbox' checked={temConsulta} onChange={e => setTemConsulta(e.target.checked)} className='size-4 accent-[#1a2d5a]' /> Produto “Consulta de dados”
        </label>
      )}

      {papel === 'cliente' && temConsulta && (
        <div className='space-y-3 rounded-xl bg-slate-50 p-3'>
          <p className='text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>Plano do cliente</p>
          <MultiSelect rotulo='Ramos contratados' opcoes={ramos} selecionados={selRamos} aoMudar={setSelRamos} mostrarCodigo placeholder='Escolha' />
          <MultiSelect rotulo='Estados (vazio = todos da base)' opcoes={ufs} selecionados={selUfs} aoMudar={setSelUfs} placeholder='Todos' />
          <div className='grid grid-cols-2 gap-2'>
            {(
              [
                ['mensal', 'Por mês', 'Uma cota que renova todo dia 1º'],
                ['pacote', 'Por pacote (leva de compra)', 'Saldo que soma cada compra']
              ] as const
            ).map(([v, t, n]) => (
              <button
                key={v}
                type='button'
                onClick={() => setModalidade(v)}
                className={cn('rounded-xl border px-3 py-2 text-left', modalidade === v ? 'border-marca-700 bg-white ring-2 ring-marca-100' : 'border-slate-200 bg-white/60')}
              >
                <span className='block text-sm font-semibold text-slate-800'>{t}</span>
                <span className='block text-[11px] text-slate-500'>{n}</span>
              </button>
            ))}
          </div>
          <div className='grid gap-3 sm:grid-cols-3'>
            {modalidade === 'mensal' ? (
              <label className='block space-y-1'>
                <span className='text-xs font-semibold text-slate-600'>Empresas por mês</span>
                <input name='cota_mensal' type='number' min={1} defaultValue={usuario?.plano?.cota_mensal ?? 100} required className={ENTRADA} />
              </label>
            ) : novo ? (
              <label className='block space-y-1'>
                <span className='text-xs font-semibold text-slate-600'>Pacote inicial (empresas)</span>
                <input name='pacote_inicial' type='number' min={1} defaultValue={500} className={ENTRADA} />
              </label>
            ) : (
              <p className='self-end text-xs text-slate-500'>Novas levas: em “Pacotes” abaixo.</p>
            )}
            <label className='block space-y-1'>
              <span className='text-xs font-semibold text-slate-600'>Válido até (opcional)</span>
              <input name='validade' type='date' defaultValue={usuario?.plano?.validade ?? ''} className={ENTRADA} />
            </label>
            <label className='block space-y-1'>
              <span className='text-xs font-semibold text-slate-600'>Observação</span>
              <input name='observacao' defaultValue={usuario?.plano?.observacao ?? ''} maxLength={500} className={ENTRADA} placeholder='contrato, valor…' />
            </label>
          </div>
        </div>
      )}

      {!novo && (
        <label className='flex items-center gap-2 text-sm text-slate-700'>
          <input type='checkbox' name='ativo' defaultChecked={usuario?.ativo} className='size-4 accent-[#1a2d5a]' /> Acesso ativo
        </label>
      )}
      {novo && <input type='hidden' name='ativo' value='on' />}

      {estado.erro && <p className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'>{estado.erro}</p>}
      <button type='submit' disabled={salvando} className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme hover:bg-marca-950 disabled:opacity-60'>
        {salvando ? <LoaderCircle className='size-4 animate-spin' /> : novo ? <UserPlus className='size-4' /> : <Save className='size-4' />}
        {novo ? 'Criar usuário' : 'Salvar'}
      </button>
    </form>
  )
}
