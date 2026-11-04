// Captura os estados interativos do site original SEM enviar nada para a GWT:
// chamadas ao Supabase e a /api/* deles são respondidas localmente, window.open é desligado.
import { createRequire } from 'module'
import fs from 'fs'
const require = createRequire('/home/joseo/smartranch_dasboard_21082026/package.json')
const puppeteer = require('puppeteer-core')

const BASE = 'https://www.gwtsolution.com.br'
const OUT = '/tmp/claude-1000/-home-joseo/3462de4f-4dfc-4baf-a791-59576e027591/scratchpad/gwt/estados/'
fs.mkdirSync(OUT, { recursive: true })
const espera = ms => new Promise(r => setTimeout(r, ms))
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] })

async function novaPagina(largura = 1440) {
  const ctx = await b.createBrowserContext()
  const p = await ctx.newPage()
  await p.setViewport({ width: largura, height: 900 })
  await p.setRequestInterception(true)
  p.on('request', r => {
    const u = r.url()
    if (/supabase\.co/.test(u) && r.method() !== 'GET' && r.method() !== 'OPTIONS') {
      return r.respond({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '[]' })
    }
    if (/supabase\.co/.test(u) && r.method() === 'OPTIONS') {
      return r.respond({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    }
    if (u.startsWith(BASE + '/api/')) return r.respond({ status: 200, contentType: 'application/json', body: '{"ok":true}' })
    if (/wa\.me|whatsapp/.test(u)) return r.abort()
    r.continue()
  })
  await p.evaluateOnNewDocument(() => { window.open = () => ({ closed: false }) })
  return { ctx, p }
}

async function rolarTudo(p) {
  const h = await p.evaluate(() => document.body.scrollHeight)
  for (let y = 0; y < h; y += 500) { await p.evaluate(v => window.scrollTo(0, v), y); await espera(150) }
  await espera(1200); await p.evaluate(() => window.scrollTo(0, 0)); await espera(400)
}

const salvar = (nome, conteudo) => fs.writeFileSync(OUT + nome, conteudo)
const log = (...a) => console.log(...a)

// 1) fotos de referência de todas as páginas
const PAGINAS = ['/', '/quem-somos', '/segmentos', '/eventos', '/seja-um-parceiro', '/diagnostico', '/blog',
  '/blog/creditos-pis-cofins', '/blog/icms-st-oportunidades', '/blog/reforma-tributaria-impactos',
  '/blog/inteligencia-artificial-tributaria', '/blog/planejamento-sucessorio', '/blog/seguranca-normativa',
  '/politica-de-privacidade', '/termos-de-uso']
if (!process.env.SEM_FOTOS) {
  for (const pg of PAGINAS) {
    const { ctx, p } = await novaPagina()
    await p.goto(BASE + pg, { waitUntil: 'networkidle0', timeout: 60000 })
    await rolarTudo(p)
    const nome = pg === '/' ? 'index' : pg.slice(1).replace(/\//g, '__')
    await p.screenshot({ path: OUT + `foto-${nome}.png`, fullPage: true })
    log('foto', pg)
    await ctx.close()
  }
}

// 2) menu do celular aberto
if (!process.env.SEM_FOTOS) {
  const { ctx, p } = await novaPagina(390)
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await p.click('button[aria-label="Abrir menu"]'); await espera(700)
  const html = await p.evaluate(() => document.querySelector('button[aria-label="Fechar menu"]').closest('div.fixed').outerHTML)
  salvar('menu-mobile.html', html); log('menu mobile', html.length)
  await p.screenshot({ path: OUT + 'foto-menu-mobile.png' })
  await ctx.close()
}

// 3) janela "Ver mais clientes"
{
  const { ctx, p } = await novaPagina()
  await p.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const antes = await p.evaluate(() => [...document.body.children].length)
  await p.evaluate(() => document.querySelector('button[aria-label="Ver mais clientes"]').scrollIntoView({ block: 'center' }))
  await espera(500)
  await p.evaluate(() => document.querySelector('button[aria-label="Ver mais clientes"]').click()); await espera(1500)
  const html = await p.evaluate(antes => {
    const novos = [...document.body.children].slice(antes)
    const fixo = [...document.querySelectorAll('div.fixed, [role=dialog]')].filter(e => e.offsetParent !== null || getComputedStyle(e).position === 'fixed')
      .filter(e => /inset-0/.test(e.className) && !e.querySelector('[aria-label="Fechar menu"]'))
    const alvo = fixo.sort((a, b) => b.outerHTML.length - a.outerHTML.length)[0]
    return JSON.stringify({ novos: novos.map(n => n.outerHTML.slice(0, 200)), alvo: alvo ? alvo.outerHTML : null,
      fechar: alvo ? [...alvo.querySelectorAll('button')].map(b => b.getAttribute('aria-label') || b.innerText) : [] })
  }, antes)
  salvar('clientes-modal.json', html); log('modal clientes', JSON.parse(html).fechar, (JSON.parse(html).alvo || '').length)
  await p.screenshot({ path: OUT + 'foto-modal-clientes.png' })
  await ctx.close()
}

// 4) formulários: estado de sucesso
async function formSucesso(pagina, nome, campos, seletorEnviar) {
  const { ctx, p } = await novaPagina()
  await p.goto(BASE + pagina, { waitUntil: 'networkidle0' })
  const form = await p.$('form'); await form.evaluate(f => f.scrollIntoView({ block: 'center' })); await espera(600)
  for (const [ph, valor] of campos) {
    const el = await p.$(`form [placeholder="${ph}"]`)
    if (el) await el.type(valor); else log('  campo não achado', ph)
  }
  const sel = await p.$$('form select'); for (const s of sel) await s.evaluate(e => { e.selectedIndex = 1; e.dispatchEvent(new Event('change', { bubbles: true })) })
  const pai = await p.evaluate(() => { const f = document.querySelector('form'); f.parentElement.parentElement.setAttribute('data-cap', '1'); return f.parentElement.parentElement.outerHTML.length })
  await p.click(seletorEnviar); await espera(2500)
  const r = await p.evaluate(() => {
    const cap = document.querySelector('[data-cap]')
    const sucesso = [...document.querySelectorAll('*')].filter(e => /sucesso|Recebida/.test(e.textContent) && e.children.length < 6 && /Contato enviado|Solicita/.test(e.textContent)).sort((a, b) => a.textContent.length - b.textContent.length)[0]
    let banner = sucesso; const f = document.querySelector('form')
    if (f && sucesso && f.contains(sucesso)) { while (banner.parentElement !== f) banner = banner.parentElement }
    return { wrapper: cap ? cap.innerHTML : null, bannerHtml: f && banner && f.contains(banner) ? banner.outerHTML : null,
      bannerIndex: f && banner && f.contains(banner) ? [...f.children].indexOf(banner) : -1, temForm: !!f }
  })
  salvar(`form-${nome}.json`, JSON.stringify(r)); log('form', nome, 'banner?', !!r.bannerHtml, 'idx', r.bannerIndex, 'form ainda existe?', r.temForm)
  await p.screenshot({ path: OUT + `foto-form-${nome}.png` })
  await ctx.close()
}
await formSucesso('/', 'home', [['Seu nome completo', 'Teste Clone'], ['Empresa', 'Empresa Teste'], ['E-mail corporativo', 'teste@exemplo.com'], ['WhatsApp', '11999999999']], 'form button[type=submit]')
await formSucesso('/diagnostico', 'diagnostico', [['João da Silva', 'Teste Clone'], ['Razão social ou nome fantasia', 'Empresa Teste'], ['nome@empresa.com.br', 'teste@exemplo.com'], ['(00) 00000-0000', '11999999999']], 'form button[type=submit]')
await formSucesso('/seja-um-parceiro', 'parceiro', [['Seu nome completo', 'Teste Clone'], ['E-mail corporativo', 'teste@exemplo.com'], ['WhatsApp para contato', '11999999999'], ['Nome da sua empresa/escritório', 'Empresa Teste']], 'form button[type=submit]')

// 5) abas de Segmentos e filtros do Blog
async function estadosPorBotao(pagina, nome, textos) {
  const { ctx, p } = await novaPagina()
  await p.goto(BASE + pagina, { waitUntil: 'networkidle0' }); await rolarTudo(p)
  const estados = {}
  for (const t of textos) {
    const ok = await p.evaluate(t => {
      const bt = [...document.querySelectorAll('button')].find(b => b.innerText.replace(/\s+/g, ' ').trim() === t)
      if (!bt) return false
      bt.scrollIntoView({ block: 'center' }); bt.click(); return true
    }, t)
    if (!ok) { log('  botão não achado', t); continue }
    await espera(1300)
    estados[t] = await p.evaluate(t => {
      const bt = [...document.querySelectorAll('button')].find(b => b.innerText.replace(/\s+/g, ' ').trim() === t)
      return bt.closest('section').outerHTML
    }, t)
  }
  salvar(`estados-${nome}.json`, JSON.stringify(estados)); log('estados', nome, Object.keys(estados))
  await ctx.close()
}
await estadosPorBotao('/segmentos', 'segmentos', ['01 Varejo', '02 Indústria', '03 Agronegócio', '04 Serviços', '05 E-commerce', '06 Terceiro Setor'])
await estadosPorBotao('/blog', 'blog', ['Todos', 'Reforma Tributária', 'PIS/COFINS', 'ICMS', 'Tecnologia', 'Patrimônio', 'Segurança'])

// 6) botão só com ícone dos artigos
{
  const { ctx, p } = await novaPagina()
  await p.goto(BASE + '/blog/creditos-pis-cofins', { waitUntil: 'networkidle0' })
  const info = await p.evaluate(() => [...document.querySelectorAll('button')].filter(b => !b.innerText.trim() && b.getAttribute('aria-label') !== 'Abrir menu').map(b => b.outerHTML.slice(0, 600)))
  log('botão-ícone do artigo:', info)
  await ctx.close()
}
await b.close()
