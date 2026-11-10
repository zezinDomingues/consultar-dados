/* Comportamento do site institucional (cópia do gwtsolution.com.br).
 * Substitui o JavaScript do React do original, reproduzindo o mesmo comportamento:
 * animações de entrada, menu do celular, abas/filtros,
 * formulários (WhatsApp + registro do contato) e compartilhar artigo. */
(function () {
  'use strict'

  // ================= CONFIGURAÇÃO — troque pelos seus dados =================
  // WhatsApp de contato da OficialCert (só dígitos, com 55 + DDD): (11) 5196-7114 desde 09/11/2026.
  // O formulário "Fale com um especialista" grava o contato em leads_site (tela Leads do site, na plataforma)
  // E abre a conversa com este número já com os dados; se o registro falhar, vira a saída "Falar pelo WhatsApp".
  var WHATSAPP = '551151967114'
  // E-mail de contato da OficialCert. VAZIO por enquanto; preenchido, aparece como saída quando o envio falha
  // (abre o e-mail já com os dados digitados).
  var EMAIL_CONTATO = ''
  // Mensagem de abertura da conversa (mesma ordem de campos do original).
  var MENSAGEM_ABERTURA = 'Olá! Preenchi o formulário no site da OficialCert e gostaria de falar com um especialista.'
  var ENDPOINT_LEAD = '/api/publico/lead'
  // Canais que levam ao site com ?origem= (ex.: o link da bio do Instagram). Fica guardado durante a visita
  // e vai junto com o lead (origem "site_contato_instagram"), para a tela Leads do site mostrar de onde veio.
  var CANAIS = ['instagram', 'linkedin', 'whatsapp']
  // ==========================================================================

  var canal = ''
  try {
    var pedido = new URLSearchParams(location.search).get('origem') || ''
    if (CANAIS.indexOf(pedido) >= 0) {
      canal = pedido
      sessionStorage.setItem('oc-canal', pedido)
    } else {
      canal = sessionStorage.getItem('oc-canal') || ''
      if (CANAIS.indexOf(canal) < 0) canal = ''
    }
  } catch (e) {
    canal = ''
  }

  var texto = function (el) {
    return (el.getAttribute('aria-label') || el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
  }

  // 1) Animações de entrada — igual ao original: aparece quando 12% entra na tela.
  //    Sem JavaScript, o <noscript> de cada página mostra tudo; aqui, sem IntersectionObserver, idem.
  function mostrar(el) {
    el.style.opacity = '1'
    el.style.transform = 'none'
  }
  var observadorAnim = null
  function animar(raiz) {
    var els = (raiz || document).querySelectorAll('.gwt-anim')
    if (!('IntersectionObserver' in window)) return els.forEach(mostrar)
    observadorAnim = observadorAnim || new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return
        mostrar(e.target)
        observadorAnim.unobserve(e.target)
      })
    }, { threshold: 0.12 })
    els.forEach(function (el) { observadorAnim.observe(el) })
  }
  // impressão / "salvar como PDF": tudo visível, mesmo o que ainda não rolou para a tela
  window.addEventListener('beforeprint', function () { document.querySelectorAll('.gwt-anim').forEach(mostrar) })

  // 2) Menu do celular
  function abrirMenu(botao) {
    var tpl = document.getElementById('tpl-menu-mobile')
    if (!tpl || document.querySelector('[data-menu-aberto]')) return
    var menu = tpl.content.firstElementChild.cloneNode(true)
    menu.setAttribute('data-menu-aberto', '')
    menu.setAttribute('role', 'dialog')
    menu.setAttribute('aria-modal', 'true')
    menu.setAttribute('aria-label', 'Menu')
    menu.__abridor = botao
    document.body.appendChild(menu)
    if (botao) botao.setAttribute('aria-expanded', 'true')
    var fechar = menu.querySelector('[aria-label="Fechar menu"]')
    if (fechar) fechar.focus()
  }
  function fecharMenu() {
    var m = document.querySelector('[data-menu-aberto]')
    if (!m) return
    m.remove()
    if (m.__abridor) {
      m.__abridor.setAttribute('aria-expanded', 'false')
      m.__abridor.focus()
    }
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

  // 4) Formulários. A validação espelha a da API (src/lib/validar-contato.ts e src/lib/leads-site.ts):
  //    mudou lá, mude aqui. A API é quem decide; aqui é só para avisar campo a campo antes de enviar.
  //    Só mostra "recebemos" quando a API responde 200 com { ok: true }; em qualquer erro, avisa, mantém o
  //    que foi digitado e oferece outra saída (WhatsApp/e-mail, quando configurados).
  var SEGMENTOS = {
    varejo: 'Varejo', industria: 'Indústria', agro: 'Agronegócio', servicos: 'Serviços', ecommerce: 'E-commerce',
    'terceiro-setor': 'Terceiro Setor'
  }
  var MAXIMO = { nome: 120, empresa: 160, cnpj: 18, email: 160, whatsapp: 20, mensagem: 2000 }
  var EMAIL = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/
  var DDDS = ' 11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99 '
  var LETRAS = (function () {
    try { return new RegExp('\\p{L}.*\\p{L}', 'u') } catch (e) { return /[A-Za-zÀ-ÖØ-öø-ÿ].*[A-Za-zÀ-ÖØ-öø-ÿ]/ }
  })()
  var formula = function (v) { return /^[=+\-@]/.test(v) }

  function limpar(v, multilinha) {
    var t = String(v || '')
    if (t.normalize) t = t.normalize('NFC')
    t = t.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    t = multilinha ? t.replace(/[^\S\n]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\s+/g, ' ')
    return t.trim()
  }
  function foneBR(v) {
    var d = String(v || '').replace(/\D/g, '')
    if ((d.length === 12 || d.length === 13) && d.indexOf('55') === 0) d = d.slice(2)
    if ((d.length === 11 || d.length === 12) && d.charAt(0) === '0') d = d.slice(1)
    if (d.length === 10 && /[6-9]/.test(d.charAt(2))) d = d.slice(0, 2) + '9' + d.slice(2)
    if (DDDS.indexOf(' ' + d.slice(0, 2) + ' ') < 0) return null
    if (d.length === 11 && d.charAt(2) !== '9') return null
    if (d.length === 10 && !/[2-5]/.test(d.charAt(2))) return null
    if (d.length !== 10 && d.length !== 11) return null
    if (/^(\d)\1+$/.test(d.slice(2))) return null
    return d
  }
  function mascaraFone(d) {
    if (d.length === 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6)
  }
  function cnpjValido(v) {
    var c = String(v || '').toUpperCase().replace(/[\s./-]/g, '')
    if (!/^[0-9A-Z]{12}\d{2}$/.test(c) || /^(.)\1+$/.test(c)) return null
    function dv(n) {
      var pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2].slice(13 - n), soma = 0
      for (var i = 0; i < n; i++) soma += (c.charCodeAt(i) - 48) * pesos[i]
      var r = soma % 11
      return r < 2 ? 0 : 11 - r
    }
    return dv(12) === +c.charAt(12) && dv(13) === +c.charAt(13) ? c : null
  }
  var mascaraCnpj = function (c) { return c.slice(0, 2) + '.' + c.slice(2, 5) + '.' + c.slice(5, 8) + '/' + c.slice(8, 12) + '-' + c.slice(12) }

  // regra de cada campo: devolve a mensagem de erro ('' = ok)
  var REGRAS = {
    nome: function (v) {
      if (!v) return 'Informe seu nome.'
      if (v.length > MAXIMO.nome) return 'Use no máximo ' + MAXIMO.nome + ' caracteres.'
      return LETRAS.test(v) && !formula(v) ? '' : 'Digite um nome válido (sem = + - @ no começo).'
    },
    empresa: function (v, el) {
      if (!v) return el.required ? 'Informe a empresa.' : ''
      if (v.length > MAXIMO.empresa) return 'Use no máximo ' + MAXIMO.empresa + ' caracteres.'
      return formula(v) ? 'O nome da empresa não pode começar com = + - @.' : ''
    },
    cnpj: function (v) { return !v || cnpjValido(v) ? '' : 'CNPJ inválido: confira os 14 caracteres.' },
    email: function (v) {
      if (!v) return 'Informe seu e-mail.'
      return v.length <= MAXIMO.email && EMAIL.test(v) && !formula(v) ? '' : 'E-mail inválido. Exemplo: nome@empresa.com.br'
    },
    whatsapp: function (v) {
      if (!v) return 'Informe seu WhatsApp.'
      return foneBR(v) ? '' : 'WhatsApp inválido: use DDD + número, por exemplo (11) 98765-4321.'
    },
    mensagem: function (v) { return v.length > MAXIMO.mensagem ? 'Use no máximo 2.000 caracteres.' : '' },
    segmento: function (v, el) { return el.required && !v ? 'Escolha o seu segmento de atuação.' : '' }
  }

  // Os campos não têm name no HTML copiado: reconhece cada um pelo tipo/placeholder (como o original fazia).
  function mapearCampos(form) {
    var m = {}
    form.querySelectorAll('input, textarea, select').forEach(function (el) {
      if (el.type === 'submit' || el.type === 'button' || el.type === 'hidden') return
      var ph = (el.getAttribute('placeholder') || '').toLowerCase()
      var k = el.getAttribute('data-campo')
      if (!k) {
        if (el.tagName === 'TEXTAREA') k = 'mensagem'
        else if (el.tagName === 'SELECT') k = 'segmento'
        else if (el.type === 'email') k = 'email'
        else if (el.type === 'tel') k = 'whatsapp'
        else if (/nome completo|jo[aã]o/.test(ph)) k = 'nome'
        else if (/00\.000/.test(ph)) k = 'cnpj'
        else k = 'empresa'
      }
      m[k] = el
    })
    return m
  }

  function luzDoTexto(el) {
    var m = getComputedStyle(el).color.match(/\d+(\.\d+)?/g)
    return m ? (0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]) / 255 : 0
  }

  var contador = 0
  function preparar(form) {
    if (form.__pronto) return
    form.__pronto = true
    form.noValidate = true // as mensagens são as nossas, em português e por campo
    var campos = mapearCampos(form)
    var algum = campos.nome || campos.email
    form.setAttribute('data-tema', algum && luzDoTexto(algum) > 0.5 ? 'escuro' : 'claro')
    var id = 'oc' + ++contador
    var AUTO = { nome: 'name', empresa: 'organization', email: 'email', whatsapp: 'tel', cnpj: 'off' }
    Object.keys(campos).forEach(function (k) {
      var el = campos[k]
      // ícone + campo ganham um invólucro próprio: a mensagem de erro entra embaixo sem tirar o ícone do centro
      // do campo e sem virar uma célula a mais nas grades de 2 colunas
      var p = el.parentElement
      if (p && p !== form && p.classList.contains('relative') && !p.hasAttribute('data-oc-campo')) {
        var dentro = document.createElement('div')
        dentro.className = 'relative'
        dentro.setAttribute('data-oc-campo', '')
        while (p.firstChild) dentro.appendChild(p.firstChild)
        p.appendChild(dentro)
      }
      el.setAttribute('data-campo', k)
      el.setAttribute('name', k)
      if (MAXIMO[k]) el.setAttribute('maxlength', String(MAXIMO[k]))
      if (AUTO[k]) el.setAttribute('autocomplete', AUTO[k])
      if (k === 'whatsapp') el.setAttribute('inputmode', 'tel')
      if (k === 'email') { el.setAttribute('inputmode', 'email'); el.setAttribute('spellcheck', 'false') }
      if (k === 'cnpj') el.setAttribute('spellcheck', 'false')
      el.__idErro = id + '-' + k
    })
    var botao = form.querySelector('button[type=submit]')
    if (botao) form.__botaoOriginal = botao.innerHTML
    // ?segmento= da página Segmentos: vai junto com o contato e aparece no formulário
    if (form.getAttribute('data-form') === 'contato' && !campos.segmento) {
      var s = ''
      try { s = new URLSearchParams(location.search).get('segmento') || '' } catch (e) {}
      if (Object.prototype.hasOwnProperty.call(SEGMENTOS, s)) {
        form.__segmento = s
        var chip = document.createElement('p')
        chip.className = 'oc-segmento'
        chip.appendChild(document.createTextNode('Segmento de interesse: '))
        var forte = document.createElement('strong')
        forte.textContent = SEGMENTOS[s]
        chip.appendChild(forte)
        form.insertBefore(chip, form.firstChild)
      }
    }
  }

  // bloco do formulário onde a mensagem do campo entra logo depois (o input fica dentro de um div com o ícone)
  function blocoDoCampo(el) {
    var p = el.parentElement
    return p && p.hasAttribute('data-oc-campo') ? p : el
  }
  function marcarErro(el, msg) {
    var antigo = document.getElementById(el.__idErro)
    if (!msg) {
      el.removeAttribute('aria-invalid')
      el.removeAttribute('aria-describedby')
      if (antigo) antigo.remove()
      return
    }
    el.setAttribute('aria-invalid', 'true')
    el.setAttribute('aria-describedby', el.__idErro)
    if (!antigo) {
      antigo = document.createElement('p')
      antigo.id = el.__idErro
      antigo.className = 'oc-erro-campo'
      var b = blocoDoCampo(el)
      b.parentNode.insertBefore(antigo, b.nextSibling)
    }
    antigo.textContent = msg
  }
  function validarCampo(el) {
    var k = el.getAttribute('data-campo')
    var v = limpar(el.value, k === 'mensagem')
    var msg = REGRAS[k] ? REGRAS[k](v, el) : ''
    marcarErro(el, msg)
    return msg
  }
  // ao sair do campo: arruma a máscara quando o valor é válido. A mensagem de erro só aparece aqui depois da 1ª
  // tentativa de envio: antes disso, inserir a mensagem no blur empurra o botão para baixo no exato instante do
  // clique (mousedown) e o clique cai fora dele.
  function aoSair(el) {
    var k = el.getAttribute('data-campo')
    if (!k || !el.value.trim()) return
    var v = limpar(el.value, k === 'mensagem')
    var msg = REGRAS[k] ? REGRAS[k](v, el) : ''
    if (msg) {
      if (el.form.__tentou) marcarErro(el, msg)
      return
    }
    marcarErro(el, '')
    if (k === 'whatsapp') el.value = mascaraFone(foneBR(el.value))
    if (k === 'cnpj') el.value = mascaraCnpj(cnpjValido(el.value))
  }

  function removerAviso(form) {
    var a = form.querySelector('[data-oc-aviso]')
    if (a) a.remove()
  }
  // aviso geral do formulário, logo acima do botão de enviar
  function mostrarAviso(form, titulo, detalhe, saidas) {
    removerAviso(form)
    var aviso = document.createElement('div')
    aviso.className = 'oc-aviso'
    aviso.setAttribute('data-oc-aviso', '')
    aviso.setAttribute('role', 'alert')
    var t = document.createElement('strong')
    t.textContent = titulo
    aviso.appendChild(t)
    if (detalhe) {
      var p = document.createElement('span')
      p.textContent = ' ' + detalhe
      aviso.appendChild(p)
    }
    if (saidas && saidas.length) {
      var linha = document.createElement('span')
      linha.className = 'oc-aviso-saidas'
      saidas.forEach(function (s) { linha.appendChild(s) })
      aviso.appendChild(linha)
    }
    var botao = form.querySelector('button[type=submit]')
    var ref = botao || null
    while (ref && ref.parentElement !== form) ref = ref.parentElement
    form.insertBefore(aviso, ref)
    return aviso
  }
  function saidaLink(rotulo, href) {
    var a = document.createElement('a')
    a.className = 'oc-aviso-acao'
    a.href = href
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    a.textContent = rotulo
    return a
  }

  function linkWhatsApp(d) {
    var o = [MENSAGEM_ABERTURA, '', '*Meus dados:*', '• *Nome:* ' + d.nome]
    if (d.empresa) o.push('• *Empresa:* ' + d.empresa)
    if (d.email) o.push('• *E-mail:* ' + d.email)
    if (d.whatsapp) o.push('• *WhatsApp:* ' + d.whatsapp)
    if (d.cnpj) o.push('• *CNPJ:* ' + d.cnpj)
    if (d.segmento) o.push('• *Segmento:* ' + (SEGMENTOS[d.segmento] || d.segmento))
    if (d.mensagem) o.push('• *Mensagem:* ' + d.mensagem)
    return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(o.join('\n'))
  }
  function linkEmail(d) {
    var o = ['Nome: ' + d.nome]
    if (d.empresa) o.push('Empresa: ' + d.empresa)
    if (d.email) o.push('E-mail: ' + d.email)
    if (d.whatsapp) o.push('WhatsApp: ' + d.whatsapp)
    if (d.cnpj) o.push('CNPJ: ' + d.cnpj)
    if (d.segmento) o.push('Segmento: ' + (SEGMENTOS[d.segmento] || d.segmento))
    if (d.mensagem) o.push('', d.mensagem)
    return 'mailto:' + EMAIL_CONTATO + '?subject=' + encodeURIComponent('Contato pelo site da OficialCert') +
      '&body=' + encodeURIComponent(o.join('\n'))
  }

  /** POST do contato → { ok, status, erro, campos }. Nunca rejeita: rede fora/tempo esgotado viram status 0. */
  function registrarLead(tipo, origem, d) {
    var ctl = window.AbortController ? new AbortController() : null
    var relogio = ctl ? setTimeout(function () { ctl.abort() }, 20000) : 0
    var corpo = JSON.stringify(Object.assign({ tipo: tipo, origem: origem, pagina: location.pathname }, d))
    var pedido
    try {
      pedido = fetch(ENDPOINT_LEAD, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: corpo.length < 60000, // termina mesmo se a pessoa sair da página
        body: corpo,
        signal: ctl ? ctl.signal : undefined
      })
    } catch (e) {
      pedido = Promise.reject(e)
    }
    return pedido.then(function (r) {
      return r.json().catch(function () { return {} }).then(function (j) {
        return { ok: r.ok && !!j && j.ok === true, status: r.status, erro: j && j.erro, campos: j && j.campos }
      })
    }, function () {
      return { ok: false, status: 0 }
    }).then(function (res) {
      clearTimeout(relogio)
      return res
    })
  }

  function travar(form, sim, rotulo) {
    form.__enviando = sim
    form.setAttribute('aria-busy', sim ? 'true' : 'false')
    var botao = form.querySelector('button[type=submit]')
    if (botao) {
      botao.disabled = sim
      if (sim) botao.textContent = rotulo
      else if (form.__botaoOriginal != null) botao.innerHTML = form.__botaoOriginal
    }
    // durante o envio não dá para editar (o que vai é o que estava na tela)
    form.querySelectorAll('input, textarea').forEach(function (el) { el.readOnly = sim })
    form.querySelectorAll('select').forEach(function (el) { el.disabled = sim })
  }

  function enviar(form) {
    if (form.__enviando) return // clique duplo, Enter repetido
    preparar(form)
    form.__tentou = true
    var tipo = form.getAttribute('data-form') === 'parceiro' ? 'parceiro' : 'contato'
    removerAviso(form)
    var antigo = form.querySelector('[data-aviso-sucesso]')
    if (antigo) antigo.remove()

    var campos = mapearCampos(form)
    var d = { nome: '', empresa: '', cnpj: '', email: '', whatsapp: '', mensagem: '', segmento: form.__segmento || '' }
    var primeiro = null
    Object.keys(campos).forEach(function (k) {
      d[k] = limpar(campos[k].value, k === 'mensagem')
      if (validarCampo(campos[k]) && !primeiro) primeiro = campos[k]
    })
    if (primeiro) {
      mostrarAviso(form, 'Confira os campos destacados.', '')
      primeiro.focus()
      return
    }
    // tudo certo: deixa WhatsApp e CNPJ com a máscara (Enter envia sem passar pelo blur)
    if (campos.whatsapp) campos.whatsapp.value = mascaraFone(foneBR(campos.whatsapp.value))
    if (campos.cnpj && d.cnpj) campos.cnpj.value = mascaraCnpj(cnpjValido(d.cnpj))

    var url = WHATSAPP && tipo === 'contato' ? linkWhatsApp(d) : ''
    var aberto = !url
    if (url) {
      // abre já no clique (depois do await o navegador bloquearia a janela)
      try {
        var w = window.open(url, '_blank')
        aberto = !!(w && !w.closed && w.closed !== undefined)
      } catch (e) {
        aberto = false
      }
    }
    travar(form, true, tipo === 'parceiro' ? 'Processando...' : 'Enviando...')
    var origem = (form.getAttribute('data-origem') || (tipo === 'parceiro' ? 'site_parceiro' : 'site_contato')) + (canal ? '_' + canal : '')
    registrarLead(tipo, origem, d).then(function (res) {
      travar(form, false)
      if (res.ok) return sucesso(form, tipo, url, aberto)
      falhou(form, res, d, campos, !!url)
    })
  }

  function falhou(form, res, d, campos, whatsAberto) {
    if (res.status === 400 && res.campos && typeof res.campos === 'object') {
      var primeiro = null
      Object.keys(res.campos).forEach(function (k) {
        if (!campos[k]) return
        marcarErro(campos[k], String(res.campos[k]))
        primeiro = primeiro || campos[k]
      })
      if (primeiro) {
        mostrarAviso(form, 'Confira os campos destacados.', '')
        return primeiro.focus()
      }
    }
    var titulo = 'Não conseguimos registrar seu contato.'
    var detalhe =
      res.status === 0 ? 'Sem conexão com o servidor: confira sua internet e tente de novo.'
        : res.status === 429 ? res.erro || 'Recebemos muitos envios da sua conexão nos últimos minutos. Aguarde uns 10 minutos e envie de novo.'
          : res.status === 413 || res.status === 400 || res.status === 503 ? res.erro || 'Confira os dados e envie de novo.'
            : 'Pode ter sido uma falha passageira: tente de novo em instantes.'
    var saidas = []
    if (WHATSAPP) saidas.push(saidaLink(whatsAberto ? 'Reabrir o WhatsApp' : 'Falar pelo WhatsApp', linkWhatsApp(d)))
    if (EMAIL_CONTATO) saidas.push(saidaLink('Enviar por e-mail', linkEmail(d)))
    var tentar = document.createElement('button')
    tentar.type = 'button'
    tentar.className = 'oc-aviso-acao'
    tentar.setAttribute('data-oc-tentar', '')
    tentar.textContent = 'Tentar de novo'
    saidas.push(tentar)
    mostrarAviso(form, titulo, detalhe + ' Seus dados continuam no formulário.', saidas)
  }

  function sucesso(form, tipo, url, aberto) {
    if (tipo === 'parceiro') {
      var wrapper = form.closest('[data-parceiro-wrapper]')
      var tplP = document.getElementById('tpl-sucesso-parceiro')
      if (wrapper && tplP) {
        wrapper.innerHTML = tplP.innerHTML
        var h = wrapper.querySelector('h3')
        if (h) { h.setAttribute('tabindex', '-1'); h.focus() }
        return
      }
    }
    form.reset()
    Object.values(mapearCampos(form)).forEach(function (el) { marcarErro(el, '') })
    var tpl = document.getElementById('tpl-sucesso-contato')
    var aviso
    if (tpl && tipo === 'contato') {
      aviso = tpl.content.firstElementChild.cloneNode(true)
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
    } else {
      // página sem o modelo do aviso: um aviso simples no lugar (nunca "Processando..." para sempre)
      aviso = document.createElement('div')
      aviso.className = 'oc-aviso oc-aviso-ok'
      var forte = document.createElement('strong')
      forte.textContent = 'Recebemos seus dados.'
      aviso.appendChild(forte)
      aviso.appendChild(document.createTextNode(' Nossa equipe entrará em contato em breve.'))
      form.insertBefore(aviso, form.firstChild)
    }
    aviso.setAttribute('data-aviso-sucesso', '')
    aviso.setAttribute('role', 'status')
    aviso.setAttribute('tabindex', '-1')
    aviso.focus()
    if (!aberto && url) window.location.href = url
  }

  // 5) Compartilhar artigo
  function compartilhar() {
    var dados = { title: document.title, url: location.href }
    if (navigator.share) return navigator.share(dados).catch(function () {})
    var copiar = navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()
    copiar.then(function () { alert('Link copiado!') }, function () { window.prompt('Copie o link:', location.href) })
  }

  // 6) Selo 3D do destaque — mesma rotina do brasão 3D do original:
  //    inclina até 8° seguindo o mouse (9° no toque), balança sozinho e inclina ao rolar.
  //    Só anima enquanto o selo está na tela (fora dela, ou em página sem selo, nenhum quadro roda).
  var giro = { alvoX: 0, alvoY: 0, x: 0, y: 0, rolagemAlvo: 0, rolagem: 0 }
  var emblemas = [], naTela = {}, rodando = false
  function algumNaTela() { return Object.keys(naTela).some(function (k) { return naTela[k] }) }
  function emblemaVisivel() {
    for (var i = 0; i < emblemas.length; i++) if (naTela[i]) return emblemas[i]
    return null
  }
  function quadro() {
    if (!algumNaTela() || document.hidden) { rodando = false; return }
    var agora = performance.now()
    var ondaY = 4 * Math.sin(0.0014 * agora)
    var ondaX = 2.5 * Math.cos(0.0011 * agora)
    giro.rolagem += (giro.rolagemAlvo - giro.rolagem) * 0.08
    giro.x += (giro.alvoX - giro.x) * 0.08
    giro.y += (giro.alvoY - giro.y) * 0.08
    var rx = 10 + giro.x + ondaX + 0.6 * giro.rolagem
    var ry = -16 + giro.y + ondaY - 0.4 * giro.rolagem
    var t = 'perspective(1200px) rotateX(' + rx.toFixed(2) + 'deg) rotateY(' + ry.toFixed(2) + 'deg) rotateZ(2.5deg)'
    emblemas.forEach(function (el, i) { if (naTela[i]) el.style.transform = t })
    requestAnimationFrame(quadro)
  }
  function animarGiro() {
    if (!rodando && algumNaTela() && !document.hidden) { rodando = true; requestAnimationFrame(quadro) }
  }
  function iniciarGiro() {
    emblemas = [].slice.call(document.querySelectorAll('[data-emblema-giro]'))
    if (!emblemas.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    document.querySelectorAll('[data-emblema-topo]').forEach(function (el) { el.style.transform = 'translateZ(28px)' })
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) { naTela[emblemas.indexOf(e.target)] = e.isIntersecting })
        animarGiro()
      })
      emblemas.forEach(function (el) { io.observe(el) })
    } else {
      emblemas.forEach(function (el, i) { naTela[i] = true })
      animarGiro()
    }
    document.addEventListener('visibilitychange', animarGiro)
    window.addEventListener('mousemove', function (e) {
      var el = emblemaVisivel()
      if (!el) return
      var r = el.getBoundingClientRect()
      var sx = ((e.clientX - r.left) / r.width) * 2 - 1
      var sy = ((e.clientY - r.top) / r.height) * 2 - 1
      var perto = e.clientX >= r.left - 450 && e.clientX <= r.right + 450 && e.clientY >= r.top - 450 && e.clientY <= r.bottom + 450
      giro.alvoX = perto ? -(8 * sy) : 0
      giro.alvoY = perto ? 8 * sx : 0
    }, { passive: true })
    window.addEventListener('touchmove', function (e) {
      var el = emblemaVisivel()
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
  }

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
    if (rotulo === 'Abrir menu') return abrirMenu(b)
    if (rotulo === 'Fechar menu') return fecharMenu()
    if (b.closest('[data-menu-aberto]') && b.tagName === 'A') return fecharMenu()
    if (rotulo === 'Fechar aviso') {
      var aviso = b.closest('[data-aviso-sucesso]')
      if (aviso) aviso.remove()
      return
    }
    if (b.hasAttribute('data-oc-tentar')) {
      var f = b.closest('form')
      if (f && !f.__enviando) enviar(f)
      return
    }
    if (b.tagName === 'BUTTON' && /Enviar nova solicita/.test(texto(b))) {
      var w = b.closest('[data-parceiro-wrapper]')
      if (w && w.__original) {
        w.innerHTML = w.__original
        var novo = w.querySelector('form[data-form]')
        if (novo) {
          preparar(novo)
          var primeiro = novo.querySelector('input')
          if (primeiro) primeiro.focus()
        }
      }
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
  // erro de imagem do radar (delegado: sem onerror no HTML, que uma CSP sem 'unsafe-inline' bloquearia)
  document.addEventListener('error', function (ev) {
    var img = ev.target
    if (!img || img.tagName !== 'IMG' || !img.closest('.radar-card')) return
    var reserva = img.getAttribute('data-reserva')
    if (reserva && img.src !== reserva) { img.removeAttribute('data-reserva'); img.src = reserva; return }
    img.closest('.radar-card').remove()
  }, true)
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
          '<div class="radar-foto"><img src="' + esc(n.imagem) + '"' + reserva + ' alt="" loading="lazy" referrerpolicy="no-referrer"/></div>' +
          '<div class="radar-corpo"><div class="radar-topo"><span>' + esc(n.tema) + '</span><i></i><time datetime="' + esc(n.data) + '">' + quando(n.data) + '</time></div>' +
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
    if (!form.getAttribute('data-form')) return
    ev.preventDefault()
    enviar(form)
  })
  document.addEventListener('focusout', function (ev) {
    var el = ev.target
    if (el && el.form && el.form.__pronto && el.getAttribute('data-campo') && !el.readOnly) aoSair(el)
  })
  document.addEventListener('input', function (ev) {
    var el = ev.target
    // campo marcado com erro: some a mensagem assim que o valor fica certo
    if (el && el.getAttribute && el.getAttribute('aria-invalid') === 'true') {
      var k = el.getAttribute('data-campo')
      if (REGRAS[k] && !REGRAS[k](limpar(el.value, k === 'mensagem'), el)) marcarErro(el, '')
    }
  })
  document.addEventListener('change', function (ev) {
    var el = ev.target
    if (el && el.tagName === 'SELECT' && el.getAttribute('aria-invalid') === 'true') validarCampo(el)
  })

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') fecharMenu()
  })

  function iniciar() {
    document.querySelectorAll('[data-parceiro-wrapper]').forEach(function (w) { w.__original = w.innerHTML })
    document.querySelectorAll('form[data-form]').forEach(preparar)
    radares()
    animar()
    iniciarGiro()
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar)
  else iniciar()
})()
