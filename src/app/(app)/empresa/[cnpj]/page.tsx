import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Building2, ExternalLink, Mail, MapPin, MessageCircle, Phone, TriangleAlert } from 'lucide-react'
import { PORTE_CURTO, SeloPrioridade, SeloSituacao } from '@/components/consulta/selos'
import { Copiar } from '@/components/ui/copiar'
import { obterEmpresa } from '@/lib/empresas/consulta'
import { fmtData, fmtInt, fmtMoeda } from '@/lib/formatar'

type Props = { params: Promise<{ cnpj: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cnpj } = await params
  return { title: `CNPJ ${cnpj}` }
}

export default async function EmpresaPage({ params }: Props) {
  const { cnpj } = await params
  if (!/^\d{14}$/.test(cnpj)) notFound()
  const dados = await obterEmpresa(cnpj)
  if (!dados) notFound()
  const { empresa: e, secundarias, mesmoEmail } = dados

  const contador = e.email_tipo === 'Escritório contábil' || e.email_tipo === 'Compartilhado (grupo/terceiro)'
  const mapa = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    [e.endereco, e.bairro, e.municipio, 'SP', e.cep].filter(Boolean).join(', ')
  )}`

  return (
    <div className='mx-auto max-w-6xl space-y-5 p-6'>
      <Link href='/' className='inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-marca-700'>
        <ArrowLeft className='size-4' /> Voltar à consulta
      </Link>

      <header className='flex flex-wrap items-start gap-4 rounded-xl border border-slate-200 bg-white p-5'>
        <div className='grid size-12 place-items-center rounded-xl bg-marca-50 text-marca-700'>
          <Building2 className='size-6' />
        </div>
        <div className='min-w-0 flex-1 space-y-1'>
          <h1 className='text-xl font-semibold leading-tight'>{e.razao_social}</h1>
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
        <div className='text-right'>
          <SeloPrioridade prioridade={e.prioridade} score={e.score} grande />
          <p className='mt-1 text-xs text-slate-400'>prioridade · score 0–100</p>
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
                    <li key={s.cnae} className='flex gap-2'>
                      <Link href={`/?cnae_secundario=${s.cnae}`} className='font-mono text-xs text-marca-700 hover:underline'>
                        {s.cnae_fmt}
                      </Link>
                      <span className='text-slate-600'>{s.atividade}</span>
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
              <p className='mt-3 text-xs text-slate-400'>
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
                  ['Estabelecimentos em SP', fmtInt(e.estabelecimentos_sp)]
                ]}
              />
            </Cartao>
          </div>

          {mesmoEmail.length > 0 && (
            <Cartao titulo={`Outras empresas com o mesmo e-mail (${fmtInt((e.empresas_mesmo_email ?? 1) - 1)})`}>
              <ul className='divide-y divide-slate-100 text-sm'>
                {mesmoEmail.map(o => (
                  <li key={o.cnpj} className='flex items-center justify-between gap-3 py-2'>
                    <Link href={`/empresa/${o.cnpj}`} className='truncate text-slate-700 hover:text-marca-700'>
                      {o.razao_social}
                    </Link>
                    <span className='shrink-0 text-xs text-slate-400'>{o.municipio}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={`/?email=${encodeURIComponent(e.email!)}`}
                className='mt-3 inline-block text-sm font-medium text-marca-700 hover:underline'
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
                  className='flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-700'
                >
                  <MessageCircle className='size-4' /> WhatsApp {e.whatsapp}
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
                  <p className='text-xs text-slate-400'>E-mail · {e.email_tipo}</p>
                  <a href={`mailto:${e.email}`} className='flex items-center gap-1.5 break-all text-marca-700 hover:underline'>
                    <Mail className='size-3.5 shrink-0' /> {e.email}
                  </a>
                  {contador && (
                    <p className='mt-1 flex gap-1.5 text-xs text-amber-700'>
                      <TriangleAlert className='size-3.5 shrink-0' /> Aparece em {fmtInt(e.empresas_mesmo_email)} empresas.
                    </p>
                  )}
                </div>
              ) : (
                e.email_original && <p className='text-xs text-slate-400'>E-mail inválido no cadastro: {e.email_original}</p>
              )}
            </div>
          </Cartao>

          <Cartao titulo='Endereço'>
            <div className='space-y-1 text-sm text-slate-700'>
              <p>{e.endereco}</p>
              <p>
                {e.bairro} · {e.municipio}/SP · {e.cep}
              </p>
              <p className='text-xs text-slate-400'>
                {e.localizacao} · região de {e.regiao_intermediaria} ({e.regiao_imediata})
              </p>
              <a
                href={mapa}
                target='_blank'
                rel='noreferrer'
                className='mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-marca-700 hover:underline'
              >
                <MapPin className='size-4' /> Ver no mapa <ExternalLink className='size-3' />
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
    <section className='rounded-xl border border-slate-200 bg-white p-5'>
      <h2 className='mb-3 text-sm font-semibold text-slate-700'>{titulo}</h2>
      {children}
    </section>
  )
}

function Campos({ itens }: { itens: [string, string | null | undefined][] }) {
  return (
    <dl className='grid gap-x-6 gap-y-2.5 text-sm sm:grid-cols-[minmax(130px,auto)_1fr]'>
      {itens.map(([k, v]) => (
        <div key={k} className='contents'>
          <dt className='text-slate-400'>{k}</dt>
          <dd className='text-slate-700'>{v && v !== '—' ? v : <span className='text-slate-300'>—</span>}</dd>
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
      <p className='text-xs text-slate-400'>
        {rotulo}
        {tipo && ` · ${tipo}`}
      </p>
      {numero ? (
        <a href={`tel:+55${numero.replace(/\D/g, '')}`} className='flex items-center gap-1.5 text-slate-700 hover:text-marca-700'>
          <Phone className='size-3.5 text-slate-400' /> {numero}
        </a>
      ) : (
        <p className='text-slate-400'>{original} (como está no cadastro)</p>
      )}
    </div>
  )
}
