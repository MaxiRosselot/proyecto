// Logica de la seccion WhatsApp: que clientes van en cada filtro, que mensajes sirven para cada uno
// segun en que va, y los mensajes rapidos propios (con {nombre}, {cotizacion}...).
import { estadoSeguimiento, mensajesSeguimiento, sinWhatsapp } from '../../netlify/functions/lib/seguimiento-whatsapp.mjs'
import { telefonoWhatsapp, mensajeConfirmarInstalacion, mensajeCotizacion, mensajeEnvioCotizacion, mensajeInstalacionManana, mensajeRecordatorio } from '../../netlify/functions/lib/mensajes.mjs'
import { mensajeInstalacionDe } from './whatsappInstalacion.js'

export const FILTROS = [
  { id: 'toca', nombre: 'Toca preguntar', ayuda: 'Por confirmar a las que les toca un seguimiento hoy' },
  { id: 'manana', nombre: 'Mañana', ayuda: 'Visitas e instalaciones de mañana: para recordarles' },
  { id: 'agendar', nombre: 'Por agendar', ayuda: 'Confirmadas sin fecha de instalación' },
  { id: 'proximas', nombre: 'Próximas instalaciones', ayuda: 'Instalaciones de hoy en adelante' },
  { id: 'porconfirmar', nombre: 'Por confirmar', ayuda: 'Todas las cotizaciones esperando respuesta' },
  { id: 'esperando', nombre: 'Esperando', ayuda: 'Clientes que pospusieron hasta una fecha' },
  { id: 'sinwsp', nombre: 'Sin WhatsApp', ayuda: 'Números que WhatsApp dice que no existen: para revisarlos por fuera' },
  { id: 'todos', nombre: 'Todos', ayuda: 'Todas las cotizaciones' },
]

// Las cotizaciones de un numero de WhatsApp, la que conviene mostrar primero: la mas nueva que no
// este rechazada (si todas lo estan, la mas nueva).
export function cotizacionesDelNumero(quotes, telefono) {
  const t = telefonoWhatsapp(telefono)
  if (t.length < 8) return []
  const lista = quotes.filter(q => q.instalacion?.origen !== 'excel' && telefonoWhatsapp(q.telefono) === t).sort(porNumeroDesc)
  const i = lista.findIndex(q => q.status !== 'rechazada')
  return i > 0 ? [lista[i], ...lista.filter((_, j) => j !== i)] : lista
}

const porNumeroDesc = (a, b) => (b.creadoMs ?? 0) - (a.creadoMs ?? 0) || Number(b.cotNum) - Number(a.cotNum)

// { toca: [...], agendar: [...], ... } con las cotizaciones de cada filtro, en el orden en que conviene verlas.
export function clasificar(quotes, hoy) {
  const qs = quotes.filter(q => q.instalacion?.origen !== 'excel')
  const est = new Map(qs.map(q => [q.cotNum, estadoSeguimiento(q, hoy)]))
  const porConfirmar = qs.filter(q => q.status === 'por confirmar').sort(porNumeroDesc)
  return {
    toca: porConfirmar.filter(q => est.get(q.cotNum).tocaPreguntar),
    porconfirmar: porConfirmar,
    esperando: porConfirmar.filter(q => est.get(q.cotNum).esperando).sort((a, b) => a.seguimiento.esperarHasta.localeCompare(b.seguimiento.esperarHasta)),
    agendar: qs.filter(q => q.status === 'confirmada' && !q.instalacion?.fecha).sort(porNumeroDesc),
    proximas: qs.filter(q => q.instalacion?.fecha && q.instalacion.fecha >= hoy && q.status !== 'rechazada')
      .sort((a, b) => (a.instalacion.fecha + a.instalacion.inicio).localeCompare(b.instalacion.fecha + b.instalacion.inicio)),
    sinwsp: qs.filter(q => sinWhatsapp(q) && q.status !== 'rechazada').sort(porNumeroDesc),
    todos: [...qs].sort(porNumeroDesc),
  }
}

