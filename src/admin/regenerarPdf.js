// Rehace el PDF de una cotizacion guardada con lo que tiene hoy (servicios, precios, total) y su
// modelo 3D, lo sube a Drive y deja el link nuevo en la cotizacion. Lo usa Cotizaciones despues de
// agregar servicios al agendar, para que el cliente reciba un PDF al dia.
import { adminFetch, apiFetch } from './utils.js'
import { filasDeModulos, productoCotizacion } from './modulosCotizacion.js'
import { comparacion } from './alternativas.js'
import { totalesCotizacion } from '../../netlify/functions/lib/totales.mjs'

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
export async function dibujarVistas(project, views) {
  return (await planificarYDibujar(project, views)).imagenes
}

// Lo mismo, y ademas los modulos que planifica el visor (con eso se pone precio a una alternativa).
export function planificarYDibujar(project, views) {
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
    let modulos = []
    function terminar(error, imagenes) {
      clearTimeout(reloj); window.removeEventListener('message', escuchar); frame.remove()
      error ? reject(error) : resolve({ imagenes, modulos })
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
      if (msg.type === 'repisas:project-loaded') modulos = msg.payload?.modules || []
      if (msg.type === 'repisas:project-loaded') setTimeout(() => enviar('repisas:export-request', { kind: 'quote-views', views }, exportId), 400)
      if (msg.type === 'repisas:export-complete' && msg.requestId === exportId && msg.payload?.images) {
        terminar(null, Object.fromEntries(msg.payload.images.map(i => [i.view, 'data:image/png;base64,' + bytesABase64(i.bytes)])))
      }
      if (msg.type === 'repisas:error') terminar(new Error(msg.payload?.message || 'No se pudo dibujar el modelo'))
    }
    window.addEventListener('message', escuchar)
  })
}

export const VISTA_ALTERNATIVA = { view: 'isometric', width: 560, height: 460 }

export async function regenerarPdf(cotNum, { alAvanzar = () => {} } = {}) {
  alAvanzar('Leyendo la cotización')
  const { ok, quote, error } = await apiFetch('/.netlify/functions/get-quotes?cotNum=' + encodeURIComponent(cotNum))
  if (!ok || !quote) throw new Error(error || 'No se encontró la cotización')

  let grafica3d
  if (quote.proyecto3d) {
    alAvanzar('Dibujando el modelo 3D')
    grafica3d = await vistasDelProyecto(quote.proyecto3d)
  }

  // Las otras opciones (pagina 5) se dibujan de nuevo desde su modelo.
  const alternativas = []
  for (const a of quote.alternativas || []) {
    if (!a.proyecto) continue
    alAvanzar(`Dibujando la opción ${alternativas.length + 2}`)
    const { imagenes } = await planificarYDibujar(a.proyecto, [VISTA_ALTERNATIVA])
    alternativas.push({ titulo: a.titulo, etiqueta: a.etiqueta, descripcion: a.descripcion, comparacion: a.comparacion, repisas: a.repisas, imagen: imagenes?.isometric || null })
  }

  alAvanzar('Armando el PDF')
  const res = await adminFetch('/.netlify/functions/generate-quote', {
    method: 'POST',
    body: JSON.stringify({
      cot_num: quote.cotNum, nombre: quote.nombre, direccion: quote.direccion, rut: '',
      telefono: quote.telefono, email: quote.email,
      repisas: quote.repisas, ...quote.adicionales,
      ...(grafica3d ? { grafica3d } : {}),
      ...(alternativas.length ? { alternativas } : {}),
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

// Una alternativa con precio, como la cotizacion: los modulos que planifica el visor, al precio de
// la tabla (los que calzan con la cotizada mantienen su precio, y los racks el suyo), con los
// mismos servicios. "Solo un muro" sube 20%. null si alguna medida no esta en la tabla.
export async function precioAlternativa(alternativa, { principal, tabla, adicionales }) {
  const { imagenes, modulos } = await planificarYDibujar(alternativa.proyecto, [VISTA_ALTERNATIVA])
  const filas = filasDeModulos(modulos, principal.filas || [], tabla)
  if (!filas.length || filas.some(f => !(f.v > 0))) return null
  const recargo = alternativa.recargo || 1
  const repisas = filas.map(f => productoCotizacion({ ...f, v: Math.round(f.v * recargo / 100) * 100 }))
  const { recargo_pct: _, ...servicios } = adicionales || {}
  const t = totalesCotizacion(repisas, servicios)
  const lista = { ...alternativa, repisas, subtotal: t.subtotal, iva: t.iva, total: t.total, imagen: imagenes?.isometric || null }
  return { ...lista, comparacion: comparacion(lista, principal) }
}

// Cambia una cotizacion a una de sus otras opciones: esa pasa a ser la principal (repisas, modelo 3D
// y totales, con los mismos servicios) y la que estaba queda como "Opción anterior" en la pagina 5.
// Las comparaciones se rehacen contra la nueva principal. Despues hay que regenerar el PDF.
export function cambiarAOpcion(quote, tipo) {
  const elegida = (quote.alternativas || []).find(a => a.tipo === tipo)
  if (!elegida) throw new Error('No se encontró esa opción')
  const t = totalesCotizacion(elegida.repisas, quote.adicionales || {})
  const principal = { repisas: elegida.repisas, total: t.total }
  const anterior = { id: 'anterior', tipo: 'anterior', titulo: 'Opción anterior', etiqueta: Number(quote.total) > t.total ? 'Más espacio' : 'Más económica',
    descripcion: 'La distribución que te cotizamos primero.', repisas: quote.repisas || [], proyecto: quote.proyecto3d || null,
    subtotal: Number(quote.subtotal) || 0, iva: Number(quote.iva) || 0, total: Number(quote.total) || 0 }
  const resto = [anterior, ...(quote.alternativas || []).filter(a => a.tipo !== tipo)]
    .filter(a => a.proyecto)
    .slice(0, 2)
    .map(a => ({ ...a, comparacion: comparacion(a, principal) }))
  return { repisas: elegida.repisas, proyecto3d: elegida.proyecto, subtotal: t.subtotal, iva: t.iva, total: t.total, alternativas: resto }
}
