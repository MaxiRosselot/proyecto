// Abrir un chat sin recargar WhatsApp: el panel le pide (postMessage) abrir el chat de un numero, y
// aqui se hace como cuando tocas un link wa.me dentro de un chat: WhatsApp lo abre al instante, con el
// texto escrito si viene. No envia nada. Si WhatsApp no lo toma, se avisa al panel para que recargue.
// Solo dentro del panel (en su propia pestaña no hace nada) y solo atiende al panel.
// Numero sin WhatsApp: WhatsApp muestra un aviso ("Phone number shared via url is invalid" / "no es
// válido") que bloquea abrir otros chats. Se cierra y se le avisa al panel, que lo deja aparte.
const INVALIDO = /invalid|inv[aá]lido|no es v[aá]lido|not on whatsapp|no est[aá] en whatsapp/i
function avisoInvalido() {
  return [...document.querySelectorAll('[role="dialog"], [data-animate-modal-popup="true"]')].find(d => INVALIDO.test(d.textContent || ''))
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

// Atajos del panel desde dentro de WhatsApp: Alt+↓/↑ (cliente siguiente/anterior) y Alt+1…9 (escribir ese
// mensaje en su chat). Solo se le pasa al panel que tecla fue; WhatsApp no ve esas teclas.
if (window.top !== window) {
  const PANEL = /^(https:\/\/(www\.)?repisasdonmaxi\.cl|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/
  const origen = (location.ancestorOrigins && location.ancestorOrigins[0]) || ''
  if (PANEL.test(origen)) {
    window.addEventListener('keydown', e => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (!(e.key === 'ArrowDown' || e.key === 'ArrowUp' || /^(Digit|Numpad)[1-9]$/.test(e.code))) return
      e.preventDefault(); e.stopImmediatePropagation()
      window.parent.postMessage({ dm: 'tecla', key: e.key, code: e.code, altKey: true, shiftKey: e.shiftKey }, origen)
    }, true)
  }
}

// Dejar un PDF adjunto en el chat de un numero, con su texto, SIN ENVIAR: se abre su chat y se suelta
// el archivo sobre la conversacion como cuando lo arrastras; WhatsApp muestra la vista previa y tu das
// Enter. Responde { dm: 'adjunto', id, ok } (ok false: no habia sesion o no aparecio el chat).
const esperar = ms => new Promise(r => setTimeout(r, ms))
async function hasta(fn, ms) { const fin = Date.now() + ms; for (;;) { const v = fn(); if (v || Date.now() > fin) return v; await esperar(150) } }
async function adjuntar(d, origen) {
  const responder = (ok, motivo = '') => window.parent.postMessage({ dm: 'adjunto', id: d.id, ok, motivo }, origen)
  const tel = String(d.telefono || '').replace(/\D/g, '')
  const raiz = document.querySelector('#app')
  if (!raiz || !tel || !document.querySelector('#side') || !d.archivo) return responder(false, 'sin-sesion')
  cerrarAvisoInvalido()
  const antes = document.querySelector('#main')
  const a = document.createElement('a')
  a.href = `https://wa.me/${tel}`
  a.style.display = 'none'
  let tomado = false
  const despues = e => { window.removeEventListener('click', despues); tomado = e.defaultPrevented; if (!tomado) e.preventDefault() }
  window.addEventListener('click', despues)
  raiz.appendChild(a); a.click(); a.remove()
  if (!tomado) return responder(false, 'sin-chat') // WhatsApp no tomo el link: que no navegue
  await esperar(500)
  if (await hasta(() => avisoInvalido(), 1500)) { cerrarAvisoInvalido(); window.parent.postMessage({ dm: 'sin-whatsapp', telefono: tel }, origen); return responder(false, 'sin-whatsapp') }
  const main = await hasta(() => { const m = document.querySelector('#main'); return m && (m !== antes || !antes) && m.querySelector('footer') ? m : null }, 6000) || document.querySelector('#main')
  if (!main) return responder(false, 'sin-chat')
  const archivo = new File([d.archivo], d.nombre || 'Cotizacion.pdf', { type: 'application/pdf' })
  const dt = new DataTransfer()
  dt.items.add(archivo)
  for (const tipo of ['dragenter', 'dragover', 'drop']) main.dispatchEvent(new DragEvent(tipo, { bubbles: true, cancelable: true, dataTransfer: dt }))
  // El texto va como comentario del archivo, en la vista previa (si aparece el campo para escribir).
  if (d.texto) {
    const composer = main.querySelector('footer [contenteditable="true"]')
    const campo = await hasta(() => { const el = document.activeElement; return el && el.isContentEditable && el !== composer ? el : null }, 3000)
    if (campo) document.execCommand('insertText', false, d.texto)
  }
  responder(true)
}
