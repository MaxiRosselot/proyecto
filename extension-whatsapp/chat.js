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
