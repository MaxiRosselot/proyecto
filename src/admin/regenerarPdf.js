// Rehace el PDF de una cotizacion guardada con lo que tiene hoy (servicios, precios, total) y su
// modelo 3D, lo sube a Drive y deja el link nuevo en la cotizacion. Lo usa Cotizaciones despues de
// agregar servicios al agendar, para que el cliente reciba un PDF al dia.
import { adminFetch, apiFetch } from './utils.js'

const URL_3D = (import.meta.env.VITE_REPISAS_3D_URL || window.location.origin).replace(/\/$/, '')
const ORIGEN_3D = new URL(URL_3D).origin
const PROTOCOLO = '1'

function bytesABase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binario = ''
  for (let i = 0; i < bytes.length; i += 8192) binario += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192))
  return btoa(binario)
}

// Las dos vistas del PDF.
function vistasDelProyecto(project) {
  const sala = project.room
  const proporcion = sala ? Math.min(.88, Math.max(.5, sala.backWallCm / Math.min(sala.leftWallCm, sala.rightWallCm))) : .55
  return dibujarVistas(project, [{ view: 'isometric', width: 860, height: 1080 }, { view: 'top', width: Math.round(1080 * proporcion), height: 1080 }])
}

// Vistas de un proyecto, dibujadas en un visor 3D fuera de pantalla (mismo protocolo que el cotizador).
// Devuelve { isometric: 'data:image/png;base64,…', … }. La usan el PDF y la ficha del maestro.
export function dibujarVistas(project, views) {
  const url = new URL('/embed', URL_3D)
  url.searchParams.set('mode', 'quote')
  url.searchParams.set('parentOrigin', window.location.origin)
  url.searchParams.set('protocolVersion', PROTOCOLO)

  const frame = document.createElement('iframe')
  frame.src = url.toString()
  frame.title = 'Dibujo del PDF'
  frame.setAttribute('aria-hidden', 'true')
  // Fuera de la vista pero con tamaño real: el visor necesita medir para dibujar.
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '900px', height: '1100px', border: '0' })
  document.body.appendChild(frame)

  return new Promise((resolve, reject) => {
    const exportId = crypto.randomUUID()
    const reloj = setTimeout(() => terminar(new Error('El dibujo 3D tardó demasiado')), 45000)
    function terminar(error, imagenes) {
      clearTimeout(reloj); window.removeEventListener('message', escuchar); frame.remove()
      error ? reject(error) : resolve(imagenes)
    }
    const enviar = (type, payload, requestId = crypto.randomUUID()) =>
      frame.contentWindow?.postMessage({ type, version: PROTOCOLO, requestId, payload }, ORIGEN_3D)
    function escuchar(event) {
      if (event.origin !== ORIGEN_3D || event.source !== frame.contentWindow) return
      const msg = event.data
      if (msg?.version !== PROTOCOLO) return
      if (msg.type === 'repisas:ready') enviar('repisas:load-project', { project })
      if (msg.type === 'repisas:project-invalid') terminar(new Error('El modelo 3D guardado no es válido'))
      // Una vez cargado, se le da un respiro al visor antes de pedir las vistas.
      if (msg.type === 'repisas:project-loaded') setTimeout(() => enviar('repisas:export-request', { kind: 'quote-views', views }, exportId), 400)
      if (msg.type === 'repisas:export-complete' && msg.requestId === exportId && msg.payload?.images) {
        terminar(null, Object.fromEntries(msg.payload.images.map(i => [i.view, 'data:image/png;base64,' + bytesABase64(i.bytes)])))
      }
      if (msg.type === 'repisas:error') terminar(new Error(msg.payload?.message || 'No se pudo dibujar el modelo'))
    }
    window.addEventListener('message', escuchar)
  })
}

export async function regenerarPdf(cotNum, { alAvanzar = () => {} } = {}) {
  alAvanzar('Leyendo la cotización')
  const { ok, quote, error } = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(cotNum))
  if (!ok || !quote) throw new Error(error || 'No se encontró la cotización')

  let grafica3d
  if (quote.proyecto3d) {
    alAvanzar('Dibujando el modelo 3D')
    grafica3d = await vistasDelProyecto(quote.proyecto3d)
  }

  alAvanzar('Armando el PDF')
  const res = await adminFetch('/.netlify/functions/generate-quote', {
    method: 'POST',
    body: JSON.stringify({
      cot_num: quote.cotNum, nombre: quote.nombre, direccion: quote.direccion, rut: '',
      telefono: quote.telefono, email: quote.email,
      repisas: quote.repisas, ...quote.adicionales,
      ...(grafica3d ? { grafica3d } : {}),
    }),
  })
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'No se pudo armar el PDF') }
  const blob = await res.blob()

  alAvanzar('Subiendo a Drive')
  const nombre = (quote.nombre || 'cliente').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
  const subida = await apiFetch('/.netlify/functions/upload-pdf', {
    method: 'POST',
    body: JSON.stringify({ pdfBase64: bytesABase64(await blob.arrayBuffer()), fileName: `Cotizacion ${nombre} - Repisas Don Maxi.pdf`, cotNum: quote.cotNum }),
  })
  if (!subida.ok || !subida.viewUrl) throw new Error(subida.error || 'No se pudo subir el PDF a Drive')
  const guardado = await apiFetch('/.netlify/functions/save-quote', { method: 'POST', body: JSON.stringify({ cotNum: quote.cotNum, pdfUrl: subida.viewUrl }) })
  if (!guardado.ok) throw new Error(guardado.error || 'No se guardó el link del PDF')
  return { pdfUrl: subida.viewUrl, blobUrl: URL.createObjectURL(blob) }
}
