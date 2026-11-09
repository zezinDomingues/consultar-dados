import 'server-only'
import { DICIONARIO, FATOS } from './conhecimento'
import { descreverEtapa, executarFerramenta, FERRAMENTAS, type Contexto } from './ferramentas'
import { novaSessao, type Mensagem } from './provedores'
import type { Anexo, AnexoConsulta, AnexoContadores, EventoAgente } from './tipos'
import { fmtInt } from '@/lib/formatar'
import { opcoesFiltros } from '@/lib/empresas/consulta'
import type { Opcao } from '@/lib/empresas/tipos'

const MAX_ITERACOES = 6
const MAX_HISTORICO = 20

export function sistema(base?: { total: number; ufs: Opcao[] }) {
  const estados = base?.ufs?.length ? base.ufs.map(u => `${u.chave} (${fmtInt(u.n)})`).join(', ') : 'SP'
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  return `Você é o agente da plataforma "Consultar Dados": especialista em prospecção B2B e em tributação de empresas no Brasil. Hoje é ${hoje}.

## A base
${base ? fmtInt(base.total) : ''} empresas ATIVAS, uma por raiz de CNPJ em cada estado, cuja ECF mais recente declara Lucro Real, Lucro Presumido ou tributação mista.
- Estados já carregados: ${estados}. Os demais estados ainda não estão na base (chegam aos poucos): se pedirem um estado fora da lista, diga isso em vez de buscar.
- Pergunta sem estado = base inteira (todos os estados). Pergunta com estado, capital ou região → use o filtro ufs. Fonte: Receita Federal (cadastro de outubro/2026; ECF 2016–2024) e IBGE.
- O regime é HISTÓRICO (vem da ECF). "Recente (ECF 2024)" é o mais confiável; "Hoje no Simples" = optante pelo Simples em out/2026, provavelmente saiu do Lucro Real/Presumido.
- Telefone/e-mail do cadastro muitas vezes é do contador (email_tipo "Escritório contábil" ou "Compartilhado").
- Prioridade A/B/C/D vem de um score 0–100 (regime recente fora do Simples, porte, capital, filiais, contato próprio; holdings e SPEs perdem pontos).
- Setores (letra CNAE): A agropecuária · B extrativas · C indústria · D energia e gás · E água e resíduos · F construção · G comércio · H transporte e logística · I alojamento e alimentação · J informação e TI · K financeiro e holdings · L imobiliário · M serviços profissionais · N serviços administrativos · P educação · Q saúde · R cultura e lazer · S outros serviços.
- Localização (dentro de cada estado): Capital, Região metropolitana (da capital: Grande SP, Grande BH, Grande Salvador), Litoral (só SP), Interior. Regiões IBGE (regiões intermediárias): use buscar_codigos com tipo "regiao" para achar o nome exato.

## Dois tipos de pergunta, dois jeitos de responder

### A) Sobre as empresas da base (quantas, quais, onde, liste, me traga, compare, contato de uma empresa)
- Use as ferramentas. consultar_empresas mostra AO USUÁRIO um painel igual ao da tela de Consulta (filtros entendidos, indicadores, distribuições e tabela com contatos). detalhar_empresa mostra o cartão da empresa. listar_contadores mostra a tabela de escritórios.
- Vá direto à ferramenta: na mesma resposta, sem texto antes. A legenda com os números é escrita pelo sistema a partir do resultado.
- PROIBIDO na resposta do tipo A: listas, tabelas, enumerar empresas/municípios/regiões, repetir os indicadores. O painel já mostra tudo isso.
- Números, nomes, CNPJs e contatos vêm SEMPRE das ferramentas. Nunca invente nem estime.
- Não acrescente filtros que o usuário não pediu (ex.: não filtre regime, porte ou contato se ele não falou disso). A base inteira já é Lucro Real/Presumido/mista.
- Comparações ("Campinas ou Sorocaba?") → chame consultar_empresas uma vez por opção, TODAS NA MESMA RESPOSTA (chamadas em paralelo); a tela compara os totais.
- Refinamentos ("dessas…", "agora só…", "e em Campinas?") → pegue os filtros da busca anterior (estão na seção "O que o usuário já está vendo na tela") e mude só o que foi pedido.
- Pedido ambíguo → faça a busca mais razoável e diga na legenda a interpretação que usou.

### B) Dúvida de conhecimento (tributação, regimes, ECF, CNAE, reforma tributária, LGPD, como prospectar)
- Responda sem ferramentas, bem formatado em markdown:
  1. Primeira linha: a resposta direta, com o essencial em **negrito**.
  2. Depois seções curtas com título em **negrito** e listas de no máximo 4 itens.
  3. Feche com uma linha **Na prática:** (o que fazer / exemplo).
- No máximo ~15 linhas. Use a Referência tributária abaixo; não contradiga e não invente alíquota, prazo, multa, percentual ou exigência legal que não esteja nela. Na dúvida, descreva o princípio sem número. Se depender do caso, diga do que depende.
- Termine com "_Orientação geral — confirme o caso com seu contador._" quando falar de imposto.
- Se fizer sentido, ofereça uma busca na base em uma frase (ex.: "Quer que eu liste as transportadoras de Lucro Real com WhatsApp?").

## Tradução de pedidos para filtros
- "grandes" → portes ["Grande porte"]; "médias" → ["Médio porte"]; "médias e grandes" → ["Médio porte", "Grande porte"]; "pequenas" → ["Empresa de pequeno porte"]; "micro" → ["Microempresa"].
- "com WhatsApp" → com_whatsapp; "contato direto / sem contador" → contato_proprio; "com e-mail" → com_email.
- "regime atual / confiável / que ainda estão no Lucro Real" → situacoes_regime ["Recente (ECF 2024)"] (+ o regime pedido).
- "sem holdings" ou "empresas operacionais" → tipos_negocio ["Operacional"].
- "melhores / mais promissoras" → prioridades ["A"]; "maiores" → ordem "capital".
- Valores de capital em reais (1 milhão = 1000000). Idade em anos.
- "interior", "capital", "litoral" → localizacoes (+ ufs se citou o estado). "Grande SP" → localizacoes ["Região metropolitana"] + ufs ["SP"]; "Grande BH" → idem com ["MG"]; "Grande Salvador" / "RMS" → idem com ["BA"].
- "na Bahia", "em Minas", "no estado de SP" → ufs. "capital baiana" → ufs ["BA"] + localizacoes ["Capital"].
- Municípios com acento ("São José dos Campos"); se o nome existir em mais de um estado, use "Nome/UF" (ex.: "Salvador/BA").
${DICIONARIO}
${FATOS}

## Estilo
Português do Brasil, direto, sem rodeios e sem se apresentar. Nunca prometa o que a base não tem (faturamento, número de funcionários, sócios).`
}

