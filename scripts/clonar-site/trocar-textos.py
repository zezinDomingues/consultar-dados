"""Troca os textos herdados do site da GWT pelos da OficialCert.

- tira números e afirmações que são da GWT (R$ 1 bi+, 200+ empresas, 100%, 8 unidades,
  prazos de 48 h, "90%"/"40%" nos artigos, "risco zero"/"glosa zero");
- mantém o carrossel "Empresas que confiam na GWT" (clientes da GWT, creditados a ela);
- deixa explícito que a OficialCert é AFILIADA da GWT Solution (tecnologia 360Corp e
  metodologia GWT; atendimento OficialCert); artigos e eventos ficam creditados à GWT;
- páginas legais passam a falar em nome da OficialCert (revisar com jurídico).

Rodar a partir da raiz do projeto:  python3 scripts/clonar-site/trocar-textos.py
Cada regra informa quantas vezes casou; regra com 0 aparece como AVISO.
"""
import glob
import os
import re
from collections import Counter

from bs4 import BeautifulSoup, Comment, NavigableString

SITE = os.path.join(os.path.dirname(__file__), '..', '..', 'public', 'site')
EMAIL = 'contato@oficialcert.com'
hits = Counter()


def frag(html):
    return BeautifulSoup(html, 'html.parser')


def texto(el):
    return ' '.join(el.get_text(' ').split())


