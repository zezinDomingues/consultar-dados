"""Monta a cópia estática do site da GWT em public/site/ do projeto.
Entrada: ssr/*.html (HTML que o servidor deles entrega) + estados/* (capturas dos estados interativos).
Saída: public/site/{index,quem-somos,...}.html + css/ + media/ + imagens, prontos para o site.js."""
import json, os, re, sys, urllib.parse, urllib.request
from bs4 import BeautifulSoup, Comment

BASE = 'https://www.gwtsolution.com.br'
AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = '/home/joseo/consultar dados/public/site'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'}

PAGINAS = {  # arquivo ssr -> saída
    'index': 'index', 'quem-somos': 'quem-somos', 'segmentos': 'segmentos', 'eventos': 'eventos',
    'seja-um-parceiro': 'seja-um-parceiro', 'diagnostico': 'diagnostico', 'blog': 'blog',
    'politica-de-privacidade': 'politica-de-privacidade', 'termos-de-uso': 'termos-de-uso',
    'blog__creditos-pis-cofins': 'blog/creditos-pis-cofins', 'blog__icms-st-oportunidades': 'blog/icms-st-oportunidades',
    'blog__reforma-tributaria-impactos': 'blog/reforma-tributaria-impactos',
    'blog__inteligencia-artificial-tributaria': 'blog/inteligencia-artificial-tributaria',
    'blog__planejamento-sucessorio': 'blog/planejamento-sucessorio', 'blog__seguranca-normativa': 'blog/seguranca-normativa',
}

ativos = set()       # caminhos originais (no site deles) a baixar
css_originais = []   # /_next/static/css/*.css

EXT_ATIVO = r'\.(png|jpe?g|webp|svg|gif|ico|avif|mp4|webm|woff2?|ttf|otf)(\?[^"\')\s]*)?$'


def local(caminho):
    """Caminho original do site deles -> caminho na cópia (/site/...)."""
    if caminho.startswith('/_next/image'):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(caminho).query)
        caminho = q['url'][0]
    if caminho.startswith('/_next/static/media/'):
        ativos.add(caminho)
        return '/site/media/' + caminho.rsplit('/', 1)[1]
    if caminho.startswith('/_next/static/css/'):
        if caminho not in css_originais: css_originais.append(caminho)
        return '/site/css/' + caminho.rsplit('/', 1)[1]
    sem_q = caminho.split('?')[0]
    ativos.add(sem_q)
    return '/site' + sem_q


def eh_ativo(v):
    return v.startswith('/') and not v.startswith('//') and (v.startswith('/_next/') or re.search(EXT_ATIVO, v))


def trocar_urls_css(texto):
    def rep(m):
        u = m.group(2)
        if u.startswith('/') and eh_ativo(u):
            return f'url({m.group(1)}{local(u)}{m.group(1)})'
        return m.group(0)
    return re.sub(r'url\((["\']?)([^)"\']+)\1\)', rep, texto)


def slot_logo(soup, img):
    """Troca a <img> do logo por um espaço vazio do mesmo tamanho."""
    w, h = img.get('width'), img.get('height')
    span = soup.new_tag('span')
    span['class'] = img.get('class', [])
    span['data-logo-slot'] = ''
    span['aria-label'] = 'Logo'
    estilo = 'display:inline-block;vertical-align:middle'
    # A logo original é 1921x1081 (16:9) e o navegador usa essa proporção; só no
    # rodapé (h-9 opacity-50) o original renderiza 144x36, igual aos atributos.
    if 'opacity-50' in img.get('class', []) and w and h:
        estilo += f';aspect-ratio:{w}/{h}'
    else:
        estilo += ';aspect-ratio:1921/1081'
    span['style'] = estilo
    img.replace_with(span)
    span.insert_before(Comment(' LOGO: coloque aqui a sua logo (ex.: <img src="/site/sua-logo.png" ...>) '))


