'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Building2, CheckCircle2, LoaderCircle, Mail, Phone, User } from 'lucide-react'

// Campos no estilo do formulário de contato do site (ícone à esquerda, cantos xl, borda marinho suave).
const CAMPO =
  'campo-oc w-full rounded-xl border border-oc-700/15 bg-white py-3.5 pl-11 pr-4 text-[15px] text-oc-700 shadow-sm shadow-oc-700/[0.03] outline-none transition placeholder:text-oc-700/35 focus:border-oc-700/45 focus:ring-4 focus:ring-oc-700/[0.07]'

type Dados = { nome: string; empresa: string; email: string; whatsapp: string }

/** Máscara simples: (11) 98231-8575 */
function mascara(v: string) {
  const d = v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '').slice(0, 11)
  if (d.length <= 2) return d
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function FormularioConsulta({ token, inicial, jaEnviado }: { token: string; inicial: Dados; jaEnviado: boolean }) {
  const [dados, setDados] = useState<Dados>(inicial)
  const [consentimento, setConsentimento] = useState(jaEnviado)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const avisou = useRef(false)

  // Conta a abertura do link pelo navegador (robô de pré-visualização não roda JavaScript).
  useEffect(() => {
    if (avisou.current) return
    avisou.current = true
    fetch('/api/publico/consulta-gratuita', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ acao: 'abrir', token })
    }).catch(() => {})
  }, [token])

  const campo = (k: keyof Dados) => ({
    value: dados[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setDados(d => ({ ...d, [k]: k === 'whatsapp' ? mascara(e.target.value) : e.target.value }))
  })

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const r = await fetch('/api/publico/consulta-gratuita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'enviar', token, ...dados, consentimento })
      })
      const j = (await r.json().catch(() => ({}))) as { erro?: string }
      if (!r.ok) throw new Error(j.erro ?? 'Não foi possível enviar agora.')
      setEnviado(true)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível enviar agora.')
    } finally {
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div className='rounded-2xl border border-emerald-700/15 bg-white px-6 py-10 text-center'>
        <CheckCircle2 className='mx-auto size-12 text-emerald-600' strokeWidth={1.5} />
        <h3 className='mt-4 font-serif text-2xl font-bold text-oc-700'>Recebemos seus dados!</h3>
        <p className='mx-auto mt-2 max-w-sm text-sm leading-relaxed text-oc-700/70'>
          Um especialista da OficialCert vai analisar a sua empresa e falar com você em breve pelo WhatsApp ou e-mail.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={enviar} className='space-y-4'>
      {jaEnviado && (
        <p className='rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800'>
          Já recebemos seus dados. Se precisar corrigir algo, é só alterar e enviar de novo.
        </p>
      )}
      <div className='grid gap-4 sm:grid-cols-2'>
        <label className='relative block'>
          <span className='sr-only'>Seu nome completo</span>
          <User className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input {...campo('nome')} required minLength={3} maxLength={120} autoComplete='name' placeholder='Seu nome completo' className={CAMPO} />
        </label>
        <label className='relative block'>
          <span className='sr-only'>Empresa</span>
          <Building2 className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input {...campo('empresa')} required minLength={2} maxLength={160} autoComplete='organization' placeholder='Empresa' className={CAMPO} />
        </label>
        <label className='relative block'>
          <span className='sr-only'>E-mail corporativo</span>
          <Mail className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input {...campo('email')} type='email' required maxLength={160} autoComplete='email' placeholder='E-mail corporativo' className={CAMPO} />
        </label>
        <label className='relative block'>
          <span className='sr-only'>WhatsApp</span>
          <Phone className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
          <input {...campo('whatsapp')} type='tel' inputMode='tel' required autoComplete='tel' placeholder='WhatsApp' className={CAMPO} />
        </label>
      </div>

      <label className='flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1 text-[13px] leading-relaxed text-oc-700/70'>
        <input
          type='checkbox'
          checked={consentimento}
          onChange={e => setConsentimento(e.target.checked)}
          required
          className='mt-0.5 size-4 shrink-0 accent-[#1a2d5a]'
        />
        Autorizo a OficialCert a usar estes dados para fazer a consulta e entrar em contato comigo sobre ela.
      </label>

      {erro && <p className='rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700'>{erro}</p>}

      <button
        type='submit'
        disabled={enviando}
        className='group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-oc-700 px-6 text-sm font-bold uppercase tracking-[0.08em] text-creme shadow-lg shadow-oc-900/20 transition hover:bg-oc-900 disabled:opacity-70 sm:w-auto'
      >
        {enviando ? <LoaderCircle className='size-4 animate-spin' /> : null}
        {jaEnviado ? 'Atualizar meus dados' : 'Quero minha consulta gratuita'}
        {!enviando && <ArrowUpRight className='size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5' />}
      </button>
    </form>
  )
}