# ------------------------------------------------------------------ regras de elemento inteiro
# (tags, começo do texto atual, novo HTML interno)
ELEMENTOS = [
    # rodapé (todas as páginas)
    (['p'], 'Inteligência tributária proprietária. Mais de',
     'Inteligência tributária com a tecnologia e a metodologia da GWT Solution, da qual a OficialCert é afiliada. '
     'Segurança normativa em cada etapa.'),
    (['p'], 'A GWT Solution é uma consultoria de estratégia empresarial',
     'A OficialCert é afiliada da GWT Solution (GWT Smart Business Solutions), responsável pela plataforma 360Corp '
     'e pela metodologia aplicada nos diagnósticos e projetos. A GWT Solution é uma consultoria de estratégia '
     'empresarial, inteligência de dados e tecnologia. Serviços privativos de advocacia são prestados exclusivamente '
     'por escritórios parceiros homologados e registrados em seus respectivos conselhos de classe.'),

    # home
    (['p'], 'A GWT integra inteligência fiscal aos seus sistemas',
     'A <strong class="text-white font-semibold">OficialCert</strong>, afiliada da '
     '<strong class="text-white font-semibold">GWT Solution</strong>, integra inteligência fiscal aos seus '
     '<strong class="text-white font-medium">sistemas</strong> e viabiliza a '
     '<strong class="text-white font-medium">antecipação</strong> de créditos tributários, com a tecnologia e a metodologia GWT.'),
    (['p'], 'Isso não é marketing. É mais de',
     'Como afiliada da <strong class="font-semibold text-[#0B3C34]">GWT Solution</strong>, a OficialCert opera com a '
     'mesma tecnologia e a mesma esteira de validação. Cada real identificado passa por validação jurídica, normativa '
     'e processual antes de chegar até você.'),
    (['p'], 'O ecossistema proprietário da GWT integra',
     'O ecossistema da GWT Solution, que a OficialCert leva até a sua empresa, integra camadas de processamento '
     'algorítmico, auditoria jurídica sênior e engenharia de sistemas.'),
    (['p'], 'Adequação sistêmica para a Reforma Tributária 26/27',
     'Adequação sistêmica para a <strong>Reforma Tributária 26/27</strong> e faturamento contínuo (NFe, CTe) integrado '
     'aos ERPs SAP, Oracle, Totvs e Infor, apoiado pela software house da GWT Solution e pela certificação Thomson Reuters.'),
    (['p'], 'Reconstruímos a arquitetura fiscal da sua empresa e viabilizamos',
     'Reconstruímos a arquitetura fiscal da sua empresa e viabilizamos a antecipação de créditos de ressarcimento de '
     'PIS/COFINS, gerando caixa com segurança normativa.'),
    (['p'], 'Garantimos compliance absoluto e a adequação tecnológica',
     'Apoiamos o compliance e a adequação tecnológica de faturamento para as exigências da Reforma Tributária 26/27, '
     'integrando dados sistêmicos diretamente em ERPs SAP, Oracle, Totvs e Infor.'),
    (['p'], 'Algoritmos tributários proprietários + Data Lake exclusivo',
     'Algoritmos tributários proprietários + Data Lake exclusivo + auditoria integrada. Desenvolvido pela GWT Solution '
     'e levado até a sua empresa pela OficialCert, para encontrar resultados onde outras ferramentas falham.'),
    (['p'], 'Deixe seus dados e um especialista da GWT entra em contato',
     'Deixe seus dados e um especialista da OficialCert entra em contato para entender a sua operação fiscal e '
     'apresentar os caminhos aplicáveis ao seu negócio.'),

    # quem somos
    (['h2'], 'A GWT nasceu de uma convicção',
     'A OficialCert nasceu de uma convicção:<br/><span class="text-[#0B4B3F]/70 font-normal italic">decisões fiscais '
     'exigem tecnologia de ponta e estabilidade operacional.</span>'),
    (['p'], 'Enquanto consultorias tradicionais analisam obrigações fiscais',
     'Por isso somos <strong>afiliados da GWT Solution</strong>. Enquanto consultorias tradicionais analisam obrigações '
     'fiscais de forma isolada, a GWT opera como uma parceira de tecnologia e liquidez: estruturou sua própria software '
     'house e se certificou em soluções globais como Thomson Reuters para integrar inteligência tributária diretamente '
     'aos ERPs (SAP, Oracle, Totvs, Infor) das empresas.'),
    (['p'], 'Além de garantir conformidade e faturamento contínuo',
     'Como afiliada, a OficialCert leva essa estrutura até a sua empresa: conformidade e faturamento contínuo durante a '
     'transição da <strong>Reforma Tributária 26/27</strong> e fluxo de caixa direto através da antecipação de '
     'ressarcimentos de PIS e COFINS.'),
    (['p'], 'Operamos sob a premissa de risco zero',
     'Do primeiro contato à conclusão de cada etapa, você conta com o nosso atendimento próximo e com a validação '
     'jurídica tributária sênior da rede GWT.'),
    (['p'], 'Um time multidisciplinar que combina estratégia tributária',
     'A OficialCert é afiliada da GWT Solution. Conheça o time multidisciplinar que conduz a estratégia, a auditoria e '
     'a tecnologia por trás do nosso trabalho.'),

    # eventos
    (['p'], 'Evento exclusivo para profissionais que desejam conhecer a tecnologia aplicada da GWT',
     'Evento da GWT Solution para profissionais que desejam conhecer a tecnologia aplicada no processo de recuperação '
     'tributária. Voltado para quem atende clientes PJ (B2B) e deseja incluir essas oportunidades em seu portfólio.'),

    # seja um parceiro
    (['p'], 'Credenciamos contabilidades, escritórios de advocacia',
     'Como afiliada da GWT Solution, a OficialCert conecta contabilidades, escritórios de advocacia, consultores '
     'empresariais e assessores financeiros ao motor de inteligência tributária da GWT, para que você gere valor '
     'imediato na sua carteira de clientes.'),
    (['p'], 'Preencha o formulário com o perfil da sua empresa. Nossa equipe comercial',
     'Preencha o formulário com o perfil da sua empresa. Nossa equipe avaliará a aderência da sua carteira e retornará '
     'com os próximos passos do credenciamento.'),
    (['p'], 'Receba acesso à plataforma 360Corp e treinamento técnico',
     'Receba acesso à plataforma 360Corp e treinamento técnico sobre as teses de recuperação de ICMS e monofásicos. '
     'Fornecemos o material de abordagem comercial.'),
    (['p'], 'Rode diagnósticos rápidos de CNPJ',
     'Rode diagnósticos rápidos de CNPJ para a sua base de clientes, identifique créditos tributários de forma '
     'automatizada e seja remunerado de forma recorrente sobre os créditos homologados, conforme as regras do programa.'),
    (['p'], 'Nossa equipe de expansão analisará o seu perfil',
     'Nossa equipe analisará o seu perfil de credenciamento e entrará em contato em breve.'),

    # blog (listagem e artigos)
    (['p'], 'De planilhas estáticas a algoritmos velozes',
     'De planilhas estáticas a algoritmos velozes que processam milhões de notas fiscais em minutos. A trajetória '
     'tecnológica por trás da plataforma 360Corp.'),
    (['blockquote', 'p'], '"Quem audita tributos por amostragem perde mais de 40%',
     '"Quem audita tributos por amostragem perde boa parte das oportunidades. A essência do crédito reside no '
     'cruzamento do nível de item e notas parciais do SPED."'),
    (['p'], 'Nosso motor de auditoria eletrônica varre 100% da escrituração',
     'O motor de auditoria eletrônica da GWT varre a escrituração e as notas de entrada e saída dos últimos 5 anos, '
     'comparando com decisões do CARF e jurisprudência de tribunais superiores, para sustentar a recuperação e a '
     'blindagem legal do crédito levantado.'),

    # política de privacidade
    (['p'], 'A GWT Smart Business Solutions ("nós"',
     f'A OficialCert ("nós", "nosso" ou "OficialCert"), afiliada da GWT Solution (GWT Smart Business Solutions), está '
     'comprometida em proteger sua privacidade. Esta Política de Privacidade explica como coletamos, usamos, divulgamos '
     'e protegemos suas informações quando você visita nosso site e utiliza nosso serviço de Diagnóstico de '
     'Inteligência Estratégica.'),
    (['p'], 'A GWT não vende nem aluga seus dados',
     'A OficialCert não vende nem aluga seus dados pessoais a terceiros. Para executar o diagnóstico e os serviços '
     'solicitados, seus dados podem ser compartilhados com a GWT Solution, da qual somos afiliados e que fornece a '
     'tecnologia e a metodologia aplicadas, e com parceiros tecnológicos essenciais para a operação de nossos serviços '
     '(como provedores de e-mail e CRM), sempre sob contratos de confidencialidade e em conformidade com a LGPD.'),
    (['p'], 'De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito',
     'De acordo com a Lei Geral de Proteção de Dados (LGPD), você tem direito de acessar, corrigir, excluir ou '
     f'solicitar a portabilidade de seus dados. Caso deseje exercer algum desses direitos, entre em contato conosco '
     f'através do e-mail: {EMAIL}.'),
    (['p'], 'Entre em contato: contato@gwtsolution.com.br', f'Entre em contato: {EMAIL}'),

    # termos de uso
    (['p'], 'O Diagnóstico de Inteligência Estratégica é gerado com base',
     'O Diagnóstico de Inteligência Estratégica é gerado com base nas informações fornecidas por você e processado '
     'pela tecnologia da GWT Solution, da qual a OficialCert é afiliada. Embora busquemos a máxima precisão, os '
     'resultados são insights consultivos e não devem ser interpretados como garantia de resultados futuros ou '
     'aconselhamento legal/contábil final sem análise aprofundada por nossos consultores.'),
]

