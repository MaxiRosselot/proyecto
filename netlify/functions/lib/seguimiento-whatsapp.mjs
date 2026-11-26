// Seguimiento por WhatsApp que hace Maxi a mano con sus clientes: cada vez que le pregunta al cliente
// si pudo ver la cotizacion queda anotado el dia; si el cliente responde (sin decidir todavia), se
// marca. Asi se ve a quien le toca preguntar de nuevo. Si el cliente pospone ("en enero lo vemos"),
// se espera hasta esa fecha. La bitacora guarda notas cortas de lo que se hablo.
// Se guarda en la columna V de la cotizacion:
//   { preguntas: ['AAAA-MM-DD', ...], respondio?: 'AAAA-MM-DD', esperarHasta?: 'AAAA-MM-DD',
//     bitacora?: [{ fecha: 'AAAA-MM-DD', texto }] }
import { diasDesde } from './seguimiento.mjs'

// Dias sin respuesta despues de preguntar para volver a preguntar, y dias desde que se envio la
// cotizacion para la primera pregunta.
export const DIAS_PARA_VOLVER_A_PREGUNTAR = 3
export const DIAS_PARA_PRIMERA_PREGUNTA = 2

const dias = (desde, hoy) => Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 864e5)
// Sin los campos vacios, para no guardar basura en la planilla.
const limpio = s => Object.fromEntries(Object.entries(s).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length && v !== s.preguntas)))

export function registrarPregunta(seguimiento, dia) {
  const { respondio, esperarHasta, ...resto } = seguimiento || {}
  const preguntas = [...new Set([...(seguimiento?.preguntas || []), dia])].sort()
  // Una respuesta anterior a esta pregunta deja de contar; una posterior (pregunta anotada con
  // fecha atrasada) se mantiene. Preguntar cuando ya se cumplio la espera la termina.
  return limpio({ ...resto, preguntas, respondio: respondio && respondio >= dia ? respondio : null, esperarHasta: esperarHasta && esperarHasta > dia ? esperarHasta : null })
}

export function registrarRespuesta(seguimiento, hoy) {
  return limpio({ ...(seguimiento || {}), preguntas: seguimiento?.preguntas || [], respondio: hoy })
}

// Corregir lo anotado (p. ej. preguntas de antes de que existiera el seguimiento, con su fecha).
export function quitarPregunta(seguimiento, fecha) {
  return limpio({ ...(seguimiento || {}), preguntas: (seguimiento?.preguntas || []).filter(p => p !== fecha) })
}
export function quitarRespuesta(seguimiento) {
  return limpio({ ...(seguimiento || {}), preguntas: seguimiento?.preguntas || [], respondio: null })
}

// El cliente pospuso: no aparece en "toca preguntar" hasta esa fecha. Sin fecha, se quita la espera.
export function esperarHasta(seguimiento, fecha) {
  return limpio({ ...(seguimiento || {}), preguntas: seguimiento?.preguntas || [], esperarHasta: fecha || null })
}

// Bitacora: notas cortas por cliente ("pidió cambiar a 5 niveles", "lo ve con su señora").
export function anotarBitacora(seguimiento, fecha, texto) {
  const t = String(texto || '').trim().slice(0, 500)
  if (!t) return seguimiento
  return limpio({ ...(seguimiento || {}), preguntas: seguimiento?.preguntas || [], bitacora: [...(seguimiento?.bitacora || []), { fecha, texto: t }] })
}
export function quitarDeBitacora(seguimiento, indice) {
  return limpio({ ...(seguimiento || {}), preguntas: seguimiento?.preguntas || [], bitacora: (seguimiento?.bitacora || []).filter((_, i) => i !== indice) })
}

// Hay algo que guardar en la planilla.
export const haySeguimiento = s => Boolean(s && (s.preguntas?.length || s.respondio || s.esperarHasta || s.bitacora?.length))

