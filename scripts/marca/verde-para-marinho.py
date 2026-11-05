"""Troca a paleta verde (herdada do site da GWT) por azul-marinho, mantendo a luminosidade de cada tom.

Cada cor verde/petróleo (matiz 90°–200°) vira matiz 222° (marinho) com a luminância percebida (WCAG) do original
×0,8 e saturação de no máximo 55% — marinho, não royal; o contraste texto/fundo fica igual ou melhor. a
saturação fica entre 45% e 55% para o marinho não virar royal. Dourado e creme não mudam.
Uso: python3 scripts/marca/verde-para-marinho.py [--aplicar] arquivo_ou_pasta...
"""
import colorsys, os, re, sys

MATIZ = 222 / 360


def _lum(r, g, b):  # luminância relativa (WCAG), r/g/b em 0..1
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def converter(r, g, b):
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if not (90 / 360 <= h <= 200 / 360 and s > 0.12 and l < 0.97):
        return None
    alvo = _lum(r / 255, g / 255, b / 255) * 0.8  # um pouco mais fundo: marinho, não royal
    s2 = min(0.55, max(0.45, s * 0.85))
    # mesma luminância percebida do verde original → o contraste com textos e dourado não muda
    lo, hi = 0.0, 1.0
    for _ in range(40):
        meio = (lo + hi) / 2
        if _lum(*colorsys.hls_to_rgb(MATIZ, meio, s2)) < alvo:
            lo = meio
        else:
            hi = meio
    r2, g2, b2 = colorsys.hls_to_rgb(MATIZ, (lo + hi) / 2, s2)
    return round(r2 * 255), round(g2 * 255), round(b2 * 255)


def hexa(m):
    h = m.group(1)
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    novo = converter(*(int(h[i:i + 2], 16) for i in (0, 2, 4)))
    if not novo:
        return m.group(0)
    out = '#%02x%02x%02x' % novo
    return out.upper() if m.group(1).isupper() else out


def rgb(m):
    novo = converter(*map(int, m.group(2, 3, 4)))
    if not novo:
        return m.group(0)
    return f'{m.group(1)}{novo[0]}{m.group(5)}{novo[1]}{m.group(6)}{novo[2]}'


def oklch(m):  # verdes nomeados do Tailwind (emerald) → matiz azul no oklch
    h = float(m.group(2))
    return m.group(0) if not (120 <= h <= 200) else f'{m.group(1)}{257.4}'


def _oklab_para_srgb(L, a, b):
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3
    lin = (4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
           -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
           -0.0041960863 * l_ - 0.7034186147 * m_ + 1.7076147010 * s_)
    g = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055
    return tuple(max(0, min(255, round(g(max(0.0, c)) * 255))) for c in lin)


def _srgb_para_oklab(r, g, b):
    f = lambda c: c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = f(r / 255), f(g / 255), f(b / 255)
    l = (0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b) ** (1 / 3)
    m = (0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b) ** (1 / 3)
    s = (0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b) ** (1 / 3)
    return (0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
            1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
            0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s)


def oklab(m):  # cores com transparência compiladas pelo Tailwind: oklab(L% a b/alfa)
    L, a, b = float(m.group(1)) / 100, float(m.group(2)), float(m.group(3))
    novo = converter(*_oklab_para_srgb(L, a, b))
    if not novo:
        return m.group(0)
    L2, a2, b2 = _srgb_para_oklab(*novo)
    return f'oklab({L2 * 100:.4f}% {a2:.6f} {b2:.6f}{m.group(4)}'


def trocar(texto):
    texto = re.sub(r'oklab\(([\d.]+)% (-?[\d.]+) (-?[\d.]+)(\s*/[^)]*\)|\))', oklab, texto)
    texto = re.sub(r'#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})(?![0-9a-fA-F])', hexa, texto)
    texto = re.sub(r'(rgba?\(\s*)(\d+)(\s*,\s*|\s+)(\d+)(\s*,\s*|\s+)(\d+)', lambda m: rgb(_ajusta(m)), texto)
    texto = re.sub(r'(oklch\([\d.%]+ [\d.]+ )([\d.]+)', oklch, texto)
    return texto


class _ajusta:  # reorganiza os grupos do rgb() para a função rgb()
    def __init__(self, m):
        self.m = m

    def group(self, *i):
        g = {0: self.m.group(0), 1: self.m.group(1), 2: self.m.group(2), 3: self.m.group(4), 4: self.m.group(6),
             5: self.m.group(3), 6: self.m.group(5)}
        return g[i[0]] if len(i) == 1 else tuple(g[k] for k in i)


if __name__ == '__main__':
    aplicar = '--aplicar' in sys.argv
    alvos = [a for a in sys.argv[1:] if a != '--aplicar']
    arquivos = []
    for a in alvos:
        if os.path.isdir(a):
            for raiz, _, nomes in os.walk(a):
                if os.sep + 'clientes' in raiz:
                    continue  # logos de terceiros ficam como são
                arquivos += [os.path.join(raiz, n) for n in nomes if n.endswith(('.html', '.css', '.js', '.svg', '.py', '.mjs'))]
        else:
            arquivos.append(a)
    total = 0
    for f in arquivos:
        s = open(f, encoding='utf-8').read()
        s2 = trocar(s)
        if s2 != s:
            n = sum(1 for x, y in zip(re.findall(r'#[0-9a-fA-F]{3,6}|rgba?\([^)]*|okl(?:ch|ab)\([^)]*', s), re.findall(r'#[0-9a-fA-F]{3,6}|rgba?\([^)]*|okl(?:ch|ab)\([^)]*', s2)) if x != y)
            total += n
            print(f'{n:5d}  {f}')
            if aplicar:
                open(f, 'w', encoding='utf-8').write(s2)
    print('cores trocadas:', total, '' if aplicar else '(simulação; use --aplicar)')
