"""04/11/2026: tira os artigos antigos (GWT) — o blog e a home passam a mostrar só o Radar tributário."""
import glob, os
from bs4 import BeautifulSoup

SITE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'site')
ESQ = ''.join('<div class="radar-card radar-esqueleto"></div>' for _ in range(3))

# blog: some a lista de artigos (e os estados dos filtros) e o título "Artigos e análises"
c = os.path.join(SITE, 'blog.html')
soup = BeautifulSoup(open(c, encoding='utf-8').read(), 'html.parser')
for el in soup.select('section[data-estados="blog"]') + soup.find_all('template', attrs={'data-estado-de': 'blog'}):
    el.decompose()
for s in soup.find_all(string=lambda t: t and 'Artigos e análises' in t):
    s.find_parent('div').decompose()
for s in soup.find_all(string=lambda t: t and t.strip().startswith('Notícias do dia sobre tributação e as análises')):
    s.replace_with('Notícias do dia sobre tributação, selecionadas automaticamente e sempre dentro do tema.')
radar = soup.select_one('section[data-radar]')
radar['style'] = 'padding-top:5rem;padding-bottom:6rem'
open(c, 'w', encoding='utf-8').write(str(soup))

# home: a vitrine "Blog" (3 artigos) vira as 3 notícias mais recentes do radar
c = os.path.join(SITE, 'index.html')
soup = BeautifulSoup(open(c, encoding='utf-8').read(), 'html.parser')
for sec in soup.find_all('section'):
    if sec.find('a', href='/blog/reforma-tributaria-impactos'):
        sec.find(string=lambda t: t and t.strip() == 'Inteligência & Conteúdo').replace_with('Radar tributário')
        sec.find('h2').string = 'Notícias do dia'
        ver = sec.find('a', href='/blog')
        for t in ver.find_all(string=lambda t: t and 'Ver todos os artigos' in t):
            t.replace_with('Ver todas as notícias')
        grade = sec.find('div', class_='grid')
        grade.replace_with(BeautifulSoup(f'<div data-radar="" data-radar-limite="3" data-radar-escuro=""><div data-radar-lista="" class="radar-grade" aria-live="polite">{ESQ}</div></div>', 'html.parser'))
        print('vitrine da home trocada')
open(c, 'w', encoding='utf-8').write(str(soup))

for f in glob.glob(os.path.join(SITE, 'blog', '*.html')) + glob.glob(os.path.join(SITE, 'blog-*.png')):
    os.remove(f)
