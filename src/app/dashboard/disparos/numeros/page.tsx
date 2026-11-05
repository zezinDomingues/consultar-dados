import type { Metadata } from 'next'
import { Ban, Clock, PauseCircle, PlayCircle, Plug, RefreshCw, Smartphone, Trash2, Webhook } from 'lucide-react'
import { BotaoAcao } from '@/components/disparos/botao-acao'
import { FormBloqueio } from '@/components/disparos/form-bloqueio'
import { FormNumero } from '@/components/disparos/form-numero'
import { FormRegras } from '@/components/disparos/form-regras'
import { SeloSessao } from '@/components/disparos/selos'
import { alternarNumero, conectarWebhook, desbloquearTelefone, excluirNumero, pausarTudo, testarNumero } from '@/app/dashboard/disparos/actions'
import { urlWebhook } from '@/lib/disparos/config'
import { lerConfig, listarBloqueios, listarNumeros } from '@/lib/disparos/dados'
import { fmtFone } from '@/lib/disparos/mensagens'
import { fmtDataHora, fmtInt, fmtRelativo } from '@/lib/formatar'
import { cn } from '@/lib/utils'

export const metadata: Metadata = { title: 'Números e regras' }

export default async function NumerosPage() {
  const [numeros, cfg, bloqueios] = await Promise.all([listarNumeros(), lerConfig(), listarBloqueios()])

  return (
    <div className='grid gap-5 xl:grid-cols-[1.6fr_1fr]'>
      <section className='space-y-3'>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <h2 className='font-serif text-xl font-bold text-marca-800'>Números de WhatsApp</h2>
            <p className='text-xs text-slate-500'>Cada número é uma sessão do WAHA (no plano CORE, uma instância por número).</p>
          </div>
          <FormNumero />
        </div>

        {numeros.length === 0 && (
          <div className='rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center text-sm text-slate-500'>
            <Smartphone className='mx-auto mb-2 size-8 text-ouro-escuro' strokeWidth={1.5} />
            Nenhum número ainda. Veja ao lado como preparar o WAHA e depois clique em <strong>Adicionar número</strong>.
          </div>
        )}

        {numeros.map(n => (
          <article key={n.id} className={cn('rounded-2xl border bg-white p-4 shadow-sm shadow-marca-900/[0.03]', n.ativo ? 'border-slate-200' : 'border-slate-200 opacity-70')}>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='min-w-0'>
                <div className='flex flex-wrap items-center gap-2'>
                  <h3 className='font-semibold text-slate-800'>{n.rotulo}</h3>
                  <SeloSessao status={n.status} />
                  {!n.ativo && <span className='rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500'>Pausado</span>}
                </div>
                <p className='mt-0.5 text-xs text-slate-500'>
                  {n.telefone ? fmtFone(n.telefone) : 'telefone aparece após o teste'}
                  {n.nome_perfil ? ` · ${n.nome_perfil}` : ''} · <span className='font-mono'>{n.waha_url}</span> ({n.waha_sessao})
                </p>
                {n.status_detalhe && <p className='mt-1 text-xs text-red-600'>{n.status_detalhe}</p>}
              </div>
              <div className='flex flex-wrap gap-1.5'>
                <BotaoAcao acao={testarNumero.bind(null, n.id)}>
                  <RefreshCw className='size-3.5' /> Testar
                </BotaoAcao>
                <BotaoAcao
                  acao={conectarWebhook.bind(null, n.id)}
                  variante={n.webhook_em ? 'secundario' : 'primario'}
                  confirmar='Configurar o webhook reinicia a sessão no WAHA (volta sozinha em ~20 s). Continuar?'
                >
                  <Webhook className='size-3.5' /> {n.webhook_em ? 'Reconfigurar webhook' : 'Conectar webhook'}
                </BotaoAcao>
                <BotaoAcao acao={alternarNumero.bind(null, n.id, !n.ativo)}>
                  {n.ativo ? <PauseCircle className='size-3.5' /> : <PlayCircle className='size-3.5' />} {n.ativo ? 'Pausar' : 'Ativar'}
                </BotaoAcao>
                <FormNumero numero={n} />
                {!n.ultimo_envio_em && (
                  <BotaoAcao acao={excluirNumero.bind(null, n.id)} variante='texto' confirmar={`Excluir ${n.rotulo}?`} titulo='Excluir'>
                    <Trash2 className='size-3.5' />
                  </BotaoAcao>
                )}
              </div>
            </div>
            <dl className='mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4'>
              <Dado rotulo='Hoje' valor={`${fmtInt(n.enviados_hoje)} / ${fmtInt(n.limite_diario)}`} />
              <Dado rotulo='Intervalo' valor={`${Math.round(n.intervalo_min_s / 60 * 10) / 10}–${Math.round(n.intervalo_max_s / 60 * 10) / 10} min`} />
              <Dado rotulo='Próximo envio' valor={new Date(n.proximo_envio_em) > new Date() ? fmtRelativo(n.proximo_envio_em) : 'pronto'} />
              <Dado rotulo='Último webhook' valor={n.ultimo_evento_em ? fmtRelativo(n.ultimo_evento_em) : n.webhook_em ? 'nenhum ainda' : 'não configurado'} />
            </dl>
            <p className='mt-2 truncate text-[11px] text-slate-400'>
              Webhook: <span className='font-mono'>{urlWebhook(n.id)}</span>
              {n.webhook_em ? ` · configurado ${fmtDataHora(n.webhook_em)}` : ''}
            </p>
          </article>
        ))}
      </section>

      <aside className='space-y-4'>
        <div className={cn('rounded-2xl border p-4', cfg.pausado ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white')}>
          <div className='flex items-center justify-between gap-2'>
            <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
              <Clock className='size-3.5 text-ouro-escuro' /> Regras gerais
            </p>
            {cfg.pausado ? (
              <BotaoAcao acao={pausarTudo.bind(null, false)} variante='primario'>
                <PlayCircle className='size-3.5' /> Liberar disparos
              </BotaoAcao>
            ) : (
              <BotaoAcao acao={pausarTudo.bind(null, true)} variante='perigo' confirmar='Pausar TODOS os disparos agora? (as respostas continuam funcionando)'>
                <PauseCircle className='size-3.5' /> Pausar tudo
              </BotaoAcao>
            )}
          </div>
          {cfg.pausado && <p className='mt-2 text-sm font-semibold text-red-700'>Todos os disparos estão pausados.</p>}
          <div className='mt-3'>
            <FormRegras cfg={cfg} />
          </div>
        </div>

        <div className='rounded-2xl border border-slate-200 bg-white p-4'>
          <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            <Plug className='size-3.5 text-ouro-escuro' /> Como ligar um número novo
          </p>
          <ol className='mt-3 list-decimal space-y-2 pl-4 text-[13px] leading-relaxed text-slate-600'>
            <li>
              Suba uma instância do WAHA para o número (no CORE, <strong>uma por número</strong>, como a waha2) com motor <strong>NOWEB</strong>
              e um endereço HTTPS público (túnel do Cloudflare).
            </li>
            <li>
              Pareie pelo <strong>código de 8 dígitos</strong> (<span className='font-mono text-xs'>POST /api/default/auth/request-code</span>) — é mais estável que o QR.
            </li>
            <li>
              Aqui: <strong>Adicionar número</strong> com a URL e a API key. O teste mostra “Conectado” e o telefone.
            </li>
            <li>
              Clique em <strong>Conectar webhook</strong>: a plataforma aponta o WAHA para cá (com assinatura) e liga o store do NOWEB.
            </li>
            <li>
              Número novo: comece com <strong>20–30 por dia</strong> e suba aos poucos. Denúncias derrubam o número — mensagem honesta e “SAIR” respeitado
              são a melhor proteção.
            </li>
          </ol>
        </div>

        <div className='rounded-2xl border border-slate-200 bg-white p-4'>
          <p className='flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500'>
            <Ban className='size-3.5 text-ouro-escuro' /> Nunca contatar
          </p>
          <p className='mt-1 text-xs text-slate-400'>Clientes, parceiros, números da equipe. Quem pede para sair entra aqui sozinho.</p>
          <div className='mt-3'>
            <FormBloqueio />
          </div>
          {bloqueios.length > 0 && (
            <ul className='mt-3 max-h-72 divide-y divide-slate-100 overflow-y-auto text-xs'>
              {bloqueios.map(b => (
                <li key={b.telefone} className='flex items-center gap-2 py-2'>
                  <span className='font-medium tabular-nums text-slate-700'>{fmtFone(b.telefone)}</span>
                  <span className='min-w-0 flex-1 truncate text-slate-400'>
                    {b.motivo === 'manual' ? b.observacao || 'manual' : b.motivo}
                  </span>
                  {b.motivo === 'manual' && (
                    <BotaoAcao acao={desbloquearTelefone.bind(null, b.telefone)} variante='texto' titulo='Remover bloqueio'>
                      <Trash2 className='size-3.5' />
                    </BotaoAcao>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className='rounded-lg bg-slate-50 px-2.5 py-1.5'>
      <dt className='text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400'>{rotulo}</dt>
      <dd className='mt-0.5 font-semibold tabular-nums text-slate-700'>{valor}</dd>
    </div>
  )
}
