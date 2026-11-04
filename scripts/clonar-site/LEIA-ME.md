# Cópia do site institucional (gwtsolution.com.br)

Ferramentas usadas em 04/11/2026 para gerar `public/site/`. Só precisam rodar de novo se quiser
recopiar o site original do zero — para trocar textos, edite direto os `.html` em `public/site/`.

1. Baixe o HTML de cada página (`curl` em `ssr/<pagina>.html`, ver `PAGINAS` em `montar.py`).
2. `node capturar.mjs` — abre o site original no Chrome e captura os estados interativos (menu do
   celular, abas, filtros, telas de sucesso dos formulários). Chamadas ao banco/API deles são
   respondidas localmente: nada é enviado para a GWT.
3. `python3 montar.py` — gera `public/site/` (HTML, CSS, fontes, imagens), sem logo e sem o emblema.

Os caminhos (`AQUI`, `SAIDA`, puppeteer) são os da máquina onde foi gerado; ajuste se rodar em outra.
