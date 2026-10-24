// Eventos del calendario del negocio para la vista Calendario del admin y los recordatorios.
// Clasifica cada evento (instalacion, visita u otro) y a las instalaciones les suma lo de su
// cotizacion: telefono, direccion, total y pagos.
import { ahoraEnZona, aHHMM, horaLocalAUTC, rangoDeHora, sumarDias } from './horarios.mjs'
import { resumenPagos } from './pagos-resumen.mjs'

export const MAX_DIAS = 62

const dato = (descripcion, etiqueta) => descripcion.match(new RegExp(`${etiqueta}:\\s*(.+)`))?.[1]?.trim() || ''

export function tipoEvento(ev) {
  const origen = ev.extendedProperties?.shared?.created_by || ''
  if (origen === 'instalacion-donmaxi') return 'instalacion'
  if (origen === 'agendador-netlify') return 'visita'
  return 'otro'
}

// Fecha y hora en Chile de un inicio/fin de Calendar ({dateTime} o {date} para todo el dia).
function momento(valor) {
  if (valor?.dateTime) {
    const { fecha, minutos } = ahoraEnZona(new Date(valor.dateTime))
    return { fecha, hora: aHHMM(minutos), minutos }
  }
  return { fecha: valor?.date || '', hora: '', minutos: 0 }
}

export function eventoParaVista(ev, cotizacionesPorNumero = new Map()) {
  const tipo = tipoEvento(ev)
  const descripcion = ev.description || ''
  const inicio = momento(ev.start), fin = momento(ev.end)
  const base = {
    id: ev.id, tipo, titulo: ev.summary || '(sin título)', link: ev.htmlLink || '',
    fecha: inicio.fecha, inicio: inicio.hora, fin: fin.hora,
    minutoInicio: inicio.minutos, minutoFin: fin.fecha === inicio.fecha ? fin.minutos : 24 * 60,
    todoElDia: !ev.start?.dateTime,
    ubicacion: ev.location || '', email: ev.attendees?.[0]?.email || '',
  }
  if (tipo === 'instalacion') {
    const cotNum = ev.extendedProperties?.shared?.cot_num || ''
    const q = cotizacionesPorNumero.get(String(cotNum))
    return {
      ...base,
      cliente: ev.extendedProperties?.shared?.cliente || q?.nombre || base.titulo.replace(/^Instalación\s*[-—]\s*/, '').replace(/\s*\(Repisas Don Maxi\)$/, ''),
      cotNum, telefono: q?.telefono || dato(descripcion, 'Teléfono'),
      ubicacion: base.ubicacion || q?.direccion || dato(descripcion, 'Dirección'),
      email: base.email || q?.email || '',
      total: q ? Number(q.total) || 0 : 0,
      pago: q ? resumenPagos(q.total, q.pagos) : null,
    }
  }
  if (tipo === 'visita') {
    return {
      ...base,
      cliente: base.titulo.match(/Visita\s*[-—]\s*(.+?)\s*\(/)?.[1] || base.titulo,
      telefono: dato(descripcion, 'Celular'),
      ubicacion: base.ubicacion || dato(descripcion, 'Dirección'),
      estado: ev.extendedProperties?.shared?.status || '',
      ...visitaEnRango(ev.extendedProperties?.shared || {}, base),
    }
  }
  return { ...base, cliente: '' }
}

// El rango que eligio el cliente y, si ya se armo la ruta, la hora fija. Las visitas antiguas (hora
// exacta, sin rango) quedan con esa hora fija y el rango que la contiene.
function visitaEnRango(shared, base) {
  const [desde, hasta] = String(shared.rango || '').split('-')
  const rango = desde && hasta ? { desde, hasta } : rangoDeHora(base.inicio)
  const horaFija = shared.hora_ruta || (shared.rango ? '' : base.inicio)
  return {
    rango, horaFija, activa: Boolean(shared.slot_key),
    horario: horaFija || (rango ? `${rango.desde}–${rango.hasta}` : base.inicio),
    ...(shared.lat && shared.lng ? { lat: Number(shared.lat), lng: Number(shared.lng) } : {}),
  }
}

// Limites UTC de un rango de dias de Chile, inclusivo.
export function rangoUTC(desde, hasta) {
  return { timeMin: horaLocalAUTC(desde, '00:00').toISOString(), timeMax: horaLocalAUTC(sumarDias(hasta, 1), '00:00').toISOString() }
}

export async function eventosEntre(calendar, calendarId, desde, hasta, cotizaciones = []) {
  const porNumero = new Map(cotizaciones.map(q => [String(q.cotNum), q]))
  const eventos = []
  let pageToken
  do {
    const res = await calendar.events.list({
      calendarId, ...rangoUTC(desde, hasta), singleEvents: true, orderBy: 'startTime', maxResults: 250, pageToken,
    })
    eventos.push(...(res.data.items || []).filter(ev => ev.status !== 'cancelled'))
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return eventos.map(ev => eventoParaVista(ev, porNumero))
}
