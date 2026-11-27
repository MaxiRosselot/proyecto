// Admin → Por cotizar: junta en una lista todo lo que falta cotizar.
//   - anotadas a mano (WhatsApp, Instagram, otro)      → pestaña "Por cotizar"
//   - fotos o videos que mandan por la web (correo)    → carpetas de Drive
//   - visitas realizadas sin cotizar                   → Google Calendar
//   - cotizaciones automaticas de /cotiza por revisar  → planilla de cotizaciones
// Una queda hecha sola si despues de que llego se hizo una cotizacion con su mismo celular.
import { telefonoWhatsapp } from '../../netlify/functions/lib/mensajes.mjs'

export const NOTA_WEB = 'Cotización web: la armó el cliente en /cotiza'
export const DIAS_WEB = 30
export const ORIGEN = {
  whatsapp: { etiqueta: 'WhatsApp', icono: '💬', color: '#128C7E', fondo: '#E7F8EF' },
  instagram: { etiqueta: 'Instagram', icono: '📸', color: '#C13584', fondo: '#FCEAF4' },
  correo: { etiqueta: 'Fotos por la web', icono: '📧', color: '#1D4ED8', fondo: '#E8F0FE' },
  visita: { etiqueta: 'Visita realizada', icono: '📏', color: '#B45309', fondo: '#FEF3E2' },
  web: { etiqueta: 'Cotización automática', icono: '🖥️', color: '#6D28D9', fondo: '#F1EBFE' },
  otro: { etiqueta: 'Otro', icono: '📝', color: '#4B5563', fondo: '#F3F4F6' },
}

const ms = fecha => {
  const t = Date.parse(String(fecha || '').length === 10 ? fecha + 'T00:00:00-03:00' : fecha)
  return Number.isNaN(t) ? null : t
}
const dia = iso => {
  const t = ms(iso)
  return t === null ? '' : new Date(t).toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
}
export function diasEsperando(creado, hoy) {
  const a = ms(creado), b = ms(hoy)
  return a === null || b === null ? 0 : Math.max(0, Math.round((b - a) / 864e5))
}

// La primera cotizacion (no del Excel) con su celular hecha desde que llego. excepto: su propio N°.
function cotizadaDespues(item, cotizaciones, excepto = '') {
  const tel = telefonoWhatsapp(item.telefono)
  if (tel.length < 11) return null
  const desde = ms(item.creado)
  return cotizaciones
    .filter(q => q.instalacion?.origen !== 'excel' && q.cotNum !== excepto && telefonoWhatsapp(q.telefono) === tel)
    .filter(q => desde === null || q.creadoMs == null || q.creadoMs >= desde)
    .sort((a, b) => (a.creadoMs ?? 0) - (b.creadoMs ?? 0))[0] || null
}

// datos: { anotadas, carpetas, visitas, cotizaciones, hoy (YYYY-MM-DD), ahoraMs? }
// → { pendientes, hechas } (pendientes: la mas antigua primero; hechas: la mas reciente primero)
export function armarPorCotizar({ anotadas = [], carpetas = [], visitas = [], cotizaciones = [], hoy, ahoraMs = Date.now() }) {
  const porRef = new Map(anotadas.filter(a => a.ref).map(a => [a.origen + ':' + a.ref, a]))
  const items = []

  for (const a of anotadas.filter(a => !a.ref)) items.push({ ...a, clave: 'a:' + a.id })

  for (const c of carpetas) {
    const marcada = porRef.get('correo:' + c.ref)
    items.push({ ...c, clave: 'correo:' + c.ref, id: marcada?.id, estado: marcada?.estado || 'pendiente', cotNum: marcada?.cotNum || '' })
  }

  for (const v of visitas) {
    const marcada = porRef.get('visita:' + v.id)
    if (v.status !== 'realizada' && !marcada) continue
    items.push({
      origen: 'visita', ref: v.id, clave: 'visita:' + v.id, id: marcada?.id, visita: v,
      creado: dia(v.start), nombre: v.nombre || '', telefono: v.celular || '', email: v.email || '', direccion: v.direccion || '',
      detalle: v.notas || '',
      estado: v.status === 'realizada_cotizada' ? 'cotizada' : (marcada?.estado || (v.status === 'realizada' ? 'pendiente' : 'descartada')),
      cotNum: marcada?.cotNum || '',
    })
  }

  const desdeWeb = ahoraMs - DIAS_WEB * 864e5
  for (const q of cotizaciones) {
    if (q.notas !== NOTA_WEB) continue
    const marcada = porRef.get('web:' + q.cotNum)
    if (!marcada && (q.status !== 'por confirmar' || (q.creadoMs ?? 0) < desdeWeb)) continue
    items.push({
      origen: 'web', ref: q.cotNum, clave: 'web:' + q.cotNum, id: marcada?.id, cotizacion: q,
      creado: q.creadoMs ? dia(new Date(q.creadoMs).toISOString()) : '', nombre: q.nombre || '', telefono: q.telefono || '',
      email: q.email || '', direccion: q.direccion || '', total: q.total,
      detalle: `La armó en /cotiza: N° ${q.cotNum}. Revisa que esté bien y, si hace falta, ajústala.`,
      estado: marcada?.estado || 'pendiente', cotNum: marcada?.cotNum || '',
    })
  }

  for (const it of items) {
    it.dias = diasEsperando(it.creado, hoy)
    if (it.estado !== 'pendiente') continue
    const q = cotizadaDespues(it, cotizaciones, it.origen === 'web' ? it.ref : '')
    if (q) { it.estado = 'cotizada'; it.cotNum = q.cotNum; it.sola = true }
  }
  const pendientes = items.filter(i => i.estado === 'pendiente').sort((a, b) => b.dias - a.dias || String(a.nombre).localeCompare(String(b.nombre)))
  const hechas = items.filter(i => i.estado !== 'pendiente').sort((a, b) => String(b.creado).localeCompare(String(a.creado)))
  return { pendientes, hechas }
}

// Mensajes para copiar o dejar en su chat. El primer nombre basta.
const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || ''
const hola = n => primerNombre(n) ? `¡Hola ${primerNombre(n)}!` : '¡Hola!'

export function mensajePedirDatosInstagram(item) {
  return `${hola(item?.nombre)} Gracias por escribirnos a Repisas Don Maxi 😊\n\n` +
    'Para cotizarte, ¿me puedes dejar tu número de WhatsApp? Por ahí te pido las medidas y unas fotos del espacio, y te envío la cotización.'
}

export function mensajePasarAWhatsapp(item) {
  return `${hola(item?.nombre)} Te escribo de Repisas Don Maxi por tu consulta en Instagram 😊\n\n` +
    'Para cotizarte, ¿me envías las medidas aproximadas del espacio (largo, fondo y alto) y unas fotos? Con eso te mando la cotización.'
}

export function mensajeRecibido(item) {
  return `${hola(item?.nombre)} Recibimos tus ${item?.origen === 'correo' ? 'fotos' : 'medidas'}, gracias 😊 ` +
    'Estamos preparando tu cotización y te la enviamos por aquí.'
}

export const linkInstagram = usuario => usuario ? 'https://ig.me/m/' + encodeURIComponent(usuario) : ''
