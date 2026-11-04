/* Comportamento do site institucional (cópia do gwtsolution.com.br).
 * Substitui o JavaScript do React do original, reproduzindo o mesmo comportamento:
 * animações de entrada, menu do celular, abas/filtros, "Ver mais clientes",
 * formulários (WhatsApp + registro do contato) e compartilhar artigo. */
(function () {
  'use strict'

  // ================= CONFIGURAÇÃO — troque pelos seus dados =================
  // ⚠️ Número copiado do site da GWT. Enquanto não trocar, os contatos do
  //    formulário abrem conversa no WhatsApp DELES.
  var WHATSAPP = '5515991529008'
  // Mensagem montada igual à do original (mesmo texto e mesma ordem).
  var MENSAGEM_ABERTURA = 'Olá! Preenchi o formulário no site da GWT e gostaria de falar com um especialista.'
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
    var url = linkWhatsApp(d)
    var aberto = false
    try {
      var w = window.open(url, '_blank')
      aberto = !!(w && !w.closed && w.closed !== undefined)
    } catch (e) {
      aberto = false
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
        if (link) link.setAttribute('href', url)
        var idx = parseInt(tpl.getAttribute('data-indice') || '0', 10)
        form.insertBefore(aviso, form.children[idx] || null)
      }
      if (botao) {
        botao.disabled = false
        botao.innerHTML = original
      }
      if (!aberto) window.location.href = url
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { animar() })
  else animar()
})()
