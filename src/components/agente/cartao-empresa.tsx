'use client'

import Link from 'next/link'
import { ArrowRight, Mail, MapPin, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from '@/components/consulta/selos'
import { Copiar } from '@/components/ui/copiar'
import { FOCO } from '@/components/ui/foco'
import type { Empresa } from '@/lib/empresas/tipos'
import { fmtData, fmtInt, fmtMoeda } from '@/lib/formatar'
import { cn } from '@/lib/utils'
import { ROTAS } from '@/lib/rotas'

/** Ficha resumida de uma empresa dentro do chat. */
export function CartaoEmpresa({ e }: { e: Empresa }) {
  const contador = e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [e.endereco, e.bairro, e.municipio, e.uf, e.cep].filter(Boolean).join(', ')
  )}`

  return (
    <section className='overflow-hidden rounded-2xl border border-slate-200 bg-white'>
      <header className='flex flex-wrap items-start gap-4 border-b border-slate-100 p-4 sm:p-5'>
        <SeloPrioridade prioridade={e.prioridade} score={e.score} grande />
        <div className='min-w-0 flex-1'>
          <h3 className='break-words font-semibold leading-tight text-slate-900'>{e.razao_social}</h3>
          {e.nome_fantasia && <p className='text-sm text-slate-500'>{e.nome_fantasia}</p>}
          <div className='mt-1.5 flex flex-wrap items-center gap-2 text-xs'>
            <span className='flex items-center font-mono text-slate-600'>
              {e.cnpj_formatado}
              <Copiar texto={e.cnpj_formatado} rotulo='CNPJ copiado' />
            </span>
            {e.matriz_filial && <span className='rounded bg-slate-100 px-1.5 py-0.5 text-slate-600'>{e.matriz_filial}</span>}
            {e.tipo_negocio && <span className='rounded bg-slate-100 px-1.5 py-0.5 text-slate-600'>{e.tipo_negocio}</span>}
            <SeloSituacao situacao={e.situacao_regime} />
          </div>
        </div>
        <Link
          href={ROTAS.empresa(e.cnpj)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-xs font-medium text-slate-700 hover:border-marca-300 hover:text-marca-800',
            FOCO
          )}
        >
          Ficha completa <ArrowRight className='size-3.5' aria-hidden />
        </Link>
      </header>

      <div className='@container'>
        <div className='grid gap-5 p-4 text-sm sm:p-5 @2xl:grid-cols-3'>
          <Bloco titulo='Atividade'>
            <p className='text-xs text-slate-500'>
              {e.setor} › {e.ramo}
            </p>
            <p className='text-slate-700'>
              <span className='font-mono text-xs text-slate-400'>{e.cnae_fmt}</span> {e.atividade_principal}
            </p>
          </Bloco>
          <Bloco titulo='Tamanho e regime'>
            <p className='text-slate-700'>
              {e.porte ? PORTE_CURTO[e.porte] ?? e.porte : '—'} · {fmtMoeda(e.capital_social, true)}
            </p>
            <p className='text-xs text-slate-500'>
              Aberta em {fmtData(e.data_abertura)}
              {e.idade_anos != null && ` (${e.idade_anos} anos)`} · {fmtInt(e.estabelecimentos_uf)} unid. em {e.uf}
            </p>
            <p className='mt-1 text-xs text-slate-600'>
              {e.regime} · ECF {e.ano_ecf} · Simples: {e.simples_out2026}
            </p>
          </Bloco>
          <Bloco titulo='Endereço'>
            <p className='break-words text-slate-700'>{e.endereco}</p>
            <p className='text-xs text-slate-500'>
              {e.bairro} · {e.municipio}/{e.uf} · {e.cep}
            </p>
            <a
              href={mapa}
              target='_blank'
              rel='noreferrer'
              className={cn('mt-1 inline-flex items-center gap-1 rounded-sm text-xs font-medium text-marca-700 hover:underline', FOCO)}
            >
              <MapPin className='size-3.5' aria-hidden /> Ver no mapa
            </a>
          </Bloco>
        </div>
      </div>

      <footer className='flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-sm sm:px-5'>
        {e.whatsapp_link && (
          <a
            href={e.whatsapp_link}
            target='_blank'
            rel='noreferrer'
            aria-label={`WhatsApp ${e.whatsapp}`}
            className={cn('inline-flex items-center gap-1.5 rounded-lg bg-marca-800 px-3 py-1.5 font-medium text-creme hover:bg-marca-950', FOCO)}
          >
            <MessageCircle className='size-4' aria-hidden /> {e.whatsapp}
          </a>
        )}
        {[e.telefone1, e.telefone2]
          .filter((t): t is string => !!t && t !== e.whatsapp)
          .map(t => (
            <a
              key={t}
              href={`tel:+55${t.replace(/\D/g, '')}`}
              aria-label={`Telefone ${t}`}
              className={cn('inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-slate-700 hover:border-marca-300', FOCO)}
            >
              <Phone className='size-4 text-slate-400' aria-hidden /> {t}
            </a>
          ))}
        {e.email && (
          <a
            href={`mailto:${e.email}`}
            title={e.email_tipo ?? undefined}
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-lg border bg-white px-3 py-1.5',
              contador ? 'border-amber-200 text-amber-800' : 'border-slate-200 text-marca-700',
              FOCO
            )}
          >
            {contador ? <TriangleAlert className='size-4 shrink-0' aria-hidden /> : <Mail className='size-4 shrink-0' aria-hidden />}
            <span className='truncate'>{e.email}</span>
          </a>
        )}
        {contador && (
          <span className='text-xs text-amber-700'>e-mail aparece em {fmtInt(e.empresas_mesmo_email)} empresas (provável contador)</span>
        )}
        {!e.whatsapp_link && !e.telefone1 && !e.email && <span className='text-slate-500'>Sem contato válido no cadastro</span>}
      </footer>
    </section>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <p className='mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500'>{titulo}</p>
      {children}
    </div>
  )
}