# ------------------------------------------------------------------ regras de texto exato (nó de texto inteiro)
EXATOS = {
    'O que a GWT faz': 'O que fazemos',
    'Como a GWT funciona': 'Como funciona',
    'Fale com a GWT': 'Fale com a OficialCert',
    '© 2026 GWT Smart Business Solutions': '© 2026 OficialCert · Afiliada GWT Solution',
    'Segurança jurídica total': 'Afiliada GWT Solution',
    'Resultados homologados': 'Validação jurídica',
    # quem somos
    'Somos engenheiros do potencial tributário.': 'Somos afiliados da GWT Solution.',
    'Inteligência Proprietária': 'Inteligência GWT',
    'Estrutura 360Corp de IA e Data Lake fiscal exclusivo operado de ponta a ponta.':
        'Estrutura 360Corp de IA e Data Lake fiscal da GWT Solution, operada de ponta a ponta.',
    'Liderança': 'Liderança GWT Solution',
    'Quem conduz a GWT.': 'Quem conduz a tecnologia.',
    # eventos
    'Debates estratégicos sobre inteligência tributária, tecnologia e liquidez corporativa.':
        'Encontros da GWT Solution, da qual a OficialCert é afiliada, sobre inteligência tributária, tecnologia e liquidez corporativa.',
    'Próxima Agenda': 'Agenda recente',
    'Inscrições Abertas': 'Realizado',
    'Garantir Vaga': 'Participar da próxima',
    'Quero participar da próxima': 'Participar da próxima',
    # segmentos
    'GWT para': 'OficialCert para',
    'GWT para Indústria': 'OficialCert para Indústria',
    'GWT para Agronegócio': 'OficialCert para Agronegócio',
    'GWT para Serviços': 'OficialCert para Serviços',
    'GWT para E-commerce': 'OficialCert para E-commerce',
    'GWT para Terceiro Setor': 'OficialCert para Terceiro Setor',
    # parceiro
    'O ecossistema GWT para o seu negócio.': 'O ecossistema GWT, pela OficialCert, para o seu negócio.',
    # blog
    'Blog GWT': 'Blog',
    'Análises, teses jurídicas e inteligência tributária para tomadores de decisão.':
        'Análises, teses jurídicas e inteligência tributária da GWT Solution, da qual a OficialCert é afiliada.',
    'Créditos de PIS/COFINS que 90% das empresas deixam de aproveitar nas suas auditorias':
        'Créditos de PIS/COFINS que a maioria das empresas deixa de aproveitar nas suas auditorias',
    # legais
    'Última atualização: Fevereiro de 2026': 'Última atualização: Novembro de 2026',
}

