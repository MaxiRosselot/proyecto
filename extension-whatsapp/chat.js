// Abrir un chat sin recargar WhatsApp: el panel le pide (postMessage) abrir el chat de un numero, y
// aqui se hace como cuando tocas un link wa.me dentro de un chat: WhatsApp lo abre al instante, con el
// texto escrito si viene. No envia nada. Si WhatsApp no lo toma, se avisa al panel para que recargue.
// Solo dentro del panel (en su propia pestaña no hace nada) y solo atiende al panel.
if (window.top !== window) {
  const PANELES = /^(https:\/\/(www\.)?repisasdonmaxi\.cl|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/
  window.addEventListener('message', ev => {
    const d = ev.data
    if (!PANELES.test(ev.origin) || !d || d.dm !== 'abrir-chat') return
    const responder = ok => window.parent.postMessage({ dm: 'chat', id: d.id, ok }, ev.origin)
    const raiz = document.querySelector('#app')
    const tel = String(d.telefono || '').replace(/\D/g, '')
    if (!raiz || !tel || !document.querySelector('#side')) return responder(false) // cargando o sin sesion
    const a = document.createElement('a')
    a.href = `https://wa.me/${tel}${d.texto ? '?text=' + encodeURIComponent(d.texto) : ''}`
    a.style.display = 'none'
    // Si WhatsApp no lo atrapa, que no navegue: el panel recarga con el metodo de siempre.
    const despues = e => { window.removeEventListener('click', despues); if (!e.defaultPrevented) { e.preventDefault(); responder(false) } else responder(true) }
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
