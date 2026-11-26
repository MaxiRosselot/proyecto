// Abrir un chat sin recargar WhatsApp: el panel le pide (postMessage) abrir el chat de un numero, y
// aqui se hace como cuando tocas un link wa.me dentro de un chat: WhatsApp lo abre al instante, con el
// texto escrito si viene. No envia nada. Si WhatsApp no lo toma, se avisa al panel para que recargue.
// Solo dentro del panel (en su propia pestaña no hace nada) y solo atiende al panel.
// Numero sin WhatsApp: WhatsApp muestra un aviso ("Phone number shared via url is invalid" / "no es
// válido") que bloquea abrir otros chats. Se cierra y se le avisa al panel, que lo deja aparte.
// (en ingles hoy dice: "The number +56 9 ... isn't on WhatsApp.")
const INVALIDO = /isn.t on whatsapp|not on whatsapp|no est[aá] en whatsapp|no tiene whatsapp|invalid|inv[aá]lido|no es v[aá]lido/i
function avisoInvalido() {
  const marcado = [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')].find(d => INVALIDO.test(d.textContent || ''))
  if (marcado) return marcado
  // Si WhatsApp cambia como marca sus avisos: el texto, y subir hasta lo que tenga el boton OK.
  const recorrer = document.createTreeWalker(document.querySelector('#app') || document.body, NodeFilter.SHOW_TEXT)
  for (let n = recorrer.nextNode(); n; n = recorrer.nextNode()) {
    if (!INVALIDO.test(n.nodeValue || '')) continue
    // Solo un aviso chico (poco texto, uno o dos botones): nunca un mensaje de un chat que diga "invalid".
    if (n.parentElement?.closest('#main, #side')) continue
    for (let el = n.parentElement, i = 0; el && i < 8; el = el.parentElement, i++) {
      const botones = el.querySelectorAll('button, [role="button"]').length
      if ((el.textContent || '').length > 300) break
      if (botones >= 1 && botones <= 2) return el
    }
  }
  return null
}
function cerrarAvisoInvalido() {
  const d = avisoInvalido()
  if (!d) return false
  const b = [...d.querySelectorAll('button, [role="button"]')].at(-1)
  if (b) b.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  return true
}
let vigilando = 0
function vigilarInvalido(tel, origen) {
  const turno = ++vigilando, inicio = Date.now()
  const mirar = () => {
    if (turno !== vigilando) return
    if (cerrarAvisoInvalido()) return window.parent.postMessage({ dm: 'sin-whatsapp', telefono: tel }, origen)
    if (Date.now() - inicio < 6000) setTimeout(mirar, 250)
  }
  setTimeout(mirar, 250)
}

if (window.top !== window) {
  const PANELES = /^(https:\/\/(www\.)?repisasdonmaxi\.cl|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/
  window.addEventListener('message', ev => {
    const d = ev.data
    if (!PANELES.test(ev.origin) || !d) return
    if (d.dm === 'adjuntar') return adjuntar(d, ev.origin)
    if (d.dm !== 'abrir-chat') return
    const responder = ok => window.parent.postMessage({ dm: 'chat', id: d.id, ok }, ev.origin)
    const raiz = document.querySelector('#app')
    const tel = String(d.telefono || '').replace(/\D/g, '')
    if (!raiz || !tel || !document.querySelector('#side')) return responder(false) // cargando o sin sesion
    cerrarAvisoInvalido() // si quedo el aviso de un numero sin WhatsApp, no deja abrir otro chat
    const a = document.createElement('a')
    a.href = `https://wa.me/${tel}${d.texto ? '?text=' + encodeURIComponent(d.texto) : ''}`
    a.style.display = 'none'
    // Si WhatsApp no lo atrapa, que no navegue: el panel recarga con el metodo de siempre.
    const despues = e => {
      window.removeEventListener('click', despues)
      if (!e.defaultPrevented) { e.preventDefault(); responder(false) } else { responder(true); vigilarInvalido(tel, ev.origin) }
    }
    window.addEventListener('click', despues)
    raiz.appendChild(a)
    a.click()
    a.remove()
  })
}

// Atajos del panel desde dentro de WhatsApp: ↓/↑ y Alt+↓/↑ (cliente siguiente/anterior) y Alt+1…9 (escribir ese
// mensaje en su chat). Solo se le pasa al panel que tecla fue; WhatsApp no ve esas teclas.
if (window.top !== window) {
  const PANEL = /^(https:\/\/(www\.)?repisasdonmaxi\.cl|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/
  const origen = (location.ancestorOrigins && location.ancestorOrigins[0]) || ''
  if (PANEL.test(origen)) {
    // ↑/↓ solas tambien van al panel cuando no estas escribiendo: la caja del chat vacia (en WhatsApp ↑
    // ahi es "editar el ultimo mensaje") o nada para escribir enfocado. En el buscador de WhatsApp, en
    // un texto a medias o moviendote por la lista de chats, las flechas siguen siendo de WhatsApp.
    const sinEscribir = () => {
      const el = document.activeElement
      if (!el || el === document.body || el === document.documentElement) return true
      if (el.matches('#main footer [contenteditable="true"]')) return !(el.textContent || '').trim()
      return false
    }
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || (e.shiftKey && !e.altKey)) return // Ctrl+Alt = AltGr (@, #...): de WhatsApp
      const flecha = e.key === 'ArrowDown' || e.key === 'ArrowUp'
      if (!e.altKey && !(flecha && sinEscribir())) return
      if (!(flecha || /^(Digit|Numpad)[1-9]$/.test(e.code))) return
      e.preventDefault(); e.stopImmediatePropagation()
      window.parent.postMessage({ dm: 'tecla', key: e.key, code: e.code, altKey: true, shiftKey: e.shiftKey }, origen)
    }, true)
  }
}