# ------------------------------------------------------------------ trocas de trecho dentro de um nó de texto
TRECHOS = [
    ('um especialista da GWT Solution entrará em contato', 'um especialista da OficialCert entrará em contato'),
    ('o site da GWT Smart Business Solutions', 'o site da OficialCert'),
    ('software ou metodologia da GWT;', 'software ou metodologia da OficialCert ou da GWT Solution;'),
    ('que a GWT envie o resultado', 'que a OficialCert envie o resultado'),
    ('Os materiais no site da GWT são fornecidos', 'Os materiais no site da OficialCert são fornecidos'),
    ('A GWT não oferece garantias', 'A OficialCert não oferece garantias'),
]

TITULOS = {
    'index.html': 'OficialCert | Afiliada GWT Solution — Inteligência Tributária',
    'blog.html': 'Blog & Inteligência Tributária | OficialCert',
    'diagnostico.html': 'Fale com um Especialista | OficialCert',
    'eventos.html': 'Eventos & Fóruns | OficialCert',
    'politica-de-privacidade.html': 'Política de Privacidade | OficialCert',
    'quem-somos.html': 'Quem Somos | OficialCert — Afiliada GWT Solution',
    'segmentos.html': 'Segmentos de Atuação | Soluções Tributárias Setoriais | OficialCert',
    'seja-um-parceiro.html': 'Seja um Parceiro | OficialCert',
    'termos-de-uso.html': 'Termos de Uso | OficialCert',
}
DESC_PADRAO = ('A OficialCert é afiliada da GWT Solution: inteligência tributária com a plataforma 360Corp para '
               'identificar, validar e antecipar créditos fiscais com segurança normativa.')
DESCRICOES = {
    'diagnostico.html': 'Converse com a equipe da OficialCert, afiliada da GWT Solution, sobre a operação fiscal da sua '
                        'empresa. Preencha seus dados e um especialista entra em contato.',
    'politica-de-privacidade.html': 'Política de Privacidade da OficialCert. Saiba como coletamos, usamos e protegemos '
                                    'suas informações conforme a LGPD.',
    'quem-somos.html': 'Conheça a OficialCert, afiliada da GWT Solution, e a liderança que conduz a tecnologia e a '
                       'metodologia que levamos até a sua empresa.',
    'seja-um-parceiro.html': 'Seja parceiro da OficialCert, afiliada da GWT Solution, e conecte sua carteira de clientes '
                             'ao motor de inteligência tributária 360Corp.',
    'termos-de-uso.html': 'Termos de Uso da OficialCert. Condições de utilização do site e do Diagnóstico de '
                          'Inteligência Estratégica.',
}

PILULA = ('<div class="gwt-anim"><div class="flex items-center gap-3 px-5 py-3 rounded-full bg-[#0B3C34] '
          'hover:bg-[#062E27] transition-colors duration-300"><span class="text-sm font-bold text-white tracking-tight">'
          '{a}</span><span class="text-[10px] font-bold tracking-[0.15em] uppercase text-[#C4B99A]">{b}</span></div></div>')
