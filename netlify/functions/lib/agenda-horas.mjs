// Agenda de instalaciones para el link del cliente (/agendar): cuanto dura su trabajo y que horas
// le quedan libres. Sin imports de Node: la pagina del cliente recalcula las horas al agregar un
// servicio y el servidor vuelve a validar con estas mismas funciones.
//
// Reglas (de las 587 instalaciones con hora del Excel de ventas 2025-2026):
//   · duracion ≈ 1,4 h + 0,4 h por cada $100.000 netos de repisas + 0,5 h si lleva retiro y orden
//     (+ 0,13 h retiro de basura); redondeada hacia arriba a la media hora. El traslado ya va incluido.
//   · jornada segun Admin → Horarios → Instalaciones (por defecto lunes a viernes de 10:00 a 16:00);
//     un dia puede tener varios rangos (p. ej. solo la tarde) o estar cerrado.
//   · para no perder tiempo, solo se ofrecen horas pegadas a las 10:00, a las 16:00 o a otra
//     instalacion: el trabajo empieza al inicio de un hueco o termina justo al final.
//   · se puede agendar el mismo dia hasta las 8:00; hasta las semanas que diga el horario (4).
//   · reagendar: hasta 48 h antes del inicio; despues hay que hablar directamente.
import { HORARIO_INSTALACIONES, aHHMM, aMinutos, ahoraEnZona, horaLocalAUTC, rangosDelDia, sumarDias } from './horarios.mjs'
import { totalesCotizacion } from './totales.mjs'

// Hasta las 8:00 se puede agendar para el mismo dia.
export const MISMO_DIA_HASTA_MIN = 8 * 60
// La jornada mas larga: un trabajo mas largo se agenda como jornada completa.
export const MAX_DURACION_MIN = 6 * 60
export const MIN_DURACION_MIN = 60
export const ANTICIPACION_REAGENDAR_H = 48
// Los servicios que el cliente puede agregar desde su link (clave y si va por cantidad).
export const SERVICIOS_CLIENTE = [['retiro_orden', false], ['retiro_basura', false], ['cajas', true], ['bici', true]]

const media = min => Math.ceil(min / 30 - 1e-9) * 30

// Minutos que dura la instalacion de una cotizacion (con sus servicios).
export function duracionInstalacionMin(repisas = [], adicionales = {}) {
  const neto = totalesCotizacion(repisas, {}).repisas
  const horas = 1.4 + 0.4 * (neto / 100000)
    + ((Number(adicionales.qty_retiro_orden) || 0) > 0 ? 0.5 : 0)
    + ((Number(adicionales.qty_retiro_basura) || 0) > 0 ? 0.13 : 0)
  return Math.min(MAX_DURACION_MIN, Math.max(MIN_DURACION_MIN, media(horas * 60)))
}

export const duracionTexto = min => [Math.floor(min / 60) ? `${Math.floor(min / 60)} h` : '', min % 60 ? `${min % 60} min` : ''].filter(Boolean).join(' ')

const JORNADA_POR_DEFECTO = [{ desde: '10:00', hasta: '16:00' }]

// Horas de inicio posibles en un dia, dados los tramos ocupados [{ desde, hasta }] en minutos y
// los rangos de trabajo de ese dia ([{ desde: 'HH:MM', hasta: 'HH:MM' }]).
export function horasDelDia(ocupados, duracionMin, rangos = JORNADA_POR_DEFECTO) {
  const huecos = []
  for (const rango of rangos) {
    const ini = aMinutos(rango.desde), fin = aMinutos(rango.hasta)
    const tramos = ocupados
      .map(o => ({ desde: Math.max(ini, o.desde), hasta: Math.min(fin, o.hasta) }))
      .filter(o => o.hasta > o.desde)
      .sort((a, b) => a.desde - b.desde)
    let cursor = ini
    for (const t of tramos) {
      if (t.desde > cursor) huecos.push([cursor, t.desde])
      cursor = Math.max(cursor, t.hasta)
    }
    if (cursor < fin) huecos.push([cursor, fin])
  }
  const horas = new Set()
  for (const [a, b] of huecos) {
    if (b - a < duracionMin) continue
    horas.add(a)            // al inicio del hueco (pegado a las 10:00 o a la anterior)
    horas.add(b - duracionMin) // terminando justo al final (a las 16:00 o antes de la siguiente)
  }
  return [...horas].sort((x, y) => x - y).map(m => ({ inicio: aHHMM(m), fin: aHHMM(m + duracionMin) }))
}

// Dias y horas libres. ocupadosPorFecha: { 'AAAA-MM-DD': [{ desde, hasta }] }; horario: el de
// Admin → Horarios → Instalaciones (semanal, fechas especiales y semanas).
export function disponibilidadAgenda(ocupadosPorFecha, duracionMin, ahora = new Date(), horario = HORARIO_INSTALACIONES) {
  const { fecha: hoy, minutos } = ahoraEnZona(ahora)
  const { hasta } = rangoAgendaCliente(ahora, horario)
  const dias = []
  for (let fecha = minutos < MISMO_DIA_HASTA_MIN ? hoy : sumarDias(hoy, 1); fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    const rangos = rangosDelDia(horario, fecha)
    if (!rangos.length) continue
    const horas = horasDelDia(ocupadosPorFecha[fecha] || [], duracionMin, rangos)
    if (horas.length) dias.push({ fecha, horas })
  }
  return dias
}

export const rangoAgendaCliente = (ahora = new Date(), horario = HORARIO_INSTALACIONES) => {
  const hoy = ahoraEnZona(ahora).fecha
  return { desde: hoy, hasta: sumarDias(hoy, (horario.semanas || 4) * 7) }
}

// Lo que ocupa la agenda: instalaciones del calendario (menos la propia, al reagendar) y las
// ventas con fecha que no tienen evento.
export function ocupadosAgenda({ eventos = [], cotizaciones = [], excepto = {} }) {
  const porFecha = {}
  const agregar = (fecha, desde, hasta) => { (porFecha[fecha] ||= []).push({ desde, hasta }) }
  for (const e of eventos) {
    if (e.tipo !== 'instalacion' || (excepto.eventId && e.id === excepto.eventId) || (excepto.cotNum && String(e.cotNum) === String(excepto.cotNum))) continue
    agregar(e.fecha, e.todoElDia ? 0 : e.minutoInicio, e.todoElDia ? 1440 : e.minutoFin)
  }
  for (const q of cotizaciones) {
    const i = q.instalacion
    if (!i?.fecha || i.eventId || q.status === 'rechazada' || String(q.cotNum) === String(excepto.cotNum)) continue
    if (i.inicio && i.fin) agregar(i.fecha, aMinutos(i.inicio), aMinutos(i.fin))
  }
  return porFecha
}

// Puede reagendar si faltan al menos 48 h para el inicio.
export function puedeReagendar(instalacion, ahora = new Date()) {
  if (!instalacion?.fecha || !instalacion.inicio) return false
  return horaLocalAUTC(instalacion.fecha, instalacion.inicio).getTime() - ahora.getTime() >= ANTICIPACION_REAGENDAR_H * 3600000
}
