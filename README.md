# Consultar Dados

Consulta das empresas do Lucro Real/Presumido (SP e os estados já carregados, uma carga por UF) por setor, ramo,
segmento, atividade, porte, capital, idade, regime, região, município, contato e prioridade. A base fica no Supabase
(projeto `ogaomwdjzhwdgxzponwc`).

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
| `/` e `/quem-somos`, `/segmentos`, `/seja-um-parceiro`, `/diagnostico`, `/blog`, `/politica-de-privacidade`, `/termos-de-uso` | Site institucional da OficialCert (base: site da GWT Solution, ver abaixo) |
| `/login` | Entrar (aparece sempre, mesmo com sessão aberta). Depois do login vai para onde a pessoa tentou ir, ou `/dashboard` |
| `/dashboard` | Consulta: filtros, indicadores, distribuições clicáveis, tabela paginada, ordenação, exportar CSV |
| `/dashboard/empresa/[cnpj]` | Ficha completa da empresa |
| `/dashboard/contadores` | E-mails presentes em 5+ empresas (escritórios contábeis e grupos) |
| `/dashboard/agente` | Agente de IA |
| `/api/exportar`, `/api/empresas`, `/api/agente` | CSV, paginação do agente e o agente (exigem login; sem login: 401) |
| `/dashboard/disparos` (+ `/campanhas`, `/numeros`, `/grupos`, `/[id]`) | **Disparos de WhatsApp** — campanhas, números e grupos só para administradores; painel e conversas também para a equipe (seus grupos e ramos) e para o cliente do grupo (ver seções abaixo) |
| `/consulta-gratuita/[token]` | Formulário público que o contato abre pelo link do WhatsApp |
| `/api/sistema/disparos/ciclo`, `/api/sistema/zapi`, `/api/sistema/whatsapp` | Ciclo de envio (pg_cron) e webhooks da Z-API e do WAHA — públicas para o proxy, protegidas por segredo/token por número/HMAC |

Rotas centralizadas em `src/lib/rotas.ts`; o `src/proxy.ts` protege `/dashboard` e `/api` e deixa o resto público
(sem nem consultar o Supabase), então páginas novas da landing não precisam mexer no proxy.

A URL guarda todos os filtros: dá para salvar, compartilhar e voltar no navegador.

## Estrutura

```
supabase/migrations/001_consulta_empresas.sql  acesso (RLS), funções de busca e resumo — rodar após a carga
supabase/migrations/005_disparos_whatsapp.sql  disparos de WhatsApp (livro, campanhas, números) — 006 liga o relógio
src/lib/disparos/                              motor, webhook, mensagens e cliente WAHA dos disparos
scripts/criar-usuario.mjs                      cria/autoriza usuário
src/proxy.ts                                   renova a sessão e manda para /login quem não está logado
src/lib/empresas/filtros.ts                    schema único dos filtros (zod) + leitura/escrita da URL
src/lib/empresas/consulta.ts                   buscarEmpresas, resumoEmpresas, obterEmpresa, listarContadores
src/components/consulta/                       painel de filtros, resumo, tabela, chips
src/app/(app)/                                 páginas logadas
```

## Banco

### Ordem das migrações novas (QA rodada 1) — ANTES do deploy

Aplicar com `~/banco-clientes-sp/aplicar_sql.py`, nesta ordem, e só depois fazer o deploy (cada uma é compatível com
o código que já está no ar e é idempotente — pode rodar de novo):

1. `016_desempenho_resumo_elegiveis.sql` — `resumo_cache` + contagem de elegíveis mais rápida
2. `019_seguranca_qa1.sql` — RLS/grants (a sessão só altera `disparos.atencao`, equipe por grupo + ramo…)
3. `020_disparos_qa1.sql` — travas da reserva/replanejar, devolução de reserva, fila só de campanha ativa, saldo do
   cliente por modalidade, `webhook_por_numero`
4. `021_desempenho_qa1.sql`
5. `022_publico_qa1.sql`

**Depois de CADA carga da base** (`carga_estado.py`/`carga_supabase.py`): `select public.atualizar_resumo_cache();`
(vem da 016; sem isso os indicadores da Consulta ficam com os números da carga anterior).

- `buscar_empresas(f, ordem, limite, pagina)` e `resumo_empresas(f)` recebem o **mesmo JSON de filtros**. As duas
  usam `empresas_where(f)`, que monta só as condições dos filtros presentes (valores escapados com `%L`).