const fechaCorta = f => new Intl.DateTimeFormat('es-CL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(f + 'T12:00:00Z'))
export { fechaCorta }
const hace = d => (d === 0 ? 'hoy' : d === 1 ? 'ayer' : `hace ${d} días`)

// Una linea corta con en que va el cliente, y su color: 'ambar' (hacer algo), 'verde', 'gris', 'rojo'.
export function enQueVa(q, hoy) {
  if (q.status === 'rechazada') return { texto: 'Rechazada' + (q.motivoRechazo ? ` · ${q.motivoRechazo}` : ''), tono: 'rojo' }
  if (q.instalacion?.fecha) {
    if (q.instalacion.fecha < hoy) return { texto: `Instalada ${fechaCorta(q.instalacion.fecha)}`, tono: 'gris' }
    return { texto: `Instala ${fechaCorta(q.instalacion.fecha)} · ${q.instalacion.inicio}`, tono: 'verde' }
  }
  if (q.status === 'confirmada') return { texto: 'Confirmada · falta agendar', tono: 'ambar' }
  if (q.yaCompro) return { texto: `Ya compró con la N° ${q.yaCompro.cotNum}`, tono: 'verde' }
  if (sinWhatsapp(q)) return { texto: 'Número sin WhatsApp: revisar', tono: 'rojo' }
  const e = estadoSeguimiento(q, hoy)
  if (e.esperando) return { texto: `Esperando hasta ${fechaCorta(e.esperando)}`, tono: 'gris' }
  if (e.tocaPreguntar) return { texto: e.veces ? `Toca preguntar · preguntado ${e.veces}×` : 'Toca preguntar · sin preguntar', tono: 'ambar' }
  if (e.respondio) return { texto: `Respondió ${hace(Math.round((Date.parse(hoy) - Date.parse(e.respondio)) / 864e5))}`, tono: 'verde' }
  if (e.veces) return { texto: `Preguntado ${hace(e.diasDesdeUltima)}`, tono: 'gris' }
  return { texto: 'Enviada, sin preguntar', tono: 'gris' }
}

// Los mensajes que sirven para este cliente segun en que va. seguimiento: true anota la pregunta al usarlo.
export function mensajesPara(q, hoy, { eventoManana = null, ahora = new Date() } = {}) {
  const lista = []
  const inst = q.instalacion?.fecha && q.instalacion.fecha >= hoy ? q.instalacion : null
  if (eventoManana) lista.push({ id: 'recordatorio', grupo: 'Mañana', titulo: 'Recordatorio de mañana', texto: mensajeRecordatorio(eventoManana) })
  if (q.status === 'por confirmar') {
    for (const m of mensajesSeguimiento(q)) lista.push({ ...m, grupo: 'Seguimiento', seguimiento: true })
  }
  if (inst) {
    lista.push({ id: 'agendada', grupo: 'Instalación', titulo: 'Hora agendada', texto: mensajeInstalacionDe(q, inst) })
    lista.push({ id: 'confirmar', grupo: 'Instalación', titulo: 'Confirmar instalación', texto: mensajeConfirmarInstalacion(q, inst, ahora) })
    lista.push({ id: 'vispera', grupo: 'Instalación', titulo: 'Víspera (maestro, patente)', texto: mensajeInstalacionManana(q, inst) })
  }
  if (q.status !== 'rechazada' && !inst) {
    if (q.linkAgenda) lista.push({ id: 'link-agendar', grupo: 'Cotización', titulo: 'Mensaje + link para agendar', texto: mensajeEnvioCotizacion(q.linkAgenda) })
    lista.push({ id: 'cotizacion', grupo: 'Cotización', titulo: 'Cotización con links', texto: mensajeCotizacion(q) })
  }
  return lista
}

// Mensajes rapidos propios: se guardan en este PC. Variables: {nombre} (primer nombre),
// {cotizacion} (N°), {total}, {agendar} (link para agendar), {pagar} (link de pago).
const CLAVE_RAPIDOS = 'dm_whatsapp_mensajes'
export const RAPIDOS_INICIALES = [
  { id: 'saludo', titulo: 'Saludo', texto: 'Hola {nombre} 👋 Te escribo de Repisas Don Maxi.' },
  { id: 'medidas', titulo: 'Pedir fotos y medidas', texto: 'Hola {nombre}, ¿me podrías mandar una foto de la bodega y sus medidas aproximadas (ancho, fondo y alto)? Así te preparo la cotización 📏' },
  { id: 'llamar', titulo: '¿Te llamo?', texto: 'Hola {nombre}, ¿te puedo llamar en un rato para ver los detalles?' },
  { id: 'gracias', titulo: 'Gracias', texto: '¡Muchas gracias {nombre}! Cualquier cosa me escribes por acá 🙌' },
]
export function leerRapidos() {
  try { const l = JSON.parse(localStorage.getItem(CLAVE_RAPIDOS)); if (Array.isArray(l)) return l } catch { /* nada guardado */ }
  return RAPIDOS_INICIALES
}
export const guardarRapidos = lista => localStorage.setItem(CLAVE_RAPIDOS, JSON.stringify(lista))

const pesos = n => '$' + Math.round(Number(n) || 0).toLocaleString('es-CL')
export function rellenar(texto, q = null) {
  const nombre = String(q?.nombre || q?.cliente || '').trim().split(/\s+/)[0] || ''
  const valores = { cotizacion: q?.cotNum || '', total: q?.total ? pesos(q.total) : '', agendar: q?.linkAgenda || '', pagar: q?.linkPago || '' }
  return String(texto)
    .replace(/ ?\{nombre\}/g, m => (nombre ? (m.startsWith(' ') ? ' ' : '') + nombre : ''))
    .replace(/\{(cotizacion|total|agendar|pagar)\}/g, (_, k) => valores[k])
    .replace(/^[,\s]+/, '')
}