def processar(soup_ou_tag, soup):
    raiz = soup_ou_tag
    for t in raiz.find_all(['script', 'noscript', 'next-route-announcer']):
        t.decompose()
    for t in raiz.find_all('link'):
        rel = ' '.join(t.get('rel', []))
        if any(k in rel for k in ('preload', 'modulepreload', 'prefetch', 'icon', 'apple-touch-icon', 'manifest', 'canonical')):
            t.decompose()
    # logos e emblema (símbolo da marca)
    for img in raiz.find_all('img'):
        src = img.get('src', '')
        if 'gwt-logo' in src or 'gwt-logo' in urllib.parse.unquote(src):
            slot_logo(soup, img)
    for emb in raiz.find_all(attrs={'aria-label': re.compile('Brasão')}):
        caixa = emb.parent
        caixa.clear()
        caixa['data-logo-slot'] = 'emblema'
        caixa.insert(0, Comment(' EMBLEMA: espaço do símbolo grande da marca (estava o brasão 3D da GWT) '))
    for img in raiz.find_all('img'):
        if img.get('src', '').split('?')[0] in ('/Rectangle.svg', '/Rectangle-base.svg', '/Rectangle-chevron.svg'):
            caixa = img.parent
            img.decompose()
            caixa['data-logo-slot'] = 'marca-dagua'
    # imagens
    for img in raiz.find_all(['img', 'source']):
        for at in ('srcset', 'sizes'):
            if img.has_attr(at): del img[at]
        if img.get('src') and eh_ativo(img['src']):
            img['src'] = local(img['src'])
    # atributos com URL e estilos inline
    for t in raiz.find_all(True):
        for at in ('href', 'poster', 'xlink:href', 'data-src'):
            v = t.get(at)
            if not v or not isinstance(v, str): continue
            if v.startswith('https://crm.gwtsolution.com.br'):
                t[at] = '/login'
            elif v.startswith(BASE):
                t[at] = v[len(BASE):] or '/'
            elif eh_ativo(v):
                t[at] = local(v)
        if t.get('style') and 'url(' in t['style']:
            t['style'] = trocar_urls_css(t['style'])
        st = t.get('style', '')
        if isinstance(st, str) and re.search(r'opacity:\s*0(?![.\d])', st):
            t['class'] = t.get('class', []) + ['gwt-anim']
    for st in raiz.find_all('style'):
        if st.string: st.string = trocar_urls_css(st.string)
    # atributos internos do React/Next que não servem para nada aqui
    for t in raiz.find_all(True):
        for at in list(t.attrs):
            if at.startswith('data-nimg') or at in ('data-precedence', 'data-dgst'):
                del t[at]
    return raiz


def fragmento(html):
    s = BeautifulSoup(html, 'html.parser')
    processar(s, s)
    for i in s.find_all('input'):  # estados capturados vinham com o que eu digitei
        if i.has_attr('value') and i.get('type') not in ('submit', 'button', 'hidden'): del i['value']
    for i in s.find_all('textarea'): i.string = ''
    return str(s)


def secao_do_botao(soup, texto):
    for b in soup.find_all('button'):
        if re.sub(r'\s+', ' ', b.get_text(' ', strip=True)) == texto or b.get('aria-label') == texto:
            return b.find_parent('section')
    return None


