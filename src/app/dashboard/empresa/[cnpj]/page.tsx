import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, ExternalLink, Mail, MapPin, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from '@/components/consulta/selos'
import { Copiar } from '@/components/ui/copiar'
import { FOCO } from '@/components/ui/foco'
import { obterEmpresa, paginaInterna } from '@/lib/empresas/consulta'
import { fmtData, fmtInt, fmtMoeda } from '@/lib/formatar'
import { ROTAS } from '@/lib/rotas'
import { hrefConsulta } from '@/lib/empresas/filtros'
import { cn } from '@/lib/utils'

type Props = { params: Promise<{ cnpj: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cnpj } = await params
  // título da aba com a máscara: CNPJ 12.345.678/0001-90 (endereço inválido cai no 404)
  if (!/^\d{14}$/.test(cnpj)) return { title: 'Página não encontrada' }
  return { title: `CNPJ ${cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')}` }
}

export default async function EmpresaPage({ params }: Props) {
  await paginaInterna()
  const { cnpj } = await params
  if (!/^\d{14}$/.test(cnpj)) notFound()
  const dados = await obterEmpresa(cnpj)
  if (!dados) notFound()
  const { empresa: e, secundarias, mesmoEmail } = dados

  const contador = e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [e.endereco, e.bairro, e.municipio, e.uf, e.cep].filter(Boolean).join(', ')
  )}`

  return (
    <div className='mx-auto max-w-6xl space-y-5 p-4 md:p-6'>
      <Link
        href={ROTAS.dashboard}
        className={cn('inline-flex items-center gap-1.5 rounded-sm text-sm text-slate-500 hover:text-marca-700', FOCO)}
      >
        <ArrowLeft className='size-4' aria-hidden /> Voltar à consulta
      </Link>

      <header className='flex flex-wrap items-start gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-marca-900/[0.03] sm:p-6'>
        <div className='hidden size-12 shrink-0 place-items-center rounded-xl bg-marca-50 text-marca-700 sm:grid'>
          <Building2 className='size-6' aria-hidden />
        </div>
        <div className='min-w-0 flex-1 basis-60 space-y-1'>
          <h1 className='break-words font-serif text-[1.4rem] font-bold leading-tight tracking-[-0.01em] text-marca-800 sm:text-[1.7rem]'>
            {e.razao_social}
          </h1>
          {e.nome_fantasia && <p className='text-slate-500'>{e.nome_fantasia}</p>}
          <div className='flex flex-wrap items-center gap-2 pt-1 text-sm'>
            <span className='flex items-center font-mono text-slate-600'>
              {e.cnpj_formatado}
              <Copiar texto={e.cnpj_formatado} rotulo='CNPJ copiado' />
            </span>
            <span className='rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600'>{e.matriz_filial}</span>
            {e.tipo_negocio && <span className='rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600'>{e.tipo_negocio}</span>}
            <SeloSituacao situacao={e.situacao_regime} />
          </div>
        </div>
        <div className='sm:text-right'>
          <SeloPrioridade prioridade={e.prioridade} score={e.score} grande />
          <p className='mt-1 text-xs text-slate-500'>prioridade · score 0–100</p>
        </div>
      </header>

      <div className='grid gap-5 lg:grid-cols-3'>
        <div className='space-y-5 lg:col-span-2'>
          <Cartao titulo='Atividade'>
            <Campos
              itens={[
                ['Setor', e.setor],
                ['Ramo', e.ramo],
                ['Segmento', e.segmento],
                ['Atividade principal', `${e.cnae_fmt} · ${e.atividade_principal}`]
              ]}
            />
            {secundarias.length > 0 && (
              <div className='mt-4'>
                <p className='mb-2 text-xs font-medium text-slate-500'>Atividades secundárias ({secundarias.length})</p>
                <ul className='grid gap-1 text-sm sm:grid-cols-2'>
                  {secundarias.map(s => (
                    <li key={s.cnae} className='flex min-w-0 gap-2'>
                      <Link
                        href={hrefConsulta({ filtros: { cnae_secundario: s.cnae } })}
                        className={cn('shrink-0 rounded-sm font-mono text-xs text-marca-700 hover:underline', FOCO)}
                      >
                        {s.cnae_fmt}
                      </Link>
                      <span className='min-w-0 break-words text-slate-600'>{s.atividade}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </Cartao>

          <div className='grid gap-5 md:grid-cols-2'>
            <Cartao titulo='Tributação'>
              <Campos
                itens={[
                  ['Regime (ECF)', e.regime],
                  ['Forma declarada', e.forma_tributacao],
                  ['Ano da ECF', e.ano_ecf?.toString()],
                  ['Simples (out/2026)', e.simples_out2026],
                  ['Opção pelo Simples', fmtData(e.data_opcao_simples)],
                  ['Exclusão do Simples', fmtData(e.data_exclusao_simples)]
                ]}
              />
              <p className='mt-3 text-xs text-slate-500'>
                O regime vem da ECF e é histórico: não confirma o enquadramento atual.
              </p>
            </Cartao>
            <Cartao titulo='Tamanho'>
              <Campos
                itens={[
                  ['Porte', e.porte ? `${PORTE_CURTO[e.porte] ?? e.porte}` : null],
                  ['Capital social', fmtMoeda(e.capital_social)],
                  ['Faixa de capital', e.faixa_capital],
                  ['Abertura', `${fmtData(e.data_abertura)}${e.idade_anos != null ? ` (${e.idade_anos} anos)` : ''}`],
                  [`Estabelecimentos em ${e.uf}`, fmtInt(e.estabelecimentos_uf)]
                ]}
              />
            </Cartao>
          </div>

          {mesmoEmail.length > 0 && (
            <Cartao titulo={`Outras empresas com o mesmo e-mail (${fmtInt((e.empresas_mesmo_email ?? 1) - 1)})`}>
              <ul className='divide-y divide-slate-100 text-sm'>
                {mesmoEmail.map(o => (
                  <li key={o.cnpj} className='flex items-center justify-between gap-3 py-2'>
                    <Link href={ROTAS.empresa(o.cnpj)} className={cn('truncate rounded-sm text-slate-700 hover:text-marca-700', FOCO)}>
                      {o.razao_social}
                    </Link>
                    <span className='shrink-0 text-xs text-slate-500'>{o.municipio}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={hrefConsulta({ filtros: { email: e.email! } })}
                className={cn('mt-3 inline-block rounded-sm text-sm font-medium text-marca-700 hover:underline', FOCO)}
              >
                Ver todas na consulta →
              </Link>
            </Cartao>
          )}
        </div>

        <div className='space-y-5'>
          <Cartao titulo='Contato'>
            <div className='space-y-3 text-sm'>
              {e.whatsapp_link && (
                <a
                  href={e.whatsapp_link}
                  target='_blank'
                  rel='noreferrer'
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-lg bg-marca-800 px-3 py-2 font-medium text-creme hover:bg-marca-950',
                    FOCO
                  )}
                >
                  <MessageCircle className='size-4' aria-hidden /> WhatsApp {e.whatsapp}
                </a>
              )}
              <Telefone rotulo='Telefone 1' numero={e.telefone1} tipo={e.telefone1_tipo} original={e.telefone1_original} />
              <Telefone rotulo='Telefone 2' numero={e.telefone2} tipo={e.telefone2_tipo} original={e.telefone2_original} />
              {(e.empresas_mesmo_telefone ?? 0) >= 5 && (
                <p className='flex gap-1.5 text-xs text-amber-700'>
                  <TriangleAlert className='size-3.5 shrink-0' /> Telefone aparece em {fmtInt(e.empresas_mesmo_telefone)} empresas
                  (provável contador).
                </p>
              )}
              {e.email ? (
                <div>
                  <p className='text-xs text-slate-500'>E-mail · {e.email_tipo}</p>
                  <a
                    href={`mailto:${e.email}`}
                    className={cn('flex items-center gap-1.5 rounded-sm text-marca-700 wrap-anywhere hover:underline', FOCO)}
                  >
                    <Mail className='size-3.5 shrink-0' aria-hidden /> <span className='min-w-0'>{e.email}</span>
                  </a>
                  {contador && (
                    <p className='mt-1 flex gap-1.5 text-xs text-amber-700'>
                      <TriangleAlert className='size-3.5 shrink-0' /> Aparece em {fmtInt(e.empresas_mesmo_email)} empresas.
                    </p>
                  )}
                </div>
              ) : (
                e.email_original && (
                  <p className='text-xs text-slate-500 wrap-anywhere'>E-mail inválido no cadastro: {e.email_original}</p>
                )
              )}
            </div>
          </Cartao>

          <Cartao titulo='Endereço'>
            <div className='space-y-1 text-sm text-slate-700 wrap-break-word'>
              <p>{e.endereco}</p>
              <p>
                {e.bairro} · {e.municipio}/{e.uf} · {e.cep}
              </p>
              <p className='text-xs text-slate-500'>
                {e.localizacao} · região de {e.regiao_intermediaria} ({e.regiao_imediata})
              </p>
              <a
                href={mapa}
                target='_blank'
                rel='noreferrer'
                className={cn('mt-2 inline-flex items-center gap-1.5 rounded-sm text-sm font-medium text-marca-700 hover:underline', FOCO)}
              >
                <MapPin className='size-4' aria-hidden /> Ver no mapa <ExternalLink className='size-3' aria-hidden />
              </a>
            </div>
          </Cartao>
        </div>
      </div>
    </div>
  )
}

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className='min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-marca-900/[0.03] sm:p-5'>
      <h2 className='mb-3 font-serif text-[1.05rem] font-bold text-marca-800'>{titulo}</h2>
      {children}
    </section>
  )
}

function Campos({ itens }: { itens: [string, string | null | undefined][] }) {
  return (
    <dl className='grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[minmax(130px,auto)_1fr]'>
      {itens.map(([k, v]) => (
        <div key={k} className='contents'>
          <dt className='text-slate-500'>{k}</dt>
          <dd className='min-w-0 text-slate-700 wrap-break-word'>{v && v !== '—' ? v : <span className='text-slate-400'>—</span>}</dd>
        </div>
      ))}
    </dl>
  )
}

function Telefone({
  rotulo,
  numero,
  tipo,
  original
}: {
  rotulo: string
  numero: string | null
  tipo: string | null
  original: string | null
}) {
  if (!numero && !original) return null
  return (
    <div>
      <p className='text-xs text-slate-500'>
        {rotulo}
        {tipo && ` · ${tipo}`}
      </p>
      {numero ? (
        <a
          href={`tel:+55${numero.replace(/\D/g, '')}`}
          className={cn('flex items-center gap-1.5 rounded-sm text-slate-700 hover:text-marca-700', FOCO)}
        >
          <Phone className='size-3.5 text-slate-400' aria-hidden /> {numero}
        </a>
      ) : (
        <p className='text-slate-500 wrap-anywhere'>{original} (como está no cadastro)</p>
      )}
    </div>
  )
}
