// Visitas: cupo por rango, reagendar y cancelar (Admin → Visitas), y fijar la hora que sale de la
// ruta del dia. Las visitas son eventos del calendario creados por el agendador
// (created_by=agendador-netlify). Mientras el cliente solo tiene rango, el evento dura todo el
// rango (ej. 11:00–14:00); al fijar la ruta pasa a durar la visita (15 min) a la hora de llegada.
// Su slot_key (fecha + rango) es lo que ocupa cupo; al cancelar se vacia.
import { ErrorCotizacion } from './cotizaciones.mjs'
import { CUPO_POR_DEFECTO, DURACION_MIN, ZONA, ahoraEnZona, aHHMM, diasConRangos, estadoRango, horaLocalAUTC, rangoDeHora, sumarDias } from './horarios.mjs'

const DEL_AGENDADOR = 'created_by=agendador-netlify'

// Una visita del calendario como cuenta para el cupo: { id, fecha, rango } (rango = inicio del rango).
// Las antiguas (hora exacta, sin rango) cuentan en el rango que contiene su hora.
export function visitaParaCupo(ev) {
  const shared = ev.extendedProperties?.shared || {}
  if (ev.status === 'cancelled' || !shared.slot_key || !ev.start?.dateTime) return null
  const { fecha, minutos } = ahoraEnZona(new Date(ev.start.dateTime))
  const rango = shared.rango?.split('-')[0] || rangoDeHora(aHHMM(minutos))?.desde
  return rango ? { id: ev.id, fecha, rango } : null
}

export async function visitasActivas(calendar, calendarId, desde, hasta) {
  const res = await calendar.events.list({
    calendarId, singleEvents: true, maxResults: 2500, sharedExtendedProperty: DEL_AGENDADOR,
    timeMin: horaLocalAUTC(desde, '00:00').toISOString(), timeMax: horaLocalAUTC(sumarDias(hasta, 1), '00:00').toISOString(),
  })
  return (res.data.items || []).map(visitaParaCupo).filter(Boolean)
}

// Los dias y rangos con cupo para mover una visita (sin contarla a ella misma).
export async function horasParaReagendar(calendar, calendarId, horario, ahora = new Date(), { excepto = '' } = {}) {
  const hoy = ahoraEnZona(ahora).fecha
  const visitas = (await visitasActivas(calendar, calendarId, hoy, sumarDias(hoy, horario.semanas * 7))).filter(v => v.id !== excepto)
  return diasConRangos(horario, visitas, ahora)
}

// Mueve la visita a otro dia y rango (el cliente recibe la actualizacion del calendario).
// hora: el inicio del rango ('11:00').
export async function reagendarVisita(calendar, calendarId, horario, { visitId, fecha, hora }, ahora = new Date()) {
  if (!visitId) throw new ErrorCotizacion(400, 'Falta la visita')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) throw new ErrorCotizacion(400, 'Elige el día')
  const visitas = (await visitasActivas(calendar, calendarId, fecha, fecha)).filter(v => v.id !== visitId)
  const estado = estadoRango(horario, visitas, fecha, hora, ahora)
  if (estado === 'fuera') throw new ErrorCotizacion(400, 'Ese rango no está disponible. Elige otro.')
  if (estado === 'lleno') throw new ErrorCotizacion(409, `Ese rango ya tiene ${horario.cupo ?? CUPO_POR_DEFECTO} visitas. Elige otro.`)
  const rango = rangoDeHora(hora)
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  const inicio = horaLocalAUTC(fecha, rango.desde), fin = horaLocalAUTC(fecha, rango.hasta)
  const slotKey = `${fecha}R${rango.desde}`
  const { hora_ruta: _, ...shared } = ev.extendedProperties?.shared || {}
  await calendar.events.patch({
    calendarId, eventId: visitId, sendUpdates: 'all',
    requestBody: {
      start: { dateTime: inicio.toISOString(), timeZone: ZONA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA },
      description: (ev.description || '').replace(/Slot: .*/, `Slot: ${fecha} ${rango.desde}-${rango.hasta} (hora exacta según la ruta del día)`),
      extendedProperties: { shared: { ...shared, slot_key: slotKey, rango: `${rango.desde}-${rango.hasta}`, hora_ruta: '' } },
    },
  })
  return { start: inicio.toISOString(), end: fin.toISOString(), slotKey }
}