- `opcoes_filtros()` devolve setor › ramo › segmento › atividade e municípios/regiões com contagens.
- Tudo roda como o usuário logado; o papel `anon` não lê tabela nem chama função.
- Se a base for recarregada (`~/banco-clientes-sp/carga_supabase.py` faz `DROP ... CASCADE`), rode a migração de novo.

Tempos medidos: filtros comuns ~25 ms; resumo 0,4–2 s (fica 15 min em cache no servidor); busca por texto ~1,4 s
(varredura completa — um índice de trigramas resolveria, mas custa ~60 MB do limite de 500 MB do plano grátis).

## Disparos de WhatsApp (`/dashboard/disparos`)

Prospecção ativa pelo WhatsApp. Campanhas, números, grupos e regras: só `admin` (o menu ganha a seção
**Administrativo**); painel e conversas: também a equipe (grupos + ramos dela) e o cliente do grupo ("Meus disparos").

**Fluxo:** campanha (filtros da Consulta + textos) → a cada minuto o **pg_cron** do Supabase chama o ciclo → cada
número pronto manda a 1ª mensagem para a próxima empresa da fila da campanha (já dividida por nicho/estado/regime/
porte, migração 017): **logo + texto + UM botão** ("✅ Quero a consulta"; formato "texto" = logo + "responda SIM") →
quem toca/responde **SIM** recebe as perguntas pela própria conversa: **nome completo** → **número de contato**
(botões "Usar este número" / "Informar outro", ou 1/2 por escrito) → se "outro", **qual número** (com DDD válido) →
mensagem final com **logo + "em análise" + botão que abre o site**. Pergunta no lugar do nome ("quanto custa?") não
vira nome; 3 respostas ruins → "Precisam de atenção". O formulário `/consulta-gratuita/<token>` continua no ar, mas
saiu do fluxo (quem pediu SAIR não recebe a confirmação dele).

**Teste no próprio WhatsApp:** na tela da campanha (salva, pode estar pausada) → "Testar a conversa no meu WhatsApp".
Cria um registro `teste` (fora do funil e do limite diário) e manda a 1ª mensagem de verdade; o resto é o fluxo real.

**Regra de ouro — ninguém recebe duas vezes (por grupo):** a tabela `disparos` é um livro com índices ÚNICOS em
`(grupo_id, telefone)` e `(grupo_id, cnpj)` (migração 014 — o mesmo telefone pode ser contatado por grupos
diferentes, nunca duas vezes pelo mesmo). A reserva (`disparo_reservar`) acontece no banco antes do envio, com a
trava do grupo (uma reserva por vez em cada grupo: a quantidade total da campanha nunca estoura). Falhas e números sem
WhatsApp ficam registrados e não voltam. Quem responde SAIR vai para `disparo_bloqueios` (o bloqueio é gravado antes
do status; nem mensagem manual sai para ele). O único DELETE é de uma reserva que comprovadamente não chegou ao
WhatsApp (`disparo_devolver`, migração 020): ela volta para o começo da fila.

**Garantias do ciclo e do webhook (QA rodada 1):**
- Prazo de 50 s por ciclo (a função morre aos 60): só começa um envio que cabe inteiro; o que não cabe volta para a
  fila. A reserva nasce marcada "preparando o envio" e a marca sai logo antes de mandar: reserva parada COM a marca
  volta para a fila; sem a marca (pode ter saído) vira "falhou" e nunca é reenviada. Erro do banco = não envia.
- Webhook: o evento é gravado antes (anti-repetição) e desfeito se o processamento falhar → 500 → o provedor reenvia e
  o reenvio é processado. Cada mensagem grava com UPDATE condicional pela versão (`atualizado_em`): duas mensagens
  seguidas da mesma pessoa não se atropelam (a 2ª relê e decide de novo).
- O contato é achado 1º pelo número que fez o contato (trocar o grupo de um número não quebra a conversa; a tela
  recusa a troca enquanto houver conversa em andamento), depois pelo grupo do número; só responde por um número do
  grupo do contato. Reação/aviso sem texto só ficam na conversa; LID (`…@lid`) não é tratado como telefone.