// Ferramentas que já mostram o resultado na tela: depois delas a legenda sai do código (números exatos do
// banco) em vez de mais uma ida ao modelo — economiza 1–8 s por pergunta e não há número inventado.
const MOSTRAM_PAINEL = new Set(['consultar_empresas', 'buscar_empresas', 'resumo_empresas', 'listar_contadores'])

const negrito = (n: number) => `**${fmtInt(n)}**`

function legendaConsulta(a: AnexoConsulta): string {
  const t = a.resumo.total
  if (t.n === 0) {
    const tirar = [...a.rotulos].reverse().find(r => /WhatsApp|e-mail|Contato|Prioridade|anos|Capital|estabelecimentos/.test(r)) ?? a.rotulos.at(-1)
    return `**Nenhuma empresa** com todos esses filtros juntos.${tirar ? ` Tire “${tirar}” para ampliar a busca.` : ''}`
  }
  const partes = [`**${fmtInt(t.n)} ${t.n === 1 ? 'empresa encontrada' : 'empresas encontradas'}**`]
  const extras = [
    !a.filtros.com_whatsapp && t.com_whatsapp ? `${negrito(t.com_whatsapp)} com WhatsApp` : '',
    !a.filtros.prioridades && t.prioridade_a ? `${negrito(t.prioridade_a)} de prioridade A` : ''
  ].filter(Boolean)
  let frase = partes[0] + (extras.length ? ` — ${extras.join(' e ')}.` : '.')
  const dim = !a.filtros.municipios ? a.resumo.dims.municipio : !a.filtros.ramos && !a.filtros.cnaes ? a.resumo.dims.ramo : undefined
  const maior = dim?.[0]
  if (maior && t.n > 1 && maior.n < t.n) frase += ` A maior concentração é ${!a.filtros.municipios ? 'em ' : 'no ramo '}**${maior.nome}** (${fmtInt(maior.n)}).`
  return frase
}

function legendaComparacao(lista: AnexoConsulta[]): string {
  const comuns = lista.map(a => new Set(a.rotulos)).reduce((x, y) => new Set([...x].filter(r => y.has(r))))
  const itens = lista.map(a => ({ nome: a.rotulos.filter(r => !comuns.has(r)).join(' · ') || 'Busca', n: a.resumo.total.n }))
  const lider = [...itens].sort((x, y) => y.n - x.n)[0]
  return `${itens.map(i => `**${i.nome}:** ${fmtInt(i.n)}`).join(' · ')}.${itens.length > 1 && lider.n > 0 ? ` **${lider.nome}** tem mais empresas.` : ''}`
}

function legendaContadores(a: AnexoContadores): string {
  const top = a.itens[0]
  if (!top) return 'Nenhum escritório ou grupo encontrado com esse termo.'
  return `**${fmtInt(a.total)}** e-mails de escritórios e grupos aparecem em 5+ empresas. O maior é **${top.email}**, com ${fmtInt(top.empresas)} empresas.`
}

function legendaDoTurno(anexos: Anexo[]): string {
  const consultas = anexos.filter((a): a is AnexoConsulta => a.tipo === 'consulta')
  const contadores = anexos.filter((a): a is AnexoContadores => a.tipo === 'contadores')
  const partes = []
  if (consultas.length === 1) partes.push(legendaConsulta(consultas[0]))
  else if (consultas.length > 1) partes.push(legendaComparacao(consultas))
  if (contadores.length) partes.push(legendaContadores(contadores.at(-1)!))
  return partes.join('\n\n')
}

