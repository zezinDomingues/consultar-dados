'use client'

import { useActionState, useEffect, useState } from 'react'
import { LoaderCircle, Plus, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import { salvarNumero, type Retorno } from '@/app/dashboard/disparos/actions'
import type { Numero } from '@/lib/disparos/tipos'
import { cn } from '@/lib/utils'

const ENTRADA = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-marca-400 focus:ring-4 focus:ring-marca-50'

/** Cadastro/edição de um número (sessão do WAHA). A API key nunca volta para a tela: em branco = mantém. */
export function FormNumero({ numero, rotuloBotao }: { numero?: Numero; rotuloBotao?: string }) {
  const [aberto, setAberto] = useState(false)
  const [provedor, setProvedor] = useState<'waha' | 'zapi'>(numero?.provedor ?? 'zapi')
  const z = provedor === 'zapi'
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(salvarNumero, {})

  useEffect(() => {
    if (estado.ok) {
      toast.success(estado.mensagem ?? 'Salvo.')
      setAberto(false)
    }
  }, [estado])

  if (!aberto) {
    return numero ? (
      <button type='button' onClick={() => setAberto(true)} className='inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-marca-300'>
        {rotuloBotao ?? 'Editar'}
      </button>
    ) : (
      <button
        type='button'
        onClick={() => setAberto(true)}
        className='inline-flex h-10 items-center gap-2 rounded-full bg-marca-800 px-5 text-sm font-bold text-creme shadow-md shadow-marca-900/15 hover:bg-marca-950'
      >
        <Plus className='size-4' /> Adicionar número
      </button>
    )
  }

  return (
    <form action={acao} className={cn('w-full space-y-3 rounded-2xl border border-marca-200 bg-marca-50/40 p-4', numero && 'mt-3')}>
      {numero && <input type='hidden' name='id' value={numero.id} />}
      <input type='hidden' name='provedor' value={provedor} />
      <div className='grid grid-cols-2 gap-2'>
        {(
          [
            ['zapi', 'Z-API', 'Mostra botões no celular'],
            ['waha', 'WAHA', 'Só texto e imagem (botões não aparecem)']
          ] as const
        ).map(([v, t, nota]) => (
          <button
            key={v}
            type='button'
            onClick={() => setProvedor(v)}
            className={cn(
              'rounded-xl border px-3 py-2 text-left',
              provedor === v ? 'border-marca-700 bg-white ring-2 ring-marca-100' : 'border-slate-200 bg-white/60 hover:border-marca-300'
            )}
          >
            <span className='block text-sm font-semibold text-slate-800'>{t}</span>
            <span className='block text-[11px] text-slate-500'>{nota}</span>
          </button>
        ))}
      </div>
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-4'>
        <Campo rotulo='Nome' dica='ex.: OficialCert 01'>
          <input name='rotulo' defaultValue={numero?.rotulo} required maxLength={60} className={ENTRADA} />
        </Campo>
        {z ? (
          <>
            <input type='hidden' name='waha_url' value='https://api.z-api.io' />
            <Campo rotulo='ID da instância' dica='painel da Z-API → Instâncias' largo>
              <input name='waha_sessao' defaultValue={numero?.provedor === 'zapi' ? numero.waha_sessao : ''} required autoComplete='off' className={ENTRADA} />
            </Campo>
            <Campo rotulo='Token da instância' dica={numero ? 'em branco = mantém o atual' : 'ao lado do ID, na instância'}>
              <input name='waha_api_key' type='password' autoComplete='off' required={!numero} className={ENTRADA} />
            </Campo>
            <Campo rotulo='Client-Token' dica={numero ? 'em branco = mantém o atual' : 'Segurança → token da conta'} largo>
              <input name='client_token' type='password' autoComplete='off' required={!numero} className={ENTRADA} />
            </Campo>
          </>
        ) : (
          <>
            <Campo rotulo='URL do WAHA' dica='HTTPS público (a Vercel precisa alcançar)' largo>
              <input name='waha_url' defaultValue={numero?.provedor === 'waha' ? numero.waha_url : ''} required placeholder='https://waha3.mindloop.com.br' className={ENTRADA} />
            </Campo>
            <Campo rotulo='Sessão' dica='no CORE é sempre default'>
              <input name='waha_sessao' defaultValue={numero?.provedor === 'waha' ? numero.waha_sessao : 'default'} required className={ENTRADA} />
            </Campo>
            <Campo rotulo='API key do WAHA' dica={numero ? 'em branco = mantém a atual' : 'X-Api-Key da instância'} largo>
              <input name='waha_api_key' type='password' autoComplete='off' required={!numero} className={ENTRADA} />
            </Campo>
          </>
        )}
        <Campo rotulo='Limite por dia' dica='número novo: 20–30, aumente aos poucos'>
          <input name='limite_diario' type='number' min={1} max={2000} defaultValue={numero?.limite_diario ?? 30} required className={ENTRADA} />
        </Campo>
        <Campo rotulo='Intervalo (segundos)' dica='sorteado entre mín. e máx.'>
          <div className='flex items-center gap-1.5'>
            <input name='intervalo_min_s' type='number' min={20} defaultValue={numero?.intervalo_min_s ?? 120} required className={ENTRADA} />
            <span className='text-slate-400'>–</span>
            <input name='intervalo_max_s' type='number' min={20} defaultValue={numero?.intervalo_max_s ?? 300} required className={ENTRADA} />
          </div>
        </Campo>
      </div>
      <label className='flex items-center gap-2 text-sm text-slate-700'>
        <input type='checkbox' name='ativo' defaultChecked={numero?.ativo ?? true} className='size-4 accent-[#1a2d5a]' /> Ativo (participa do envio)
      </label>
      {estado.erro && <p className='rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700'>{estado.erro}</p>}
      <div className='flex gap-2'>
        <button type='submit' disabled={salvando} className='inline-flex h-9 items-center gap-2 rounded-lg bg-marca-800 px-4 text-sm font-semibold text-creme hover:bg-marca-950 disabled:opacity-60'>
          {salvando ? <LoaderCircle className='size-4 animate-spin' /> : <Save className='size-4' />} Salvar e testar
        </button>
        <button type='button' onClick={() => setAberto(false)} className='inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-slate-500 hover:text-slate-800'>
          <X className='size-4' /> Cancelar
        </button>
      </div>
    </form>
  )
}

function Campo({ rotulo, dica, largo, children }: { rotulo: string; dica?: string; largo?: boolean; children: React.ReactNode }) {
  return (
    <label className={cn('block space-y-1', largo && 'lg:col-span-2')}>
      <span className='text-xs font-semibold text-slate-600'>{rotulo}</span>
      {children}
      {dica && <span className='block text-[11px] text-slate-400'>{dica}</span>}
    </label>
  )
}