// Clientes que ya compraron con otra cotizacion: si el mismo cliente (mismo celular, o mismo nombre
// y apellido aunque el celular sea otro) tiene otra cotizacion confirmada, agendada, con pagos o en la
// planilla de Instalaciones (no rechazada), de la fecha de esta cotizacion en adelante, no hay que preguntarle por
// esta. Una compra anterior (un cliente antiguo que pide algo nuevo) no cuenta.
// Devuelve las cotizaciones con yaCompro: { cotNum, fecha } en las por confirmar que corresponda.
const ultimos8 = t => { const d = String(t || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : '' }
const nombreCompleto = n => { const p = String(n || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().split(/\s+/).filter(Boolean); return p.length >= 2 ? p.slice(0, 2).join(' ') : '' }
const diaDe = ms => (Number.isFinite(ms) ? new Date(ms - 3 * 3600e3).toISOString().slice(0, 10) : '')
const esVenta = q => q.status !== 'rechazada' && (q.status === 'confirmada' || Boolean(q.instalacion?.fecha) || q.instalacion?.origen === 'excel' || (q.pagos || []).length > 0)
const fechaVenta = q => [diaDe(q.creadoMs), q.instalacion?.fecha || '', ...(q.pagos || []).map(p => p.fecha || '')].filter(Boolean).sort().at(-1) || ''
export function marcarYaCompro(quotes) {
  const ventas = quotes.filter(esVenta).map(v => ({ cotNum: v.cotNum, tel: ultimos8(v.telefono), nombre: nombreCompleto(v.nombre), fecha: fechaVenta(v) }))
  return quotes.map(q => {
    if (q.status !== 'por confirmar' || q.instalacion?.origen === 'excel') return q
    const tel = ultimos8(q.telefono), nombre = nombreCompleto(q.nombre), desde = diaDe(q.creadoMs)
    const v = ventas.find(v => v.cotNum !== q.cotNum && (!desde || !v.fecha || v.fecha >= desde)
      && ((tel && v.tel === tel) || (nombre && v.nombre === nombre)))
    return v ? { ...q, yaCompro: { cotNum: v.cotNum, fecha: v.fecha } } : q
  })
}

// { veces, ultima, diasDesdeUltima, respondio, tocaPreguntar, esperando, yaCompro }
// esperando: la fecha hasta la que se espera, mientras no llegue. Llegada la fecha, toca preguntar
// (aunque haya respondido antes: posponer suele venir despues de una respuesta).
export function estadoSeguimiento(q, hoy) {
  const preguntas = q.seguimiento?.preguntas || []
  const ultima = preguntas.at(-1) || null
  const respondio = q.seguimiento?.respondio && (!ultima || q.seguimiento.respondio >= ultima) ? q.seguimiento.respondio : null
  const diasDesdeUltima = ultima ? dias(ultima, hoy) : null
  const porConfirmar = q.status === 'por confirmar'
  const hasta = q.seguimiento?.esperarHasta || null
  const esperando = hasta && hoy < hasta ? hasta : null
  const cumplioEspera = hasta && !esperando && (!ultima || ultima < hasta)
  const tocaPreguntar = porConfirmar && !q.yaCompro && !esperando && (cumplioEspera || (!respondio && (ultima
    ? diasDesdeUltima >= DIAS_PARA_VOLVER_A_PREGUNTAR
    : (diasDesde(q.creadoMs, hoy) ?? 0) >= DIAS_PARA_PRIMERA_PREGUNTA)))
  return { veces: preguntas.length, ultima, diasDesdeUltima, respondio, tocaPreguntar, esperando, yaCompro: q.yaCompro || null }
}

export function mensajePregunta(q) {
  const nombre = String(q.nombre || '').trim().split(/\s+/)[0]
  return `Hola${nombre ? ' ' + nombre : ''}, ¿alcanzaste a ver la cotización N° ${q.cotNum} que te enviamos? Si tienes cualquier duda o quieres ajustar algo, te ayudo 🙂`
}

const primer = nombre => String(nombre || '').trim().split(/\s+/)[0]
const hola = nombre => `Hola${primer(nombre) ? ' ' + primer(nombre) : ''}`

// Mensajes a elegir para hacer seguimiento, segun como va la conversacion.
export function mensajesSeguimiento(q) {
  return [
    { id: 'sin-respuesta', titulo: 'Sin respuesta', texto: mensajePregunta(q) },
    { id: 'sigue-disponible', titulo: 'Sigue disponible', texto: `${hola(q.nombre)} 👋 Te escribo para contarte que tu cotización N° ${q.cotNum} sigue disponible. Si quieres ajustar medidas, sumar o quitar algo, me cuentas y te la actualizo al tiro.` },
    { id: 'ajustes', titulo: 'Pidió ajustes', texto: `${hola(q.nombre)}, te envío la cotización N° ${q.cotNum} con los ajustes que conversamos. Revísala y me cuentas si quedó como la necesitas 🙂` },
    { id: 'pospuso', titulo: 'Retomar (pospuso)', texto: `${hola(q.nombre)} 👋 ¿Cómo estás? Quedamos de retomar la cotización N° ${q.cotNum} de tus repisas. ¿Sigues interesado/a? Si quieres te mando los horarios disponibles para la instalación.` },
  ]
}
