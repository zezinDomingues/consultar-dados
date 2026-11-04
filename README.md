# Consultar Dados

Consulta das 628 mil empresas de SP (Lucro Real/Presumido) por setor, ramo, segmento, atividade, porte, capital,
idade, regime, região, município, contato e prioridade. A base fica no Supabase (projeto `ogaomwdjzhwdgxzponwc`).

Stack igual aos outros projetos: Next.js 16 (App Router, `proxy.ts`), React 19, Tailwind 4, `@supabase/ssr`, zod.

## Rodar

```bash
npm install
npm run dev            # http://localhost:3000
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
| `/` | Consulta: filtros (painel à esquerda), indicadores, distribuições clicáveis, tabela paginada, ordenação, exportar CSV |
| `/empresa/[cnpj]` | Ficha completa: atividade e CNAEs secundários, tributação, porte, contato, endereço/mapa, outras empresas com o mesmo e-mail |
| `/contadores` | E-mails presentes em 5+ empresas (escritórios contábeis e grupos), com link para os clientes |
| `/agente` | Página reservada para o agente de IA (em breve) |
| `/api/exportar` | CSV (até 20 mil linhas) com os mesmos filtros da tela; abre direto no Excel |

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

Conversa em português que consulta a base com as **mesmas funções da tela** e responde dúvidas gerais de
tributação (como orientação, não consultoria).

- Código: `src/lib/agente/` — `ferramentas.ts` (buscar_codigos, buscar_empresas, resumo_empresas,
  detalhar_empresa, listar_contadores), `provedores.ts` (Nemotron e Gemini pela API compatível com OpenAI),
  `agente.ts` (prompt + laço de ferramentas). Rota: `src/app/api/agente/route.ts`.
- O agente roda com a sessão do usuário: o RLS vale para ele igual vale para a tela.
- Números e empresas sempre vêm das ferramentas. A tabela de empresas é desenhada pela tela; o modelo só recebe
  nome/CNPJ (sem contatos) e usa `detalhar_empresa` quando pedem o contato de uma empresa.

Variáveis (servidor, **nunca** `NEXT_PUBLIC_`):

| Variável | Para quê |
|---|---|
| `NVIDIA_API_KEY` | Nemotron pelo NVIDIA NIM (padrão). Chave gratuita em https://build.nvidia.com |
| `GEMINI_API_KEY` | Gemini, reserva quando a fila gratuita da NVIDIA recusa. https://aistudio.google.com/apikey |
| `AGENTE_PROVEDORES` | Ordem de tentativa, padrão `nvidia,gemini` |
| `NVIDIA_MODEL`, `GEMINI_MODELOS` | Trocar modelos (lista separada por vírgula, em ordem) sem mexer no código |

Modelo padrão: **Nemotron 3 Ultra** (`nvidia/nemotron-3-ultra-550b-a55b`), reserva Nemotron 3.5 Super e depois Gemini. Comparação de 04/11/2026 em `src/lib/agente/provedores.ts`; resposta completa com consulta leva 7–12 s.
