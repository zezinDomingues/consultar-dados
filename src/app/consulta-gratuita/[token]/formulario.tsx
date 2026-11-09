'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, BadgeCheck, Building2, LoaderCircle, Mail, Phone, User, type LucideIcon } from 'lucide-react'
import { comecaComFormula, EMAIL, foneBR, limparTexto, mascaraFone, nomeValido } from '@/lib/validar-contato'

// Campos no estilo do formulário de contato do site (ícone à esquerda, cantos xl, borda marinho suave).
const CAMPO =
  'campo-oc w-full rounded-xl border border-oc-700/15 bg-white py-3.5 pl-11 pr-4 text-[15px] text-oc-700 shadow-sm shadow-oc-700/[0.03] outline-none transition placeholder:text-oc-700/35 focus:border-oc-700/45 focus:ring-4 focus:ring-oc-700/[0.07] aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/10'

type Dados = { nome: string; empresa: string; email: string; whatsapp: string }
type Erros = Partial<Record<keyof Dados, string>>

/** Máscara simples: (11) 98231-8575 */
function mascara(v: string) {
  return mascaraFone(v.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))
}

/** Mesmas regras da API (/api/publico/consulta-gratuita) + o que ela ainda não barra (fórmula, DDD que não existe). */
function validar(d: Dados): Erros {
  const e: Erros = {}
  const nome = limparTexto(d.nome)
  const empresa = limparTexto(d.empresa)
  const email = limparTexto(d.email)
  if (nome.length < 3) e.nome = 'Informe seu nome completo.'
  else if (!nomeValido(nome)) e.nome = 'Digite um nome válido (sem = + - @ no começo).'
  if (empresa.length < 2) e.empresa = 'Informe a empresa.'
  else if (comecaComFormula(empresa)) e.empresa = 'O nome da empresa não pode começar com = + - @.'
  if (!email) e.email = 'Informe seu e-mail.'
  else if (!EMAIL.test(email) || comecaComFormula(email)) e.email = 'E-mail inválido. Exemplo: nome@empresa.com.br'
  if (!d.whatsapp.trim()) e.whatsapp = 'Informe seu WhatsApp.'
  else if (!foneBR(d.whatsapp)) e.whatsapp = 'WhatsApp inválido: use DDD + número.'
  return e
}

function Campo({
  id,
  icone: Icone,
  rotulo,
  erro,
  ...input
}: { id: string; icone: LucideIcon; rotulo: string; erro?: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className='sr-only'>
        {rotulo}
      </label>
      <span className='relative block'>
        <Icone className='pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-oc-700/40' />
        <input
          id={id}
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? `${id}-erro` : undefined}
          placeholder={rotulo}
          className={CAMPO}
          {...input}
        />
      </span>
      {erro && (
        <p id={`${id}-erro`} className='mt-1.5 px-1 text-[13px] font-medium text-red-700'>
          {erro}
        </p>
      )}
    </div>
  )
}

