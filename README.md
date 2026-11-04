# Consultar Dados

Consulta das 628 mil empresas de SP (Lucro Real/Presumido) por setor, ramo, segmento, atividade, porte, capital,
idade, regime, região, município, contato e prioridade. A base fica no Supabase (projeto `ogaomwdjzhwdgxzponwc`).

Stack igual aos outros projetos: Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind 4, `@supabase/ssr`, zod.

## Rodar

```bash
npm install
npm run dev            # http://localhost:3000  (landing) · /dashboard (área logada)
# produção: npm run build && npm start
```

`.env.local` só tem valores públicos (URL e chave publishable). A chave secreta **não** fica no projeto.

## Usuários

Só entra quem está no Auth do Supabase **e** na tabela `app_usuarios` (o RLS bloqueia o resto, inclusive quem se
cadastrar sozinho). Para criar ou trocar a senha de alguém:

```bash
SUPABASE_SECRET_KEY=sb_secret_... npm run criar-usuario -- pessoa@empresa.com 'senha-forte' 'Nome' consulta
```

## Telas

| Rota | O que faz |
|---|---|
| `/` e `/quem-somos`, `/segmentos`, `/seja-um-parceiro`, `/diagnostico`, `/blog`, `/blog/<artigo>`, `/politica-de-privacidade`, `/termos-de-uso` | Site institucional da OficialCert (base: site da GWT Solution, ver abaixo) |
| `/login` | Entrar (aparece sempre, mesmo com sessão aberta). Depois do login vai para onde a pessoa tentou ir, ou `/dashboard` |
| `/dashboard` | Consulta: filtros, indicadores, distribuições clicáveis, tabela paginada, ordenação, exportar CSV |
| `/dashboard/empresa/[cnpj]` | Ficha completa da empresa |
| `/dashboard/contadores` | E-mails presentes em 5+ empresas (escritórios contábeis e grupos) |
| `/dashboard/agente` | Agente de IA |
| `/api/exportar`, `/api/empresas`, `/api/agente` | CSV, paginação do agente e o agente (exigem login; sem login: 401) |

Rotas centralizadas em `src/lib/rotas.ts`; o `src/proxy.ts` protege `/dashboard` e `/api` e deixa o resto público
(sem nem consultar o Supabase), então páginas novas da landing não precisam mexer no proxy.

A URL guarda todos os filtros: dá para salvar, compartilhar e voltar no navegador.

## Estrutura

```
supabase/migrations/001_consulta_empresas.sql  acesso (RLS), funções de busca e resumo — rodar após a carga
scripts/criar-usuario.mjs                      cria/autoriza usuário
src/proxy.ts                                   renova a sessão e manda para /login quem não está logado
src/lib/empresas/filtros.ts                    schema único dos filtros (zod) + leitura/escrita da URL
src/lib/empresas/consulta.ts                   buscarEmpresas, resumoEmpresas, obterEmpresa, listarContadores
src/components/consulta/                       painel de filtros, resumo, tabela, chips
src/app/(app)/                                 páginas logadas
```

## Banco

- `buscar_empresas(f, ordem, limite, pagina)` e `resumo_empresas(f)` recebem o **mesmo JSON de filtros**. As duas
  usam `empresas_where(f)`, que monta só as condições dos filtros presentes (valores escapados com `%L`).
- `opcoes_filtros()` devolve setor › ramo › segmento › atividade e municípios/regiões com contagens.
- Tudo roda como o usuário logado; o papel `anon` não lê tabela nem chama função.
- Se a base for recarregada (`~/banco-clientes-sp/carga_supabase.py` faz `DROP ... CASCADE`), rode a migração de novo.

Tempos medidos: filtros comuns ~25 ms; resumo 0,4–2 s (fica 15 min em cache no servidor); busca por texto ~1,4 s
(varredura completa — um índice de trigramas resolveria, mas custa ~60 MB do limite de 500 MB do plano grátis).

## Agente de IA (`/agente`)

Conversa em português com dois modos:
- **Pergunta sobre empresas** → o agente consulta a base e a tela mostra o **mesmo painel da Consulta** (filtros
  entendidos, indicadores, distribuições, tabela com contatos, "Carregar mais", exportar). O modelo escreve só a
  legenda (1–2 frases). Ficha de empresa e contadores também viram cartões.
- **Dúvida geral** (tributação, ECF, reforma, LGPD) → texto formatado, ancorado na referência de `conhecimento.ts`.

