/* Comportamento do site institucional (cópia do gwtsolution.com.br).
 * Substitui o JavaScript do React do original, reproduzindo o mesmo comportamento:
 * animações de entrada, menu do celular, abas/filtros,
 * formulários (WhatsApp + registro do contato) e compartilhar artigo. */
(function () {
  'use strict'

  // ================= CONFIGURAÇÃO — troque pelos seus dados =================
  // WhatsApp da OficialCert (só dígitos, com 55 + DDD). VAZIO por enquanto (04/11/2026): os formulários
  // só gravam o contato em leads_site e mostram "entraremos em contato". Preenchido, o fluxo do
  // WhatsApp (abrir conversa + botão "Reabrir WhatsApp") volta sozinho.
  var WHATSAPP = ''
  // Mensagem de abertura da conversa (mesma ordem de campos do original).
  var MENSAGEM_ABERTURA = 'Olá! Preenchi o formulário no site da OficialCert e gostaria de falar com um especialista.'
  var ENDPOINT_LEAD = '/api/publico/lead'
  // ==========================================================================

  var texto = function (el) {
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  // 1) Animações de entrada — igual ao original: aparece quando 12% entra na tela.
  function mostrar(el) {
    el.style.opacity = '1'
    el.style.transform = 'none'
  }
  function animar(raiz) {
    var els = (raiz || document).querySelectorAll('.gwt-anim')
    if (!('IntersectionObserver' in window)) return els.forEach(mostrar)
    els.forEach(function (el) {
      var io = new IntersectionObserver(
        function (entradas) {
          if (entradas[0].isIntersecting) {
            mostrar(el)
            io.unobserve(el)
          }
        },
        { threshold: 0.12 }
      )
      io.observe(el)
    })
  }

  // 2) Menu do celular
  function abrirMenu() {
    var tpl = document.getElementById('tpl-menu-mobile')
    if (!tpl || document.querySelector('[data-menu-aberto]')) return
    var menu = tpl.content.firstElementChild.cloneNode(true)
    menu.setAttribute('data-menu-aberto', '')
    document.body.appendChild(menu)
  }
  function fecharMenu() {
    var m = document.querySelector('[data-menu-aberto]')
    if (m) m.remove()
  }

  // 3) Seções com estados (abas de Segmentos, filtros do Blog, "Ver mais clientes")
  function trocarEstado(secao, botao) {
    var chave = secao.getAttribute('data-estados')
    var alvo = texto(botao)
    var tpls = document.querySelectorAll('template[data-estado-de="' + chave + '"]')
    for (var i = 0; i < tpls.length; i++) {
      if (tpls[i].getAttribute('data-botao') === alvo) {
        var nova = tpls[i].content.firstElementChild.cloneNode(true)
        secao.replaceWith(nova)
        animar(nova)
        return true
      }
    }
    return false
  }

  // 4) Formulários
  function lerCampos(form) {
    var d = { nome: '', empresa: '', cnpj: '', email: '', whatsapp: '', mensagem: '', segmento: '' }
    form.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (el.type === 'submit' || el.type === 'button' || el.type === 'hidden') return
      var ph = (el.getAttribute('placeholder') || '').toLowerCase()
      var v = el.value || ''
      if (el.tagName === 'TEXTAREA') d.mensagem = v
      else if (el.tagName === 'SELECT') d.segmento = v
      else if (el.type === 'email') d.email = v
      else if (el.type === 'tel') d.whatsapp = v
      else if (/nome completo|jo[aã]o/.test(ph)) d.nome = v
      else if (/00\.000/.test(ph)) d.cnpj = v
      else d.empresa = v
    })
    return d
  }

  function linkWhatsApp(d) {
    var o = [MENSAGEM_ABERTURA, '', '*Meus dados:*', '• *Nome:* ' + d.nome.trim()]
    if (d.empresa.trim()) o.push('• *Empresa:* ' + d.empresa.trim())
    if (d.email.trim()) o.push('• *E-mail:* ' + d.email.trim())
    if (d.whatsapp.trim()) o.push('• *WhatsApp:* ' + d.whatsapp.trim())
    if (d.cnpj.trim()) o.push('• *CNPJ:* ' + d.cnpj.trim())
    if (d.mensagem.trim()) o.push('• *Mensagem:* ' + d.mensagem.trim())
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(o.join('\n'))
  }

  function registrarLead(tipo, origem, d) {
    try {
      return fetch(ENDPOINT_LEAD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(Object.assign({ tipo: tipo, origem: origem, pagina: location.pathname }, d))
      }).catch(function (e) {
        console.error('Falha ao registrar lead:', e)
      })
    } catch (e) {
      console.error('Falha ao registrar lead:', e)
      return Promise.resolve()
    }
  }

  function enviarContato(form) {
    var d = lerCampos(form)
    var botao = form.querySelector('button[type=submit]')
    var original = botao ? botao.innerHTML : ''
    if (botao) {
      botao.disabled = true
      botao.textContent = 'Enviando...'
    }
    var url = WHATSAPP ? linkWhatsApp(d) : ''
    var aberto = !url
    if (url) {
      try {
        var w = window.open(url, '_blank')
        aberto = !!(w && !w.closed && w.closed !== undefined)
      } catch (e) {
        aberto = false
      }
    }
    registrarLead('contato', form.getAttribute('data-origem') || 'site_contato', d).then(function () {
      form.reset()
      var antigo = form.querySelector('[data-aviso-sucesso]')
      if (antigo) antigo.remove()
      var tpl = document.getElementById('tpl-sucesso-contato')
      if (tpl) {
        var aviso = tpl.content.firstElementChild.cloneNode(true)
        aviso.setAttribute('data-aviso-sucesso', '')
        var link = aviso.querySelector('a[href*="wa.me"], a[target=_blank]')
        if (link && url) link.setAttribute('href', url)
        else if (link) {
          // sem WhatsApp configurado: tira o botão e ajusta o texto do aviso
          link.remove()
          aviso.querySelectorAll('p').forEach(function (p) {
            if (/WhatsApp/.test(p.textContent)) p.textContent = 'Recebemos seus dados. Nossa equipe entrará em contato em breve.'
          })
        }
        var idx = parseInt(tpl.getAttribute('data-indice') || '0', 10)
        form.insertBefore(aviso, form.children[idx] || null)
      }
      if (botao) {
        botao.disabled = false
        botao.innerHTML = original
      }
      if (!aberto && url) window.location.href = url
    })
  }

  function enviarParceiro(form) {
    var d = lerCampos(form)
    var wrapper = form.closest('[data-parceiro-wrapper]')
    var botao = form.querySelector('button[type=submit]')
    if (botao) {
      botao.disabled = true
      botao.textContent = 'Processando...'
    }
    registrarLead('parceiro', 'site_parceiro', d).then(function () {
      var tpl = document.getElementById('tpl-sucesso-parceiro')
      if (!wrapper || !tpl) return
      wrapper.__original = wrapper.__original || wrapper.innerHTML
      wrapper.innerHTML = tpl.innerHTML
    })
  }

  // 5) Compartilhar artigo
  function compartilhar() {
    var dados = { title: document.title, url: location.href }
    if (navigator.share) return navigator.share(dados).catch(function () {})
    if (navigator.clipboard) navigator.clipboard.writeText(location.href).then(function () { alert('Link copiado!') })
  }

  // 6) Selo 3D do destaque — mesma rotina do brasão 3D do original:
  //    inclina até 8° seguindo o mouse (9° no toque), balança sozinho e inclina ao rolar.
  var giro = { alvoX: 0, alvoY: 0, x: 0, y: 0, rolagemAlvo: 0, rolagem: 0 }
  function emblemaRef() { return document.querySelector('[data-emblema-giro]') }
  window.addEventListener('mousemove', function (e) {
    var el = emblemaRef()
    if (!el) return
    var r = el.getBoundingClientRect()
    var sx = ((e.clientX - r.left) / r.width) * 2 - 1
    var sy = ((e.clientY - r.top) / r.height) * 2 - 1
    var perto = e.clientX >= r.left - 450 && e.clientX <= r.right + 450 && e.clientY >= r.top - 450 && e.clientY <= r.bottom + 450
    giro.alvoX = perto ? -(8 * sy) : 0
    giro.alvoY = perto ? 8 * sx : 0
  }, { passive: true })
  window.addEventListener('touchmove', function (e) {
    var el = emblemaRef()
    if (!el || !e.touches[0]) return
    var r = el.getBoundingClientRect(), t = e.touches[0]
    var sx = Math.max(-1, Math.min(1, ((t.clientX - r.left) / r.width) * 2 - 1))
    var sy = Math.max(-1, Math.min(1, ((t.clientY - r.top) / r.height) * 2 - 1))
    giro.alvoX = -(9 * sy)
    giro.alvoY = 9 * sx
  }, { passive: true })
  window.addEventListener('touchend', function () { giro.alvoX = 0; giro.alvoY = 0 }, { passive: true })
  window.addEventListener('scroll', function () {
    var y = window.scrollY || document.documentElement.scrollTop
    if (y <= 800) giro.rolagemAlvo = (y / 800) * 16
  }, { passive: true })
  function quadro() {
    var agora = performance.now()
    var ondaY = 4 * Math.sin(0.0014 * agora)
    var ondaX = 2.5 * Math.cos(0.0011 * agora)
    giro.rolagem += (giro.rolagemAlvo - giro.rolagem) * 0.08
    giro.x += (giro.alvoX - giro.x) * 0.08
    giro.y += (giro.alvoY - giro.y) * 0.08
    var rx = 10 + giro.x + ondaX + 0.6 * giro.rolagem
    var ry = -16 + giro.y + ondaY - 0.4 * giro.rolagem
    document.querySelectorAll('[data-emblema-giro]').forEach(function (el) {
      el.style.transform = 'perspective(1200px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) rotateZ(2.5deg)'
    })
    document.querySelectorAll('[data-emblema-topo]').forEach(function (el) { el.style.transform = 'translateZ(28px)' })
    requestAnimationFrame(quadro)
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(quadro)

  // 7) Cabeçalho: ganha fundo escuro quando a página rola mais de 60px (como no original) OU quando
  //    o que está logo atrás dele é claro (Diagnóstico, Privacidade, Termos começam em creme) —
  //    sem isso a logo e o menu, que são claros, somem.
  var CLS_ROLADO = ['bg-[#0B1225]/95', 'backdrop-blur-xl', 'border-b', 'border-white/5', 'shadow-sm']
  function luminancia(css) {
    var m = css && css.match(/rgba?\(([^)]+)\)/)
    if (!m) return null
    var p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat)
    if (p.length > 3 && p[3] < 0.5) return null // quase transparente: vale o que está atrás
    return (0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]) / 255
  }
  function fundoAtras(h, x, y) {
    var pilha = document.elementsFromPoint(x, y)
    for (var i = 0; i < pilha.length; i++) {
      if (h.contains(pilha[i])) continue
      for (var e = pilha[i]; e && e.nodeType === 1; e = e.parentElement) {
        var cs = getComputedStyle(e)
        var l = cs.backgroundImage !== 'none' ? luminancia(cs.backgroundImage) : null
        if (l === null) l = luminancia(cs.backgroundColor)
        if (l !== null) return l
      }
      return 1 // nada pintado até a raiz: fundo branco do navegador
    }
    return 1
  }
  function fundoClaro(h) {
    var y = Math.max(1, Math.min(h.getBoundingClientRect().bottom - 4, window.innerHeight - 1))
    var w = window.innerWidth
    // confere três pontos (esquerda, meio, direita): basta um claro para o texto do menu sumir
    return [w * 0.15, w * 0.5, w * 0.85].some(function (x) { return fundoAtras(h, x, y) > 0.5 })
  }
  var agendado = false
  function cabecalho() {
    agendado = false
    var h = document.querySelector('header.fixed')
    if (!h) return
    // só o cabeçalho que nasce transparente muda; o das páginas legais já é escuro por desenho
    if (!h.hasAttribute('data-cabecalho-dinamico')) {
      if (!h.classList.contains('bg-transparent')) return
      h.setAttribute('data-cabecalho-dinamico', '')
    }
    var solido = window.scrollY > 60 || fundoClaro(h)
    CLS_ROLADO.forEach(function (c) { h.classList.toggle(c, solido) })
    h.classList.toggle('bg-transparent', !solido)
  }
  function agendarCabecalho() {
    if (!agendado) { agendado = true; requestAnimationFrame(cabecalho) }
  }
  window.addEventListener('scroll', agendarCabecalho, { passive: true })
  window.addEventListener('resize', agendarCabecalho)
  window.addEventListener('load', agendarCabecalho)
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', cabecalho)
  else cabecalho()

  // Delegação de eventos (funciona também nos trechos trocados pelas abas)
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('button, a')
    if (!b) return
    var rotulo = b.getAttribute('aria-label')
    if (rotulo === 'Abrir menu') return abrirMenu()
    if (rotulo === 'Fechar menu') return fecharMenu()
    if (b.closest('[data-menu-aberto]') && b.tagName === 'A') return fecharMenu()
    if (rotulo === 'Fechar aviso') {
      var aviso = b.closest('[data-aviso-sucesso]')
      if (aviso) aviso.remove()
      return
    }
    if (b.tagName === 'BUTTON' && /Enviar nova solicita/.test(texto(b))) {
      var w = b.closest('[data-parceiro-wrapper]')
      if (w && w.__original) w.innerHTML = w.__original
      return
    }
    if (b.tagName === 'BUTTON' && b.querySelector('.lucide-share2')) return compartilhar()
    var secao = b.closest('[data-estados]')
    if (secao && b.tagName === 'BUTTON' && trocarEstado(secao, b)) ev.preventDefault()
  })


  // 6) Radar tributário: notícias do dia (API própria, filtrada para não sair do tema).
  //    Toda notícia tem imagem: a do portal; se não carregar, a miniatura; se nenhuma, o cartão sai.
  var ENDPOINT_NOTICIAS = '/api/publico/noticias'
  var pedidoNoticias = null
  function carregarNoticias() {
    pedidoNoticias = pedidoNoticias || fetch(ENDPOINT_NOTICIAS).then(function (r) { return r.ok ? r.json() : Promise.reject(r.status) })
    return pedidoNoticias
  }
  window.__radarImg = function (img) {
    var reserva = img.getAttribute('data-reserva')
    if (reserva && img.src !== reserva) { img.removeAttribute('data-reserva'); img.src = reserva; return }
    var card = img.closest('.radar-card'); if (card) card.remove()
  }
  function radar(raiz) {
    var lista = raiz.querySelector('[data-radar-lista]')
    var filtros = raiz.querySelector('[data-radar-filtros]')
    var mais = raiz.querySelector('[data-radar-mais]')
    var status = raiz.querySelector('[data-radar-status]')
    var fixo = +raiz.getAttribute('data-radar-limite') || 0
    var BASE = filtros ? filtros.getAttribute('data-classe-botao') : ''
    var ATIVO = ' bg-[#1A2D5A] text-white border border-[#1A2D5A] shadow-md shadow-[#1A2D5A]/10'
    var INATIVO = ' bg-white/40 text-[#1A2D5A]/70 border border-[#213870]/10 hover:border-[#213870]/30 hover:text-[#1A2D5A]'
    var PASSO = fixo || (window.innerWidth < 768 ? 4 : 9)
    var dados = null, tema = 'Todas', mostrando = PASSO
    var seta = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7"/><path d="M7 7h10v10"/></svg>'
    function esc(t) { var d = document.createElement('div'); d.textContent = t || ''; return d.innerHTML.replace(/"/g, '&quot;') }
    function quando(iso) {
      var min = Math.max(1, Math.round((Date.now() - new Date(iso)) / 60000))
      if (min < 60) return 'há ' + min + ' min'
      var h = Math.round(min / 60)
      if (h < 24) return 'há ' + h + ' h'
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    }
    function desenhar() {
      var itens = dados.noticias.filter(function (n) { return n.imagem && (tema === 'Todas' || n.tema === tema) })
      lista.innerHTML = itens.length ? itens.slice(0, mostrando).map(function (n) {
        var reserva = n.imagemReserva && n.imagemReserva !== n.imagem ? ' data-reserva="' + esc(n.imagemReserva) + '"' : ''
        return '<a class="radar-card" href="' + esc(n.link) + '" target="_blank" rel="noopener noreferrer">' +
          '<div class="radar-foto"><img src="' + esc(n.imagem) + '"' + reserva + ' alt="" loading="lazy" referrerpolicy="no-referrer" onerror="__radarImg(this)"/></div>' +
          '<div class="radar-corpo"><div class="radar-topo"><span>' + esc(n.tema) + '</span><i></i><time datetime="' + n.data + '">' + quando(n.data) + '</time></div>' +
          '<h3 class="radar-titulo font-serif">' + esc(n.titulo) + '</h3>' +
          (fixo ? '' : '<p class="radar-resumo">' + esc(n.resumo) + '</p>') +
          '<div class="radar-fonte"><span>' + esc(n.fonte) + '</span>' + seta + '</div></div></a>'
      }).join('') : '<div class="radar-vazio">Nenhuma notícia deste tema nos últimos dias.</div>'
      if (mais) mais.hidden = fixo || itens.length <= mostrando
      if (filtros) filtros.querySelectorAll('button').forEach(function (b) { b.className = BASE + (b.textContent === tema ? ATIVO : INATIVO) })
    }
    carregarNoticias().then(function (d) {
      dados = d
      if (filtros) filtros.innerHTML = ['Todas'].concat(d.temas).map(function (t) { return '<button type="button">' + esc(t) + '</button>' }).join('')
      if (status) {
        var hora = new Date(d.atualizadoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
        status.textContent = 'Atualizado em ' + hora + ' · ' + d.noticias.length + ' notícias recentes · os links abrem no portal de origem'
      }
      desenhar()
    }).catch(function () {
      lista.innerHTML = '<div class="radar-vazio">Não foi possível carregar as notícias agora. Tente novamente em alguns minutos.</div>'
    })
    if (filtros) filtros.addEventListener('click', function (ev) {
      var b = ev.target.closest('button'); if (!b || !dados) return
      tema = b.textContent; mostrando = PASSO; desenhar()
    })
    if (mais) mais.addEventListener('click', function () { mostrando += PASSO; desenhar() })
  }
  function radares() { document.querySelectorAll('[data-radar]').forEach(radar) }

  document.addEventListener('submit', function (ev) {
    var form = ev.target
    var tipo = form.getAttribute('data-form')
    if (!tipo) return
    ev.preventDefault()
    if (tipo === 'parceiro') enviarParceiro(form)
    else enviarContato(form)
  })

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') fecharMenu()
  })

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', radares)
  else radares()
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { animar() })
  else animar()
})()