SECAO_AFILIACAO = (
    '<div class="max-w-6xl mx-auto"><div class="gwt-anim">'
    '<div class="flex items-center gap-3 mb-8"><div class="w-8 h-px bg-[#0B4B3F]/25"></div>'
    '<span class="text-[11px] font-bold tracking-[0.2em] uppercase text-[#0B4B3F]/70">Afiliação</span></div>'
    '<div class="flex flex-wrap items-baseline gap-3 mb-4">'
    '<h2 class="text-[clamp(1.5rem,3vw,2.2rem)] font-bold text-[#0B3C34] tracking-tight font-serif">Afiliada GWT Solution.</h2>'
    '<span class="text-[clamp(1.5rem,3vw,2.2rem)] text-[#0B4B3F]/60 italic font-normal font-serif">'
    'A mesma tecnologia, com atendimento próximo.</span></div>'
    '<p class="text-base text-[#0B3C34]/90 max-w-2xl mb-12 font-medium">A OficialCert é afiliada da GWT Solution '
    '(GWT Smart Business Solutions). Atendemos a sua empresa de ponta a ponta com a plataforma 360Corp, a metodologia e '
    'a esteira de validação desenvolvidas pela GWT.</p></div>'
    '<div class="flex flex-wrap gap-4">'
    + ''.join(PILULA.format(a=a, b=b) for a, b in (
        ('Plataforma 360Corp', 'GWT'),
        ('Metodologia e esteira de validação', 'GWT'),
        ('Pareceres jurídicos', 'Escritórios parceiros'),
        ('Atendimento e acompanhamento', 'OficialCert'),
    ))
    + '</div></div>')


def trocar_nos(raiz, mapa):
    """Troca nós de texto cujo conteúdo (sem espaços nas pontas) está em `mapa`."""
    for s in list(raiz.find_all(string=True)):
        if isinstance(s, Comment) or s.parent.name in ('script', 'style'):
            continue
        k = s.strip()
        if k in mapa:
            s.replace_with(NavigableString(s.replace(k, mapa[k])))
            hits['exato: ' + k[:50]] += 1


def processar(soup, nome):
    # 1) elementos inteiros
    for tags, prefixo, novo in ELEMENTOS:
        for el in soup.find_all(tags):
            if texto(el).startswith(prefixo):
                el.clear()
                el.append(frag(novo))
                hits['elem: ' + prefixo[:50]] += 1
    # 2) nós exatos e trechos
    trocar_nos(soup, EXATOS)
    for s in list(soup.find_all(string=True)):
        if isinstance(s, Comment) or s.parent.name in ('script', 'style'):
            continue
        novo = str(s)
        for a, b in TRECHOS:
            if a in novo:
                novo = novo.replace(a, b)
                hits['trecho: ' + a[:50]] += 1
        if novo != str(s):
            s.replace_with(NavigableString(novo))
    # 3) atributos: alt com "90%", links do WhatsApp com "site da GWT"
    for el in soup.find_all(True):
        alt = el.get('alt')
        if alt and '90% das empresas' in alt:
            el['alt'] = EXATOS['Créditos de PIS/COFINS que 90% das empresas deixam de aproveitar nas suas auditorias']
            hits['alt 90%'] += 1
        href = el.get('href')
        if href and 'site%20da%20GWT' in href:
            el['href'] = href.replace('site%20da%20GWT', 'site%20da%20OficialCert')
            hits['href whatsapp'] += 1

    # 4) estruturas específicas da home
    if nome in ('index.html', 'index.html#template'):
        secoes = soup.find_all('section')
        heroi = secoes[0] if secoes else None
        if heroi is not None and 'R$ 1 bilh' in texto(heroi):
            h1 = heroi.find('h1')
            grande, pequena = h1.find_all('span', recursive=False)[:2]
            # 05/11/2026: "Seus créditos tributários" não cabe numa linha: sai o nowrap, entra a quebra equilibrada
            grande.clear(); grande.append('Seus créditos tributários')
            grande['class'] = [c for c in grande.get('class', []) if c != 'whitespace-nowrap']
            grande['style'] = 'text-wrap:balance'
            pequena.clear(); pequena.append('identificados. Validados. Blindados.')
            trocar_nos(heroi, {'R$ 1 bi+': 'Afiliada', 'Homologados': 'GWT Solution', '200+': '360Corp',
                               'Empresas': 'Plataforma', '100%': 'LGPD', 'Segurança': 'Sigilo'})
            hits['heroi'] += 1
        for sec in secoes:
            t = texto(sec)
            if t.startswith('R$ 1 bi+ Em créditos homologados'):
                trocar_nos(sec, {'R$ 1 bi+': 'Afiliada', 'Em créditos homologados': 'GWT Solution',
                                 '200+': '360Corp', 'Empresas atendidas': 'Plataforma de inteligência',
                                 '8': 'LGPD', 'Unidades no Brasil': 'Sigilo em cada etapa'})
                hits['faixa de números'] += 1
            elif t.startswith('Presença Nacional'):
                sec.clear()
                sec.append(frag(SECAO_AFILIACAO))
                hits['presença nacional -> afiliação'] += 1

    # 5) eventos: o encontro de junho/2026 já passou; botão leva ao programa de parceiros
    if nome == 'eventos.html':
        for a in soup.find_all('a'):
            if texto(a) == 'Participar da próxima':
                a['href'] = '/seja-um-parceiro'
                a.attrs.pop('target', None)
                hits['eventos: botão'] += 1

    # 6) artigos: crédito à GWT
    if nome.startswith('blog/'):
        p = soup.find('p', string=lambda t: t and 'Na GWT Solution, optamos' in t) or None
        for el in soup.find_all('p'):
            t = texto(el)
            if t.startswith('Na GWT Solution, optamos pelo rigor técnico'):
                t = re.sub(r'Esse protocolo rigoroso é a razão pela qual temos mais de .*$',
                           'Esse protocolo rigoroso é o que sustenta a segurança de cada crédito homologado.', t)
                el.clear(); el.append(t)
                hits['artigo: glosa zero'] += 1
        corpo = soup.select_one('article .space-y-6') or soup.select_one('main .space-y-6')
        if corpo is not None and 'Conteúdo produzido pela GWT Solution' not in texto(corpo):
            corpo.append(frag('<p class="text-xs text-[#0B3C34]/75 leading-relaxed font-light pt-6 border-t '
                              'border-[#0B4B3F]/10">Conteúdo produzido pela GWT Solution e publicado pela '
                              'OficialCert, afiliada GWT.</p>'))
            hits['artigo: crédito GWT'] += 1


    # 7) rodapé: o aviso de afiliação precisa ser legível (no original fica a 10% de opacidade)
    rodape = soup.find('footer')
    if rodape is not None:
        for el in rodape.find_all(['p', 'span']):
            t = texto(el)
            cor = None
            if t.startswith('Inteligência tributária com a tecnologia e a metodologia da GWT'):
                cor = 'rgba(213,205,186,.45)'
            elif t.startswith('A OficialCert é afiliada da GWT Solution (GWT Smart') or t.startswith('© 2026 OficialCert'):
                cor = 'rgba(213,205,186,.38)'
            if cor and el.get('style') != f'color:{cor}':
                el['style'] = f'color:{cor}'
                hits['rodapé legível'] += 1


