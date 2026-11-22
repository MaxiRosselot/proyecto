// Seguimiento por WhatsApp que hace Maxi a mano con las cotizaciones por confirmar: cada vez que le
// pregunta al cliente si pudo ver la cotizacion queda anotado el dia; si el cliente responde (sin
// decidir todavia), se marca. Asi se ve a quien le toca preguntar de nuevo. Se guarda en la columna V
// de la cotizacion: { preguntas: ['AAAA-MM-DD', ...], respondio?: 'AAAA-MM-DD' }.
import { diasDesde } from './seguimiento.mjs'

// Dias sin respuesta despues de preguntar para volver a preguntar, y dias desde que se envio la
// cotizacion para la primera pregunta.
export const DIAS_PARA_VOLVER_A_PREGUNTAR = 3
export const DIAS_PARA_PRIMERA_PREGUNTA = 2

const dias = (desde, hoy) => Math.round((Date.parse(hoy + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 864e5)

export function registrarPregunta(seguimiento, hoy) {
  const preguntas = [...new Set([...(seguimiento?.preguntas || []), hoy])].sort()
  return { preguntas }
}

export function registrarRespuesta(seguimiento, hoy) {
  return { preguntas: seguimiento?.preguntas || [], respondio: hoy }
}

// { veces, ultima, diasDesdeUltima, respondio, tocaPreguntar }
export function estadoSeguimiento(q, hoy) {
  const preguntas = q.seguimiento?.preguntas || []
  const ultima = preguntas.at(-1) || null
  const respondio = q.seguimiento?.respondio && (!ultima || q.seguimiento.respondio >= ultima) ? q.seguimiento.respondio : null
  const diasDesdeUltima = ultima ? dias(ultima, hoy) : null
  const porConfirmar = q.status === 'por confirmar'
  const tocaPreguntar = porConfirmar && !respondio && (ultima
    ? diasDesdeUltima >= DIAS_PARA_VOLVER_A_PREGUNTAR
    : (diasDesde(q.creadoMs, hoy) ?? 0) >= DIAS_PARA_PRIMERA_PREGUNTA)
  return { veces: preguntas.length, ultima, diasDesdeUltima, respondio, tocaPreguntar }
}

export function mensajePregunta(q) {
  const nombre = String(q.nombre || '').trim().split(/\s+/)[0]
  return `Hola${nombre ? ' ' + nombre : ''}, ¿alcanzaste a ver la cotización N° ${q.cotNum} que te enviamos? Si tienes cualquier duda o quieres ajustar algo, te ayudo 🙂`
}