Como funciona:
- `src/lib/agente/ferramentas.ts` — buscar_codigos, consultar_empresas, detalhar_empresa, listar_contadores. Cada
  ferramenta devolve um *anexo* para a tela e um resumo curto para o modelo (sem contatos, para ele não repetir a tabela).
- `src/lib/agente/conhecimento.ts` — dicionário termo → CNAE (conferido na base) e fatos tributários.
- `src/lib/agente/agente.ts` — prompt e laço de ferramentas; `provedores.ts` — Nemotron/Gemini.
- `src/app/api/agente/route.ts` — responde em NDJSON (etapas, anexos e texto chegam ao vivo).
- O chat manda o que já está na tela num campo `contexto` separado do histórico (dentro do histórico o modelo
  imitava a nota), o que permite "dessas, só…" e "o WhatsApp da segunda".
- Componentes visuais compartilhados com a Consulta: `components/consulta/tabela-empresas.tsx` e `indicadores.tsx`.

Variáveis (servidor, **nunca** `NEXT_PUBLIC_`):

| Variável | Para quê |
|---|---|
| `NVIDIA_API_KEY` | Nemotron pelo NVIDIA NIM (padrão). Chave gratuita em https://build.nvidia.com |
| `GEMINI_API_KEY` | Gemini, reserva quando a fila gratuita da NVIDIA recusa. https://aistudio.google.com/apikey |
| `AGENTE_PROVEDORES` | Ordem de tentativa, padrão `nvidia,gemini` |
| `NVIDIA_MODEL`, `GEMINI_MODELOS` | Trocar modelos (lista separada por vírgula, em ordem) sem mexer no código |

Modelo padrão: **Nemotron 3 Ultra** (`nvidia/nemotron-3-ultra-550b-a55b`), reserva Nemotron 3.5 Super e depois Gemini. Comparação de 04/11/2026 em `src/lib/agente/provedores.ts`; resposta completa com consulta leva 7–12 s.

## Site institucional (`public/site/`)

Montado a partir do site da GWT Solution (15 páginas), da qual a OficialCert é **afiliada**, e servido por
*rewrites* em `next.config.ts` — a URL fica limpa (`/`, `/quem-somos`, `/blog/<artigo>`…). Marca OficialCert
(Selo Oficial) em `public/site/marca/`.

Textos (04/11/2026, `scripts/clonar-site/trocar-textos.py`): saíram os números e afirmações que são da GWT
(R$ 1 bi+, 200+ empresas, 100%, 8 unidades, prazos de 48 h, "risco zero"/"glosa zero") e a afiliação aparece
no destaque, numa seção própria da home, em Quem Somos e no rodapé. O carrossel "Empresas que confiam na GWT",
os artigos do blog e a liderança em Quem Somos ficam creditados à GWT. Políticas de privacidade e termos falam em nome
da OficialCert (e-mail `contato@oficialcert.com`) — **revisar com o jurídico**.

- Textos: edite os `.html` em `public/site/` (um por página). Visual: CSS original em `public/site/css/`.
- Comportamento (animações, menu do celular, abas, filtros, formulários): `public/site/site.js`.
  **O número de WhatsApp está no topo desse arquivo** (`WHATSAPP`) — ainda é o da GWT (trocar pelo da OficialCert).
- Formulários: abrem o WhatsApp ("Preenchi o formulário no site da OficialCert…") e gravam o contato na tabela
  `leads_site` do Supabase (rota pública `/api/publico/lead`, função `registrar_lead_site`, migração 002).
- "Login" em todas as páginas leva para `/login` da plataforma.
- Página Eventos removida em 04/11/2026 (`/eventos` redireciona para `/blog#noticias`).
- **Radar tributário** (topo do `/blog`): notícias do dia vindas de `GET /api/publico/noticias`
  (`src/lib/noticias/noticias.ts`). Fonte: Google Notícias (RSS público, sem chave), uma busca por tema
  (reforma, PIS/COFINS, ICMS, Receita, tribunais, obrigações, patrimônio), últimas 72 h, até 8 por tema, sem
  manchetes repetidas do mesmo fato. Três travas para não sair do tema: busca temática → título com termo
  fiscal e sem termos proibidos → o Nemotron confere a lista (se a IA falhar, fica a segunda trava). Cache de
  1 h na CDN da Vercel (`s-maxage=3600`), então as notícias se renovam sozinhas ao longo do dia.
- Como a cópia foi feita (e como refazer): `scripts/clonar-site/LEIA-ME.md`.