export function FormularioConsulta({ token, inicial, jaEnviado }: { token: string; inicial: Dados; jaEnviado: boolean }) {
  // o servidor pode mandar "—" quando não há telefone: o campo começa vazio, não com um traço inválido
  const [dados, setDados] = useState<Dados>(() => ({ ...inicial, whatsapp: mascara(inicial.whatsapp) }))
  const [consentimento, setConsentimento] = useState(jaEnviado)
  const [enviando, setEnviando] = useState(false)
  const [erros, setErros] = useState<Erros>({})
  const [aviso, setAviso] = useState<{ tipo: 'erro' | 'atencao'; texto: string } | null>(null)
  const [enviado, setEnviado] = useState(false)
  // a mensagem de erro só aparece ao sair do campo depois da 1ª tentativa de envio: antes disso, ela empurraria o
  // botão para baixo no instante do clique (mousedown) e o clique cairia fora dele
  const [tentou, setTentou] = useState(false)
  const avisou = useRef(false)
  const emAndamento = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

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
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = k === 'whatsapp' ? mascara(e.target.value) : e.target.value
      setDados(d => ({ ...d, [k]: v }))
      // o erro do campo some assim que o valor fica certo
      if (erros[k] && !validar({ ...dados, [k]: v })[k]) setErros(x => ({ ...x, [k]: undefined }))
    },
    onBlur: () => {
      if (!tentou || !dados[k].trim()) return
      const msg = validar(dados)[k]
      setErros(x => ({ ...x, [k]: msg }))
    }
  })

  async function enviar(e: React.FormEvent) {
    e.preventDefault()
    if (emAndamento.current) return // clique duplo / Enter repetido antes de a tela travar o botão
    setAviso(null)
    setTentou(true)
    const problemas = validar(dados)
    setErros(problemas)
    const primeiro = (Object.keys(problemas) as (keyof Dados)[]).find(k => problemas[k])
    if (primeiro) {
      formRef.current?.querySelector<HTMLInputElement>(`#cg-${primeiro}`)?.focus()
      return
    }
    if (!consentimento) {
      setAviso({ tipo: 'erro', texto: 'Para enviar, marque a autorização de contato.' })
      return
    }
    emAndamento.current = true
    setEnviando(true)
    try {
      const r = await fetch('/api/publico/consulta-gratuita', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'enviar',
          token,
          nome: limparTexto(dados.nome),
          empresa: limparTexto(dados.empresa),
          email: limparTexto(dados.email).toLowerCase(),
          whatsapp: dados.whatsapp,
          consentimento
        }),
        signal: typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(20000) : undefined
      })
      const j = (await r.json().catch(() => ({}))) as { erro?: string; ok?: boolean }
      if (r.status === 429) {
        // limite de reenvios: os dados já chegaram antes
        setAviso({ tipo: 'atencao', texto: j.erro ?? 'Recebemos seus dados. Aguarde nosso contato.' })
        return
      }
      if (!r.ok) {
        setAviso({ tipo: 'erro', texto: `${j.erro ?? 'Não foi possível enviar agora.'} Seus dados continuam no formulário.` })
        return
      }
      setEnviado(true)
    } catch {
      setAviso({
        tipo: 'erro',
        texto: 'Sem conexão com o servidor: confira sua internet e tente de novo. Seus dados continuam no formulário.'
      })
    } finally {
      emAndamento.current = false
      setEnviando(false)
    }
  }

  if (enviado) {
    return (
      <div role='status' className='rounded-2xl border border-ouro/40 bg-white px-6 py-10 text-center'>
        <BadgeCheck className='mx-auto size-12 text-ouro-escuro' strokeWidth={1.5} />
        <h3 className='mt-4 font-serif text-2xl font-bold text-oc-700'>Recebemos seus dados!</h3>
        <p className='mx-auto mt-2 max-w-sm text-sm leading-relaxed text-oc-700/70'>
          Um especialista da OficialCert vai analisar a sua empresa e falar com você em breve pelo WhatsApp ou e-mail.
        </p>
      </div>
    )
  }

  return (
    <form ref={formRef} onSubmit={enviar} noValidate aria-busy={enviando} className='space-y-4'>
      {jaEnviado && (
        <p className='rounded-xl border border-oc-700/10 bg-oc-700/[0.04] px-4 py-3 text-sm text-oc-700'>
          Já recebemos seus dados. Se precisar corrigir algo, é só alterar e enviar de novo.
        </p>
      )}
      <fieldset disabled={enviando} className='grid gap-4 sm:grid-cols-2'>
        <Campo id='cg-nome' icone={User} rotulo='Seu nome completo' erro={erros.nome} {...campo('nome')} maxLength={120} autoComplete='name' />
        <Campo id='cg-empresa' icone={Building2} rotulo='Empresa' erro={erros.empresa} {...campo('empresa')} maxLength={160} autoComplete='organization' />
        <Campo
          id='cg-email'
          icone={Mail}
          rotulo='E-mail corporativo'
          erro={erros.email}
          {...campo('email')}
          type='email'
          maxLength={160}
          autoComplete='email'
          spellCheck={false}
        />
        <Campo
          id='cg-whatsapp'
          icone={Phone}
          rotulo='WhatsApp'
          erro={erros.whatsapp}
          {...campo('whatsapp')}
          type='tel'
          inputMode='tel'
          maxLength={20}
          autoComplete='tel'
        />
      </fieldset>

      <label className='flex cursor-pointer items-start gap-3 rounded-xl px-1 py-1 text-[13px] leading-relaxed text-oc-700/70'>
        <input
          type='checkbox'
          checked={consentimento}
          onChange={e => {
            setConsentimento(e.target.checked)
            if (e.target.checked && aviso?.texto.startsWith('Para enviar')) setAviso(null)
          }}
          disabled={enviando}
          className='mt-0.5 size-4 shrink-0 accent-[#1a2d5a] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oc-700'
        />
        Autorizo a OficialCert a usar estes dados para fazer a consulta e entrar em contato comigo sobre ela.
      </label>

      {aviso && (
        <p
          role='alert'
          className={
            aviso.tipo === 'erro'
              ? 'rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700'
              : 'rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900'
          }
        >
          {aviso.texto}
        </p>
      )}

      <button
        type='submit'
        disabled={enviando}
        className='group inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-oc-700 px-6 text-sm font-bold uppercase tracking-[0.08em] text-creme shadow-lg shadow-oc-900/20 transition hover:bg-oc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oc-700 disabled:opacity-70 sm:w-auto'
      >
        {enviando ? <LoaderCircle className='size-4 animate-spin' /> : null}
        {enviando ? 'Enviando…' : jaEnviado ? 'Atualizar meus dados' : 'Quero minha consulta gratuita'}
        {!enviando && <ArrowUpRight className='size-4 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5' />}
      </button>
    </form>
  )
}
