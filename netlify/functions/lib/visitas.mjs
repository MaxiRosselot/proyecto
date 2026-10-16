// Reagendar y cancelar visitas desde Admin → Visitas. Las visitas son eventos del calendario
// creados por el agendador (created_by=agendador-netlify); su slot_key es lo que bloquea la hora.
import { ErrorCotizacion } from './cotizaciones.mjs'
import { DURACION_MIN, ZONA, diasDisponibles, horaLocalAUTC, horaPermitida, sumarDias } from './horarios.mjs'

const DEL_AGENDADOR = 'created_by=agendador-netlify'

// Horas tomadas por visitas entre dos fechas (las canceladas ya liberaron la suya).
async function horasTomadas(calendar, calendarId, desde, hasta) {
  const res = await calendar.events.list({
    calendarId, singleEvents: true, maxResults: 2500, sharedExtendedProperty: DEL_AGENDADOR,
    timeMin: horaLocalAUTC(desde, '00:00').toISOString(), timeMax: horaLocalAUTC(sumarDias(hasta, 1), '00:00').toISOString(),
  })
  return new Set((res.data.items || []).filter(ev => ev.status !== 'cancelled').map(ev => ev.extendedProperties?.shared?.slot_key).filter(Boolean))
}

// Los dias y horas libres para mover una visita: el horario de la pestaña Horarios menos lo tomado.
export async function horasParaReagendar(calendar, calendarId, horario, ahora = new Date()) {
  const dias = diasDisponibles(horario, ahora)
  if (!dias.length) return []
  const tomadas = await horasTomadas(calendar, calendarId, dias[0].fecha, dias.at(-1).fecha)
  return dias.map(d => ({ fecha: d.fecha, horas: d.horas.filter(h => !tomadas.has(`${d.fecha}T${h}`)) })).filter(d => d.horas.length)
}

// Mueve el evento de la visita (el cliente recibe la actualizacion del calendario).
export async function reagendarVisita(calendar, calendarId, horario, { visitId, fecha, hora }, ahora = new Date()) {
  if (!visitId) throw new ErrorCotizacion(400, 'Falta la visita')
  if (!horaPermitida(horario, fecha, hora, ahora)) throw new ErrorCotizacion(400, 'Esa hora no está disponible. Elige otra.')
  const slotKey = `${fecha}T${hora}`
  if ((await horasTomadas(calendar, calendarId, fecha, fecha)).has(slotKey)) throw new ErrorCotizacion(409, 'Esa hora ya la tomó otra visita. Elige otra.')
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  const duracion = ev.start?.dateTime && ev.end?.dateTime ? new Date(ev.end.dateTime) - new Date(ev.start.dateTime) : DURACION_MIN * 60000
  const inicio = horaLocalAUTC(fecha, hora), fin = new Date(inicio.getTime() + duracion)
  await calendar.events.patch({
    calendarId, eventId: visitId, sendUpdates: 'all',
    requestBody: {
      start: { dateTime: inicio.toISOString(), timeZone: ZONA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA },
      description: (ev.description || '').replace(/Slot: \S+ \S+/, `Slot: ${fecha} ${hora}`),
      extendedProperties: { shared: { ...ev.extendedProperties?.shared, slot_key: slotKey } },
    },
  })
  return { start: inicio.toISOString(), end: fin.toISOString(), slotKey }
}

// Al cancelar, la hora queda libre para que otro cliente la pueda tomar (el evento se mantiene).
export async function liberarHoraVisita(calendar, calendarId, visitId) {
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  const shared = ev.extendedProperties?.shared || {}
  if (!shared.slot_key) return { liberada: false }
  await calendar.events.patch({ calendarId, eventId: visitId, sendUpdates: 'none', requestBody: { extendedProperties: { shared: { ...shared, slot_key: '', slot_cancelado: shared.slot_key } } } })
  return { liberada: true }
}