- Campanha: filtros e grupo não mudam depois que ela começou a enviar; a fila só existe com a campanha ATIVA
  (pausar/encerrar apaga, ativar monta); o porte antigo "Demais" vira Médio + Grande.

Peças:
- `supabase/migrations/005_disparos_whatsapp.sql` — tabelas, RLS (só admin), `disparo_reservar` (rodízio entre
  campanhas ativas, pula celular compartilhado por 2+ empresas), `disparo_contar_elegiveis`, `disparo_resumo`.
  `006_disparos_agendamento.sql` — pg_cron + pg_net, só chama a Vercel quando há o que fazer.
- `src/lib/disparos/motor.ts` — o ciclo: trava por número, limite diário, sessão WORKING, check-exists (acha o chatId
  com/sem o 9), "digitando…", texto, enquete, intervalo aleatório.
- `src/lib/disparos/webhook.ts` — entrega/leitura (`message.ack`), toque no botão (vem no `body` ou no `nativeFlow`),
  coleta nome → contato → outro número (`disparos.etapa`), SIM/NÃO/SAIR/cortesia; o resto vai para "Precisam de
  atenção". `src/app/api/sistema/zapi/route.ts` traduz o aviso da Z-API para o mesmo formato.
- `src/lib/disparos/erro.ts` — erro do Postgres → frase em português (a tela nunca mostra a mensagem crua).
- `supabase/migrations/007_disparos_conversa.sql` — formato da campanha, imagem, botões, perguntas, `etapa`, `lead_cnpj`, `teste`.
- `src/lib/disparos/mensagens.ts` — modelos padrão, variáveis `{marca}` `{empresa}` `{saudacao}` `{municipio}`
  `{primeiro_nome}` `{telefone}`, variações `{Olá|Oi}` sorteadas por envio, leitura da intenção das respostas.
- `src/lib/disparos/waha.ts` — cliente do WAHA por número (URL + sessão + API key; no CORE, uma instância por número).

Variáveis do servidor (Vercel, **nunca** `NEXT_PUBLIC_`):

| Variável | Para quê |
|---|---|
| `SUPABASE_SECRET_KEY` | ciclo, webhook e formulário rodam sem usuário logado |
| `DISPAROS_SEGREDO` | segredo antigo, único: vale para tudo o que ainda não tem a variável própria abaixo |
| `DISPAROS_CICLO_SEGREDO` | opcional; Bearer do pg_cron. O MESMO valor vai no Vault do Supabase (`disparos_segredo`) |
| `ZAPI_WEBHOOK_SEGREDO` | opcional; base dos tokens do webhook da Z-API (cada número recebe o seu: HMAC do id) |
| `WAHA_WEBHOOK_SEGREDO` | opcional; chave do HMAC do webhook do WAHA |
| `APP_URL` | opcional; padrão `https://www.oficialcert.com` (links do formulário e do webhook) |

Sem as opcionais, tudo usa o `DISPAROS_SEGREDO` (como antes). O webhook da Z-API usa um **token por número**
(derivado da base); o token antigo (`DISPAROS_SEGREDO` na URL) continua aceito para o número até alguém clicar em
**Reconfigurar webhook** nele (`disparo_numeros.webhook_por_numero`, migração 020). O aviso também precisa vir da
instância do número (`instanceId`) e com no máximo 72 h (conexão: 30 min) — o resto é ignorado.

Trocar os segredos (separar por uso), sem parar nada:
1. Gerar 2 valores novos (`openssl rand -base64 32`): um para o ciclo, um para a base da Z-API.
2. Vercel → Settings → Environment Variables (Production): criar `DISPAROS_CICLO_SEGREDO` e `ZAPI_WEBHOOK_SEGREDO`;
   redeploy.
3. Logo em seguida, no SQL do Supabase: `select vault.update_secret((select id from vault.secrets where name =
   'disparos_segredo'), '<valor do DISPAROS_CICLO_SEGREDO>');` (entre o passo 2 e o 3 o ciclo responde 401 e
   simplesmente não envia — o pg_cron tenta de novo a cada minuto).
4. Disparos → Números: **Reconfigurar webhook** em cada número da Z-API (grava a URL com o token novo do número; a
   partir daí o token antigo deixa de valer para ele).
5. Quando todos os números estiverem reconfigurados, o `DISPAROS_SEGREDO` só serve de reserva: pode trocar o valor
   dele também (ou mantê-lo só no servidor).

