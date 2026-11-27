// En BCI en línea → Cuentas → Mis Movimientos: lee la tabla (fecha, fecha contable, descripción,
// monto y saldo) y la guarda en la extensión para que el panel la traiga sola al abrir Contabilidad.
// Solo lee texto de la página. No escribe en el banco, no hace clics y nunca toca campos de clave.
(() => {
  const FILA = /(\d\d\/\d\d\/\d\d(?:\d\d)?)\s+(\d\d\/\d\d\/\d\d(?:\d\d)?)\s+(.+?)\s+([+-])\s*\$\s*([\d.]+)\s+\$\s*(-?[\d.]+)/g
  const numero = s => Number(String(s).replace(/\./g, ''))

  // Primero fila por fila (tr o role=row); si la página no usa filas, todo el texto.
  function leer() {
    const filas = [...document.querySelectorAll('tr, [role="row"]')].map(e => e.innerText.replace(/\s+/g, ' ').trim())
    let textos = filas.filter(t => /^\d\d\/\d\d\/\d\d/.test(t))
    if (!textos.length) textos = [document.body?.innerText.replace(/\s+/g, ' ') || '']
    const lista = []
    for (const t of textos) {
      for (const m of t.matchAll(FILA)) {
        lista.push({ fecha: m[1], fechaContable: m[2], descripcion: m[3].trim(), monto: (m[4] === '-' ? -1 : 1) * numero(m[5]), saldo: numero(m[6]) })
      }
    }
    return lista
  }

  // Lo más nuevo arriba: cada saldo = el de abajo + su monto. Si no, falta algo entre medio.
  const encadena = l => l.every((a, i) => i + 1 >= l.length || l[i + 1].saldo + a.monto === a.saldo)

  let aviso
  function mostrar(texto, ok) {
    if (window.top !== window && !document.querySelector('tr, [role="row"]')) return
    if (!aviso) {
      aviso = document.createElement('div')
      aviso.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;padding:10px 14px;border-radius:12px;font:600 13px system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.18);max-width:320px;cursor:pointer'
      aviso.title = 'Clic para ocultar'
      aviso.onclick = () => aviso.remove()
      document.body.appendChild(aviso)
    }
    aviso.style.background = ok ? '#F0FDF4' : '#FEF3C7'
    aviso.style.color = ok ? '#166534' : '#92400E'
    aviso.textContent = texto
  }

  let ultimo = ''
  async function revisar() {
    const lista = leer()
    if (!lista.length) return
    const firma = JSON.stringify(lista)
    if (firma === ultimo) return
    ultimo = firma
    const { bci = { movimientos: [] } } = await chrome.storage.local.get('bci')
    // Se junta con lo leído antes (otra página de la lista, otro día) sin repetir: el saldo después
    // de cada movimiento lo hace único.
    const clave = m => `${m.fechaContable}|${m.monto}|${m.saldo}|${m.descripcion}`
    const todos = new Map(bci.movimientos.map(m => [clave(m), m]))
    let nuevos = 0
    for (const m of lista) if (!todos.has(clave(m))) { todos.set(clave(m), m); nuevos++ }
    await chrome.storage.local.set({ bci: { movimientos: [...todos.values()], leidoEn: new Date().toISOString() } })
    const cuadra = encadena(lista)
    mostrar(`Don Maxi: ${lista.length} movimientos leídos${nuevos ? ` (${nuevos} nuevos)` : ''}. ${cuadra ? 'Los saldos encadenan ✓.' : '⚠ Los saldos no encadenan: puede faltar una página.'} Abre Contabilidad en el panel para traerlos.`, cuadra)
  }

  let espera
  const programar = () => { clearTimeout(espera); espera = setTimeout(() => revisar().catch(() => {}), 800) }
  programar()
  new MutationObserver(programar).observe(document.documentElement, { childList: true, subtree: true, characterData: true })
})()