def montar(nome_ssr, nome_saida):
    ori = open(os.path.join(AQUI, 'ssr', nome_ssr + '.html'), encoding='utf-8').read()
    soup = BeautifulSoup(ori, 'html.parser')
    titulo = soup.title.string if soup.title else 'GWT Solution'
    desc = soup.find('meta', attrs={'name': 'description'})
    css_links = [l['href'] for l in soup.find_all('link', rel='stylesheet')]
    estilos_head = [str(s) for s in soup.head.find_all('style')]
    for s in estilos_head and soup.head.find_all('style'):
        pass
    html_cls = ' '.join(soup.html.get('class', []))
    body = soup.body
    body_cls = ' '.join(body.get('class', []))
    processar(body, soup)
    templates = []

    # formulários
    for f in body.find_all('form'):
        if nome_ssr == 'seja-um-parceiro':
            f['data-form'] = 'parceiro'
            f.parent.parent['data-parceiro-wrapper'] = ''
        else:
            f['data-form'] = 'contato'
            f['data-origem'] = 'site_contato_home' if nome_ssr == 'index' else 'site_contato'

    # estados por botão (abas, filtros, ver mais clientes)
    def anexar_estados(chave, arquivo_json, extrair=lambda d: d):
        estados = extrair(json.load(open(os.path.join(AQUI, 'estados', arquivo_json), encoding='utf-8')))
        primeiro = next(iter(estados))
        sec = secao_do_botao(body, primeiro)
        if not sec:
            print('  !! seção não encontrada para', chave, primeiro); return
        sec['data-estados'] = chave
        for botao, html in estados.items():
            frag = BeautifulSoup(fragmento(html), 'html.parser')
            s2 = frag.find('section')
            if s2: s2['data-estados'] = chave
            templates.append(f'<template data-estado-de="{chave}" data-botao="{botao}">{str(frag)}</template>')

    if nome_ssr == 'segmentos':
        anexar_estados('segmentos', 'estados-segmentos.json')
    if nome_ssr == 'blog':
        anexar_estados('blog', 'estados-blog.json')
    if nome_ssr == 'index':
        anexar_estados('clientes', 'clientes-mobile.json', lambda d: {'Ver mais clientes': d['secao']})
        fh = json.load(open(os.path.join(AQUI, 'estados', 'form-home.json'), encoding='utf-8'))
        templates.append(f'<template id="tpl-sucesso-contato" data-indice="{fh["bannerIndex"]}">{fragmento(fh["bannerHtml"])}</template>')
    if nome_ssr == 'diagnostico':
        fd = json.load(open(os.path.join(AQUI, 'estados', 'form-diagnostico.json'), encoding='utf-8'))
        templates.append(f'<template id="tpl-sucesso-contato" data-indice="{fd["bannerIndex"]}">{fragmento(fd["bannerHtml"])}</template>')
    if nome_ssr == 'seja-um-parceiro':
        fp = json.load(open(os.path.join(AQUI, 'estados', 'form-parceiro.json'), encoding='utf-8'))
        templates.append(f'<template id="tpl-sucesso-parceiro">{fragmento(fp["wrapper"])}</template>')
    # menu do celular (todas as páginas com cabeçalho)
    if body.find(attrs={'aria-label': 'Abrir menu'}):
        templates.append(f'<template id="tpl-menu-mobile">{fragmento(open(os.path.join(AQUI, "estados", "menu-mobile.html"), encoding="utf-8").read())}</template>')

    head = ['<meta charset="utf-8"/>', '<meta name="viewport" content="width=device-width, initial-scale=1"/>',
            f'<title>{titulo}</title>']
    if desc: head.append(f'<meta name="description" content="{desc["content"]}"/>')
    head.append('<link rel="icon" href="/icon.svg"/>')
    head += [f'<link rel="stylesheet" href="{local(h)}"/>' for h in css_links]
    head.append('<link rel="stylesheet" href="/site/site.css"/>')
    head += [trocar_urls_css(s) for s in estilos_head]

    corpo = body.decode_contents()  # str() de um Comment perde o <!-- -->: virava texto "$/$" na página
    pagina = (f'<!DOCTYPE html>\n<!-- Cópia do site gwtsolution.com.br montada em 04/11/2026 (scripts/site no scratchpad). '
              f'Para editar textos, altere este arquivo. -->\n<html lang="pt-BR" class="{html_cls}"><head>{"".join(head)}</head>'
              f'<body class="{body_cls}">{corpo}{"".join(templates)}<script src="/site/site.js" defer></script></body></html>')
    destino = os.path.join(SAIDA, nome_saida + '.html')
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    open(destino, 'w', encoding='utf-8').write(pagina)
    print(f'{nome_saida}.html  {len(pagina)//1024} KB  templates={len(templates)}')


def baixar(orig, destino):
    if os.path.exists(destino): return True
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    try:
        req = urllib.request.Request(BASE + urllib.parse.quote(orig, safe='/?=&%.-_~'), headers=UA)
        dados = urllib.request.urlopen(req, timeout=30).read()
        open(destino, 'wb').write(dados)
        return True
    except Exception as e:
        print('  !! falha ao baixar', orig, e)
        return False


if __name__ == '__main__':
    os.makedirs(SAIDA, exist_ok=True)
    for a, b in PAGINAS.items():
        montar(a, b)
    # CSS: baixa, troca url() internas e registra fontes/imagens que ele usa
    for c in css_originais:
        req = urllib.request.Request(BASE + c, headers=UA)
        texto = urllib.request.urlopen(req, timeout=30).read().decode('utf-8')
        texto = trocar_urls_css(texto)
        destino = os.path.join(SAIDA, 'css', c.rsplit('/', 1)[1])
        os.makedirs(os.path.dirname(destino), exist_ok=True)
        open(destino, 'w', encoding='utf-8').write(texto)
        print('css', c.rsplit('/', 1)[1], len(texto) // 1024, 'KB')
    ok = falha = 0
    for a in sorted(ativos):
        if a.startswith('/_next/static/media/'):
            destino = os.path.join(SAIDA, 'media', a.rsplit('/', 1)[1])
        else:
            destino = SAIDA + a
        if 'gwt-logo' in a or a.split('?')[0] in ('/Rectangle.svg', '/Rectangle-base.svg', '/Rectangle-chevron.svg'):
            continue  # logo e emblema não vêm
        if baixar(a, destino): ok += 1
        else: falha += 1
    print(f'ativos: {ok} baixados, {falha} falhas')