export type TurnoUsuario = { papel: 'usuario' | 'agente'; texto: string }

/** Tira da resposta qualquer cópia do bloco de contexto (defesa extra). */
function limpar(texto: string) {
  return texto
    .replace(/\[(Busca|Ficha|Contadores) mostrad[ao]s?:[\s\S]*?\]/g, '')
    .replace(/^## O que o usuário já está vendo[\s\S]*$/m, '')
    .trim()
}

export async function responder(historico: TurnoUsuario[], emitir: (e: EventoAgente) => void, contexto?: string) {
  const inicio = Date.now()
  const mensagens: Mensagem[] = [
    {
      role: 'system',
      content:
        sistema(
          await opcoesFiltros()
            .then(o => ({ total: o.total_base, ufs: o.ufs ?? [] }))
            .catch(() => undefined)
        ) +
        (contexto?.trim()
          ? `\n\n## O que o usuário já está vendo na tela (mais recente por último)\nUse para refinamentos ("dessas…") e para "a segunda da lista". É informação interna: NUNCA copie este bloco na resposta.\n${contexto}`
          : '')
    },
    ...historico.slice(-MAX_HISTORICO).map(t =>
      t.papel === 'usuario'
        ? ({ role: 'user', content: t.texto } as const)
        : ({ role: 'assistant', content: t.texto } as const)
    )
  ]
  const sessao = novaSessao()
  const anexos: Anexo[] = []
  const ctx: Contexto = { anexos, emitir }
  const ferramentas: string[] = []
  const falhasFerramenta = new Set<string>() // a mesma consulta não é repetida depois de falhar

  emitir({ tipo: 'etapa', texto: 'Entendendo o pedido' })

  for (let i = 0; i < MAX_ITERACOES; i++) {
    const ultima = i === MAX_ITERACOES - 1
    const r = await sessao.completar(mensagens, ultima ? [] : FERRAMENTAS)
    if (!r.chamadas.length) {
      const texto = limpar(r.texto ?? '') || (anexos.length ? '' : 'Não consegui montar uma resposta. Pode reformular a pergunta?')
      const fim = { texto, motor: sessao.motor, ms: Date.now() - inicio, ferramentas }
      emitir({ tipo: 'fim', ...fim })
      return { ...fim, anexos }
    }
    mensagens.push({ role: 'assistant', content: r.texto ?? '', tool_calls: r.chamadas })
    const anexosAntes = anexos.length
    let falhou = false
    for (const c of r.chamadas) {
      ferramentas.push(c.function.name)
      emitir({ tipo: 'etapa', texto: descreverEtapa(c.function.name, c.function.arguments) })
      let resultado: unknown
      const assinatura = `${c.function.name}:${c.function.arguments}`
      if (falhasFerramenta.size >= 2 || falhasFerramenta.has(assinatura)) {
        const fim = {
          texto: 'A base demorou mais que o normal para responder agora. Tente de novo em instantes — se persistir, use menos filtros de uma vez.',
          motor: sessao.motor,
          ms: Date.now() - inicio,
          ferramentas
        }
        emitir({ tipo: 'fim', ...fim })
        return { ...fim, anexos }
      }
      try {
        resultado = await executarFerramenta(c.function.name, c.function.arguments, ctx)
      } catch (e) {
        resultado = { erro: `Falha ao consultar: ${(e as Error).message}` }
      }
      if (resultado && typeof resultado === 'object' && 'erro' in resultado) {
        falhou = true
        if (String((resultado as { erro: unknown }).erro).startsWith('Falha ao consultar')) falhasFerramenta.add(assinatura)
        console.warn(`[agente] ${c.function.name} recusou ${c.function.arguments.slice(0, 400)} → ${JSON.stringify(resultado).slice(0, 400)}`)
      }
      mensagens.push({ role: 'tool', tool_call_id: c.id, content: JSON.stringify(resultado).slice(0, 30_000) })
    }
    // Só ferramentas de painel, todas deram certo → a legenda sai do código e o turno acaba aqui.
    if (!falhou && anexos.length > anexosAntes && r.chamadas.every(c => MOSTRAM_PAINEL.has(c.function.name))) {
      const fim = { texto: legendaDoTurno(anexos.slice(anexosAntes)), motor: sessao.motor, ms: Date.now() - inicio, ferramentas }
      emitir({ tipo: 'fim', ...fim })
      return { ...fim, anexos }
    }
    emitir({ tipo: 'etapa', texto: 'Analisando o resultado' })
  }
  const fim = {
    texto: 'A consulta ficou longa demais. Tente uma pergunta mais específica.',
    motor: sessao.motor,
    ms: Date.now() - inicio,
    ferramentas
  }
  emitir({ tipo: 'fim', ...fim })
  return { ...fim, anexos }
}
