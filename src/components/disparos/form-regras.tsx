'use client'

import { startTransition, useActionState, useEffect } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { salvarRegras, type Retorno } from '@/app/dashboard/disparos/actions'
import { DIAS_SEMANA, type ConfigDisparo } from '@/lib/disparos/tipos'

export function FormRegras({ cfg }: { cfg: ConfigDisparo }) {
  const [estado, acao, salvando] = useActionState<Retorno, FormData>(salvarRegras, {})
  useEffect(() => {
    if (estado.ok) toast.success(estado.mensagem ?? 'Salvo.')
    if (estado.erro) toast.error(estado.erro)
  }, [estado])

  const horas = Array.from({ length: 25 }, (_, h) => h)
  const select = 'h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm outline-none focus:border-marca-400'
  return (
    // onSubmit em vez de `action`: o React 19 voltaria horário e dias ao valor antigo se o servidor recusar
    <form
      onSubmit={e => {
        e.preventDefault()
        if (salvando) return
        const fd = new FormData(e.currentTarget)
        startTransition(() => acao(fd))
      }}
      aria-busy={salvando}
      className='space-y-3'
    >
      <div className='flex flex-wrap items-center gap-2 text-sm text-slate-700'>
        Enviar das
        <select name='hora_inicio' defaultValue={cfg.hora_inicio} aria-label='Hora de início' className={select}>
          {horas.slice(0, 24).map(h => (
            <option key={h} value={h}>
              {h}h
            </option>
          ))}
        </select>
        às
        <select name='hora_fim' defaultValue={cfg.hora_fim} aria-label='Hora de término' className={select}>
          {horas.slice(1).map(h => (
            <option key={h} value={h}>
              {h}h
            </option>
          ))}
        </select>
        <span className='text-xs text-slate-500'>(horário de Brasília)</span>
      </div>
      <div className='flex flex-wrap gap-1.5' role='group' aria-label='Dias de envio'>
        {DIAS_SEMANA.map(d => (
          <label key={d.n} className='cursor-pointer'>
            <input type='checkbox' name='dias_semana' value={d.n} defaultChecked={cfg.dias_semana.includes(d.n)} className='peer sr-only' />
            <span className='inline-flex h-8 items-center rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-500 transition peer-checked:border-marca-800 peer-checked:bg-marca-800 peer-checked:text-creme peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-oc-brilho'>
              {d.curto}
            </span>
          </label>
        ))}
      </div>
      <button type='submit' disabled={salvando} className='inline-flex h-9 items-center gap-2 rounded-lg bg-marca-800 px-4 text-sm font-semibold text-creme hover:bg-marca-950 disabled:opacity-60'>
        {salvando ? <LoaderCircle className='size-4 animate-spin' aria-hidden /> : <Save className='size-4' aria-hidden />} Salvar regras
      </button>
    </form>
  )
}
