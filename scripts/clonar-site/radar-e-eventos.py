"""04/11/2026: tira a página Eventos e coloca o Radar tributário (notícias do dia) no blog."""
import glob, os, re
from bs4 import BeautifulSoup

SITE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'site')

# 1) Eventos: some dos menus (cabeçalho, menu do celular, rodapé) e o arquivo sai
n = 0
for c in glob.glob(os.path.join(SITE, '*.html')) + glob.glob(os.path.join(SITE, 'blog', '*.html')):
    s = open(c, encoding='utf-8').read()
    s2, k = re.subn(r'<a [^>]*href="/eventos"[^>]*>Eventos</a>', '', s)
    if k:
        open(c, 'w', encoding='utf-8').write(s2); n += k
print('links de Eventos removidos:', n)
if os.path.exists(os.path.join(SITE, 'eventos.html')):
    os.remove(os.path.join(SITE, 'eventos.html'))

# 2) Radar tributário no topo do blog
c = os.path.join(SITE, 'blog.html')
soup = BeautifulSoup(open(c, encoding='utf-8').read(), 'html.parser')
if not soup.select_one('[data-radar]'):
    BOTAO = 'px-5 py-2.5 rounded-full text-xs font-semibold tracking-wider transition-all duration-300 cursor-pointer'
    RADAR = f'''<section id="noticias" data-radar="" class="bg-[#F5F1E8] px-6 lg:px-16 xl:px-24" style="padding-top:5rem">
<div class="max-w-6xl mx-auto">
<div class="gwt-anim">
<div class="flex items-center gap-3 mb-4"><div class="w-8 h-px bg-[#0B4B3F]/25"></div>
<span class="text-[11px] font-bold tracking-[0.2em] uppercase text-[#0B4B3F]/70">Radar tributário · atualizado todo dia</span></div>
<h2 class="text-[clamp(1.8rem,4vw,3rem)] font-bold leading-[1.15] tracking-[-0.02em] text-[#0B3C34] mb-4 font-serif">Notícias do dia.<br/>
<span class="text-[#0B4B3F]/60 font-normal italic">Só o que move os tributos.</span></h2>
<p class="text-base text-[#0B3C34]/90 max-w-2xl font-medium">Reforma tributária, ICMS, PIS/COFINS, Receita Federal, tribunais e obrigações fiscais: a imprensa do dia selecionada automaticamente e revisada por IA para não sair do tema.</p>
</div>
<div data-radar-filtros="" class="flex flex-wrap items-center gap-2 lg:gap-3" style="margin:2.25rem 0 1.75rem" data-classe-botao="{BOTAO}"></div>
<div data-radar-lista="" class="radar-grade" aria-live="polite">{''.join('<div class="radar-card radar-esqueleto"></div>' for _ in range(6))}</div>
<div class="radar-rodape"><button type="button" data-radar-mais="" hidden="" class="{BOTAO} bg-white/40 text-[#0B3C34]/70 border border-[#0B4B3F]/10 hover:border-[#0B4B3F]/30 hover:text-[#0B3C34]">Ver mais notícias</button>
<p data-radar-status="" class="text-[11px] text-[#0B4B3F]/60 font-medium"></p></div>
<div class="flex items-center gap-3" style="margin-top:5rem"><div class="w-8 h-px bg-[#0B4B3F]/25"></div>
<span class="text-[11px] font-bold tracking-[0.2em] uppercase text-[#0B4B3F]/70">Artigos e análises · conteúdo GWT Solution</span></div>
</div></section>'''
    cab = soup.find('section')
    cab.insert_after(BeautifulSoup(RADAR, 'html.parser'))
    # a lista de artigos (e seus estados de filtro) encosta no título "Artigos e análises"
    def encostar(raiz):
        for sec in raiz.select('section[data-estados="blog"]'):
            sec['style'] = 'padding-top:2.25rem'
    encostar(soup)
    for tpl in soup.find_all('template', attrs={'data-estado-de': 'blog'}):
        interno = BeautifulSoup(tpl.decode_contents(), 'html.parser'); encostar(interno)
        tpl.clear(); tpl.append(BeautifulSoup(str(interno), 'html.parser'))
    for s in soup.find_all(string=lambda t: t and t.strip().startswith('Análises, teses jurídicas e inteligência tributária da GWT')):
        s.replace_with('Notícias do dia sobre tributação e as análises da GWT Solution, da qual a OficialCert é afiliada.')
    open(c, 'w', encoding='utf-8').write(str(soup))
    print('radar inserido no blog')