Ligar um número: instância da Z-API conectada por QR → **Números e regras → Adicionar número** (ID da instância +
token + Client-Token) → **Reconfigurar webhook** (aponta recebidas, status e conexão para a plataforma, com o token do
número). Número novo: 20–30 envios/dia e subir aos poucos.

## Provedor de WhatsApp: só Z-API (06/11/2026)

Decisão do usuário: a OficialCert usa só a **Z-API** (botões aparecem no celular). O WAHA da OficialCert foi removido do
servidor vlm do escritório (o do SmartRanch continua lá). O código do WAHA segue em `src/lib/disparos/waha.ts` (o motor
despacha por `disparo_numeros.provedor`), mas a tela só cadastra números da Z-API.

## Grupos de disparo (06/11/2026 · migração 014)

Cada **grupo** é um cliente que contrata a divulgação pelo WhatsApp (a OficialCert é o grupo 1): nome (`{marca}` nas
mensagens), logo (upload para o bucket público `marcas` do Storage), site, **fluxo** (`coleta` = SIM → nome → contato →
final; `divulgacao` = logo + texto + link, sem perguntas), **modelo** de mensagens (campanhas novas do grupo nascem com
ele) e opção de **medir cliques** (o link passa por `/r/<token>`, que ignora robôs de pré-visualização).
- Números e campanhas pertencem a um grupo; cada número só envia campanhas do grupo dele.
- "Nunca 2 vezes" vale **por grupo** (índices `(grupo_id, telefone)` e `(grupo_id, cnpj)`); SAIR bloqueia o telefone
  no grupo (`disparo_bloqueios.grupo_id`; nulo = todos os grupos).
- O webhook acha o contato no grupo do número que recebeu (o mesmo telefone pode estar em vários grupos).
- Cliente do grupo = papel `cliente` + `grupo_membros`: menu "Meus disparos", vê só painel/conversas/leads do grupo,
  responde e exporta. Um cliente pode ter os dois produtos (Consulta de dados e Disparos) e vê o Calendário do grupo.
- Quem responde um contato pela plataforma (conferido no servidor, além do RLS): admin; equipe só nos grupos de que
  é membro E nos ramos que recebeu; cliente só no grupo dele. A mensagem sai pelo número do grupo do contato e nunca
  para quem pediu SAIR (ou recusou e não voltou a escrever).

## Papéis, calendário e o produto "Consulta de dados" (06/11/2026 · migrações 012 e 013)

| Papel | O que vê |
|---|---|
| `admin` | tudo, inclusive **Usuários** (`/dashboard/usuarios`) |
| `equipe` | base inteira + **Disparos só dos grupos de que é membro e dos ramos dela** (`grupo_membros` + `equipe_ramos`, garantido pelo RLS) + Calendário |
| `consulta` | base inteira, agente e Calendário |
| `cliente` | o que contratou: **Minhas empresas** (Consulta de dados, plano em `clientes_acesso`) e/ou **Meus disparos** (grupo em `grupo_membros`), + **Calendário** do grupo |

- `is_app_user()` = equipe interna (admin/equipe/consulta): é o que libera as tabelas da base no RLS. **O cliente não
  lê nenhuma tabela da base**; tudo passa por `cliente_buscar`/`cliente_contar`/`cliente_liberar`/`cliente_saldo`/
  `cliente_opcoes` (security definer), que aplicam o plano (`clientes_acesso`: ramos, estados, validade), escondem
  telefone/WhatsApp/e-mail/endereço até a empresa ser liberada (`clientes_liberacoes`) e cobram a cota — **mensal**
  (`cota_mensal`, renova dia 1º em Brasília) ou **por pacote** (`clientes_pacotes`, cada "leva de compra" soma).
  Cada liberação guarda a modalidade em que foi feita (migração 020): no pacote só contam as liberações feitas no
  pacote — trocar de mensal para pacote não zera o saldo.
- **Disparos por ramo:** cada contato guarda `ramo`/`ramo_nome`/`uf` da empresa; o painel tem a faixa "Por ramo"
  (com os responsáveis) e o filtro `?ramo=`. Campanhas e números continuam só do admin.