// Dejar un PDF adjunto en el chat de un numero, con su texto, SIN ENVIAR: se abre su chat y se le
// entrega el archivo a WhatsApp como si lo pegaras, lo soltaras o lo eligieras en "Documento"; WhatsApp
// muestra la vista previa y tu das Enter. Solo se responde ok si la vista previa aparecio de verdad.
// Responde { dm: 'adjunto', id, ok, motivo, como }.
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function hasta(fn, ms) { const fin = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() > fin) return v; await esperar(150) } }
const editables = () => new Set(document.querySelectorAll('[contenteditable="true"]'))
// La vista previa trae su propio campo para el comentario: aparece un editable que antes no estaba.
const nuevoEditable = antes => [...document.querySelectorAll('[contenteditable="true"]')].find(el => !antes.has(el) && el.offsetParent)
function conArchivo(archivo) { const dt = new DataTransfer(); dt.items.add(archivo); return dt }

// En el WhatsApp real (2026-11-26) funciona pegar; soltar no lo toma. Las otras quedan de respaldo.
const MANERAS = {
  pegar: async (main, archivo) => {
    const composer = main.querySelector('footer [contenteditable="true"]')
    if (!composer) return
    composer.focus()
    composer.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: conArchivo(archivo) }))
  },
  soltar: async (main, archivo) => {
    const r = main.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2
    const ev = (tipo, el) => el && el.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y, dataTransfer: conArchivo(archivo) }))
    const debajo = document.elementFromPoint(x, y) || main
    ev('dragenter', debajo); ev('dragover', debajo)
    await esperar(400) // WhatsApp pone su zona para soltar encima
    const zona = document.elementFromPoint(x, y) || debajo
    ev('dragover', zona); ev('drop', zona)
  },
  documento: async (main, archivo) => {
    const boton = main.querySelector('footer [data-icon="plus-rounded"], footer [data-icon="plus"], footer [data-icon="clip"], footer [aria-label="Attach"], footer [aria-label="Adjuntar"], footer [title="Attach"], footer [title="Adjuntar"]')
    ;(boton?.closest('button, [role="button"]') || boton)?.click()
    const input = await hasta(() => [...document.querySelectorAll('input[type="file"]')].find(i => !/image|video/.test(i.accept || '') || i.accept === '*'), 1500)
    if (!input) { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); return }
    input.files = conArchivo(archivo).files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  },
}

async function adjuntar(d, origen) {
  const responder = (ok, motivo = '', como = '') => window.parent.postMessage({ dm: 'adjunto', id: d.id, ok, motivo, como }, origen)
  const tel = String(d.telefono || '').replace(/\D/g, '')
  const raiz = document.querySelector('#app')
  if (!raiz || !tel || !document.querySelector('#side') || !d.archivo) return responder(false, 'sin-sesion')
  cerrarAvisoInvalido()
  const a = document.createElement('a')
  a.href = `https://wa.me/${tel}`
  a.style.display = 'none'
  let tomado = false
  const despues = e => { window.removeEventListener('click', despues); tomado = e.defaultPrevented; if (!tomado) e.preventDefault() }
  window.addEventListener('click', despues)
  raiz.appendChild(a); a.click(); a.remove()
  if (!tomado) return responder(false, 'sin-chat') // WhatsApp no tomo el link: que no navegue
  await esperar(900)
  if (avisoInvalido()) { cerrarAvisoInvalido(); window.parent.postMessage({ dm: 'sin-whatsapp', telefono: tel }, origen); return responder(false, 'sin-whatsapp') }
  const main = await hasta(() => { const m = document.querySelector('#main'); return m && m.querySelector('footer [contenteditable="true"]') ? m : null }, 5000)
  if (!main) return responder(false, avisoInvalido() ? 'sin-whatsapp' : 'sin-chat')
  const archivo = new File([d.archivo], d.nombre || 'Cotizacion.pdf', { type: 'application/pdf' })
  // Funciono cuando la vista previa muestra el nombre del archivo (en el WhatsApp real tarda hasta
  // ~25 s con un PDF de 700 kB, comentario incluido). Se prueba UNA manera a la vez y se espera de verdad antes de la
  // siguiente: si no, quedan copias del PDF.
  const conNombre = () => { let n = 0; const w = document.createTreeWalker(document.querySelector('#app') || document.body, NodeFilter.SHOW_TEXT); for (let t = w.nextNode(); t; t = w.nextNode()) if ((t.nodeValue || '').includes(archivo.name)) n++; return n }
  for (const [como, hacer] of Object.entries(MANERAS)) {
    const antes = editables(), nombres = conNombre()
    try { await hacer(main, archivo) } catch { continue }
    if (!await hasta(() => conNombre() > nombres || nuevoEditable(antes), 20000)) continue
    // El comentario: el campo de la vista previa, cuando termina de cargar.
    if (d.texto) {
      const campo = await hasta(() => nuevoEditable(antes), 15000)
      if (campo) { campo.focus(); document.execCommand('insertText', false, d.texto) }
      return responder(true, campo ? '' : 'sin-comentario', como)
    }
    return responder(true, '', como)
  }
  responder(false, 'no-adjunto')
}