// La hora que sale de la ruta: el evento pasa a durar la visita, a esa hora. Sin avisar por el
// calendario: Maxi le escribe al cliente por WhatsApp (boton del bot).
export async function fijarHoraVisita(calendar, calendarId, { visitId, fecha, hora }) {
  const inicio = horaLocalAUTC(fecha, hora), fin = new Date(inicio.getTime() + DURACION_MIN * 60000)
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  const shared = ev.extendedProperties?.shared || {}
  // Si no tenia rango guardado (visita antigua), se guarda el que tenia antes de moverla.
  const rango = shared.rango || (() => { const r = rangoDeHora(aHHMM(ahoraEnZona(new Date(ev.start.dateTime)).minutos)); return r ? `${r.desde}-${r.hasta}` : '' })()
  await calendar.events.patch({
    calendarId, eventId: visitId, sendUpdates: 'none',
    requestBody: {
      start: { dateTime: inicio.toISOString(), timeZone: ZONA },
      end: { dateTime: fin.toISOString(), timeZone: ZONA },
      extendedProperties: { shared: { ...shared, rango, hora_ruta: hora } },
    },
  })
}

// Coordenadas de una visita (para la ruta), guardadas en el evento la primera vez que se buscan.
export async function guardarCoordenadas(calendar, calendarId, visitId, { lat, lng }) {
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  await calendar.events.patch({ calendarId, eventId: visitId, sendUpdates: 'none', requestBody: { extendedProperties: { shared: { ...ev.extendedProperties?.shared, lat: String(lat), lng: String(lng) } } } })
}

// Al cancelar, el cupo queda libre para otro cliente (el evento se mantiene).
export async function liberarHoraVisita(calendar, calendarId, visitId) {
  const { data: ev } = await calendar.events.get({ calendarId, eventId: visitId })
  const shared = ev.extendedProperties?.shared || {}
  if (!shared.slot_key) return { liberada: false }
  await calendar.events.patch({ calendarId, eventId: visitId, sendUpdates: 'none', requestBody: { extendedProperties: { shared: { ...shared, slot_key: '', slot_cancelado: shared.slot_key } } } })
  return { liberada: true }
}

// Agenda una visita desde /visita: dia + rango, con cupo. El evento dura todo el rango hasta que
// se arma la ruta del dia. datos: { nombre, apellido, email, celular, direccion (calle y numero),
// depto?, comuna?, lat?, lng?, fechaISO, rango ('11:00'), note? }.
export async function crearVisita(calendar, calendarId, horario, datos, ahora = new Date()) {
  const t = (v, max) => String(v ?? '').trim().slice(0, max)
  const { fechaISO, rango: desde } = datos
  if (!t(datos.email, 120) || !fechaISO || !desde) throw new ErrorCotizacion(400, 'Faltan datos para agendar')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaISO)) throw new ErrorCotizacion(400, 'Fecha inválida')
  const estado = estadoRango(horario, await visitasActivas(calendar, calendarId, fechaISO, fechaISO), fechaISO, desde, ahora)
  if (estado === 'fuera') throw new ErrorCotizacion(400, 'Ese horario no está disponible para agendar. Elige otro.')
  if (estado === 'lleno') throw new ErrorCotizacion(409, 'Ese horario se acaba de llenar. Elige otro.')
  const rango = rangoDeHora(desde)
  const nombre = `${t(datos.nombre, 60)} ${t(datos.apellido, 60)}`.trim()
  const comuna = t(datos.comuna, 60), depto = t(datos.depto, 60)
  const direccion = [t(datos.direccion, 160), comuna].filter(Boolean).join(', ')
  const lat = Number(datos.lat), lng = Number(datos.lng)
  const conCoordenadas = datos.lat != null && datos.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
  const { data } = await calendar.events.insert({
    calendarId, sendUpdates: 'all',
    requestBody: {
      summary: `Visita — ${nombre} (Repisas Don Maxi)`,
      description: [`Cliente: ${nombre}`, `Email: ${t(datos.email, 120)}`, `Celular: ${t(datos.celular, 40)}`, `Dirección: ${direccion}`,
        ...(depto ? [`Depto/casa: ${depto}`] : []), '', 'Notas:', t(datos.note, 1000) || '(sin notas)', '',
        `Slot: ${fechaISO} ${rango.desde}-${rango.hasta} (hora exacta según la ruta del día)`].join('\n'),
      location: direccion,
      start: { dateTime: horaLocalAUTC(fechaISO, rango.desde).toISOString(), timeZone: ZONA },
      end: { dateTime: horaLocalAUTC(fechaISO, rango.hasta).toISOString(), timeZone: ZONA },
      attendees: [{ email: t(datos.email, 120) }],
      reminders: { useDefault: true },
      extendedProperties: {
        shared: {
          slot_key: `${fechaISO}R${rango.desde}`, rango: `${rango.desde}-${rango.hasta}`, created_by: 'agendador-netlify',
          ...(comuna ? { comuna } : {}), ...(conCoordenadas ? { lat: String(lat), lng: String(lng) } : {}),
        },
      },
    },
  })
  return { id: data.id, link: data.htmlLink || '', nombre, direccion: [direccion, depto].filter(Boolean).join(' · '), rango }
}
