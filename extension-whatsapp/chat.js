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
    if (!PANELES.test(ev.origin) || !d || d.dm !== 'abrir-chat') return
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