def cabecalho(soup, nome):
    titulo = TITULOS.get(nome)
    if nome.startswith('blog/'):
        h1 = soup.find('h1')
        titulo = f'{texto(h1)} | Blog OficialCert'
    if titulo and soup.title:
        soup.title.string = titulo
        hits['title'] += 1
    meta = soup.find('meta', attrs={'name': 'description'})
    if meta is not None:
        atual = meta.get('content', '')
        if nome in DESCRICOES:
            meta['content'] = DESCRICOES[nome]
        elif 'GWT' in atual or 'bilhão' in atual:
            meta['content'] = DESC_PADRAO
        hits['meta'] += 1
    for c in soup.find_all(string=lambda s: isinstance(s, Comment) and 'gwtsolution.com.br' in s):
        c.replace_with(Comment(' Site institucional OficialCert (afiliada GWT Solution). Para editar textos, altere '
                               'este arquivo ou scripts/clonar-site/trocar-textos.py. '))


for caminho in sorted(glob.glob(os.path.join(SITE, '*.html')) + glob.glob(os.path.join(SITE, 'blog', '*.html'))):
    nome = os.path.relpath(caminho, SITE)
    soup = BeautifulSoup(open(caminho, encoding='utf-8').read(), 'html.parser')
    for tpl in soup.find_all('template'):
        interno = BeautifulSoup(tpl.decode_contents(), 'html.parser')
        processar(interno, nome + '#template')
        tpl.clear()
        tpl.append(BeautifulSoup(str(interno), 'html.parser'))
    processar(soup, nome)
    cabecalho(soup, nome)
    open(caminho, 'w', encoding='utf-8').write(str(soup))

regras = (['elem: ' + p[:50] for _, p, _ in ELEMENTOS] + ['exato: ' + k[:50] for k in EXATOS]
          + ['trecho: ' + a[:50] for a, _ in TRECHOS])
for r in regras:
    if not hits[r]:
        print('AVISO regra sem efeito ->', r)
for k, v in sorted(hits.items()):
    print(f'{v:4d}  {k}')