- **Calendário** (`/dashboard/calendario`, tabela `reunioes`, migração 015): **por grupo** — cada pessoa vê só o
  calendário dos grupos de que faz parte (`grupo_membros`, qualquer papel) e, dentro do grupo, as reuniões de todos;
  edita só as suas (admin vê e edita tudo). "Agendar reunião" na conversa de um contato já preenche empresa e WhatsApp.
- Desativar alguém = desmarcar "Acesso ativo" em Usuários (`app_usuarios.ativo`).

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
- `src/lib/agente/agente.ts` — prompt e laço de ferramentas; `provedores.ts` — NVIDIA NIM (corrida entre modelos)/Gemini.
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

Modelos padrão: **Nemotron 3.5 Super VL** (`nvidia/nemotron-3.5-super-vl-120b-a12b`) e **Mistral Large 4**
(`mistralai/mistral-large-4-1t-a52b`) em **corrida** (o 2º entra se o 1º não responder em ~5 s; o turno continua no
que respondeu primeiro); Gemini de reserva quando a NVIDIA recusa. O Nemotron 3 Ultra saiu (não respondia na cota
gratuita). Comparação em `src/lib/agente/provedores.ts`.

## Site institucional (`public/site/`)

Montado a partir do site da GWT Solution (15 páginas), da qual a OficialCert é **afiliada**, e servido por
*rewrites* em `next.config.ts` — a URL fica limpa (`/`, `/quem-somos`, `/blog/<artigo>`…). Marca OficialCert
(Selo Oficial) em `public/site/marca/`. Paleta (04/11/2026): **azul-marinho + dourado + creme** — o verde herdado
foi convertido por `scripts/marca/verde-para-marinho.py` (mesma luminância percebida ×0,8, saturação ≤ 55%;
idempotente, entende hex, rgb, oklab e oklch do CSS compilado). Base `#1A2D5A`, fundo `#0B1225`, acento `#213870`.

Textos (04/11/2026, `scripts/clonar-site/trocar-textos.py`): saíram os números e afirmações que são da GWT
(R$ 1 bi+, 200+ empresas, 100%, 8 unidades, prazos de 48 h, "risco zero"/"glosa zero") e a afiliação aparece
no destaque, numa seção própria da home, em Quem Somos e no rodapé. O carrossel "Empresas que confiam na GWT"
e a liderança em Quem Somos ficam creditados à GWT. Políticas de privacidade e termos falam em nome
da OficialCert, sem e-mail por enquanto (o titular é orientado a usar o formulário) — **revisar com o jurídico**.

- Textos: edite os `.html` em `public/site/` (um por página). Visual: CSS original em `public/site/css/`.
- Comportamento (animações, menu do celular, abas, filtros, formulários): `public/site/site.js`.
  **O número de WhatsApp fica no topo desse arquivo** (`WHATSAPP`) — VAZIO por enquanto: os formulários só gravam
  o contato e mostram "entraremos em contato"; preenchido, abrir o WhatsApp volta sozinho.
- Formulários: abrem o WhatsApp ("Preenchi o formulário no site da OficialCert…") e gravam o contato na tabela
  `leads_site` do Supabase (rota pública `/api/publico/lead`, função `registrar_lead_site`, migração 002).
- "Login" em todas as páginas leva para `/login` da plataforma.
- Página Eventos removida em 04/11/2026 (`/eventos` redireciona para `/blog#noticias`).
- Artigos antigos do blog removidos em 04/11/2026 (`/blog/<artigo>` redireciona para `/blog#noticias`).
- **Radar tributário** (`/blog` e a vitrine "Notícias do dia" da home): `GET /api/publico/noticias`
  (`src/lib/noticias/noticias.ts`). Fonte: Bing Notícias (RSS público, sem chave, link direto da matéria),
  2–3 buscas por tema (reforma, PIS/COFINS, ICMS, Receita, tribunais, obrigações, patrimônio), últimos 5 dias,
  até 8 por tema, sem o mesmo fato repetido. Três travas de tema: busca temática → título com termo fiscal e
  sem termos proibidos → conferência pelo Nemotron. **Regra da imagem:** usa a og:image do próprio portal; sem
  ela, a miniatura do Bing; sem nenhuma, a notícia não entra (e no navegador o cartão some se as duas falharem).
  Cache de 1 h na CDN da Vercel (`s-maxage=3600`).
- Como a cópia foi feita (e como refazer): `scripts/clonar-site/LEIA-ME.md`.
