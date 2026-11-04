import type { Metadata } from 'next'
import { MessageSquareText, Sparkles, Wrench } from 'lucide-react'

export const metadata: Metadata = { title: 'Agente de IA' }

const EXEMPLOS = [
  'Quais indústrias de alimentos no interior têm Lucro Real e WhatsApp?',
  'Me traga 50 clínicas em Campinas com e-mail próprio, as maiores primeiro.',
  'Quantas construtoras com mais de 20 anos existem na Grande SP?',
  'Quais escritórios contábeis atendem mais empresas de Lucro Real?'
]

export default function AgentePage() {
  return (
    <div className='mx-auto max-w-3xl space-y-6 p-6'>
      <header className='space-y-2'>
        <span className='inline-flex items-center gap-1.5 rounded-full bg-marca-50 px-2.5 py-1 text-xs font-medium text-marca-800'>
          <Sparkles className='size-3.5' /> Em breve
        </span>
        <h1 className='text-2xl font-semibold'>Agente de IA</h1>
        <p className='text-slate-500'>
          Pergunte em português e o agente monta a busca, consulta a base e devolve as empresas, com os números e o link
          para cada uma.
        </p>
      </header>

      <section className='rounded-xl border border-slate-200 bg-white p-5'>
        <h2 className='mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700'>
          <MessageSquareText className='size-4 text-marca-500' /> Perguntas que ele vai responder
        </h2>
        <ul className='space-y-2'>
          {EXEMPLOS.map(p => (
            <li key={p} className='rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600'>
              {p}
            </li>
          ))}
        </ul>
      </section>

      <section className='rounded-xl border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-600'>
        <h2 className='mb-2 flex items-center gap-2 font-semibold text-slate-700'>
          <Wrench className='size-4 text-marca-500' /> O que já está pronto para ele
        </h2>
        <p>
          A consulta desta plataforma já funciona como as ferramentas do agente: os mesmos filtros (setor, ramo, porte,
          região, regime, contato, prioridade…) e as mesmas funções do banco (<code>buscar_empresas</code> e{' '}
          <code>resumo_empresas</code>). Falta só ligar o modelo de IA a elas.
        </p>
      </section>
    </div>
  )
}
