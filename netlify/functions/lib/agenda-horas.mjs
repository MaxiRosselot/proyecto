// Agenda de instalaciones para el link del cliente (/agendar): cuanto dura su trabajo y que horas
// le quedan libres. Sin imports de Node: la pagina del cliente recalcula las horas al agregar un
// servicio y el servidor vuelve a validar con estas mismas funciones.
//
// Reglas (las que dio Maxi, 2026-10-23):
//   · duracion segun la bodega (largo × ancho, del modelo 3D) y en cuantos muros van las repisas:
//       - una sola muralla: 30 min por modulo (cada tramo de hasta 243 cm);
//       - en L: menos de 2 m² 1 h, de 6 m² 2 h, de 10 m² 2 h 30, de 15 m² 3 h, y desde 15 m² 4 h;
//       - en U (3 muros): lo mismo, pero 1 h → 2 h, 2 h 30 → 3 h y 3 h → 4 h;
//       - repisas de 2,5 m de alto +30 min; de 3 m +1 h;
//       - servicios: retiro y orden 30 min (bodega de menos de 4 m²), 1 h (menos de 7,5 m²) o 1 h 30
//         (mas grande); retiro de basura 30 min; soporte de bicicleta 15 min cada uno; cajas nada.
//     Minimo 1 h, maximo la jornada, en tramos de 30 min. Sin modelo 3D, como una muralla con los
//     modulos de la cotizacion. El traslado no se cuenta.
//   · jornada segun Admin → Horarios → Instalaciones (por defecto lunes a viernes de 10:00 a 16:00);
//     un dia puede tener varios rangos (p. ej. solo la tarde) o estar cerrado. Una instalacion a la vez.
//   · para no cortar el dia: solo se ofrecen horas que dejan libre 0 o al menos 2 h antes y despues
//     (lo que mas se vende son trabajos de 2 y 3 h). En un dia vacio: 3 h → 10 o 13; 2 h → 10, 12 o 14.
//   · se puede agendar el mismo dia hasta las 8:00; hasta las semanas que diga el horario (4).
//   · reagendar: hasta 48 h antes del inicio; despues hay que hablar directamente.
import { HORARIO_INSTALACIONES, aHHMM, aMinutos, ahoraEnZona, horaLocalAUTC, rangosDelDia, sumarDias } from './horarios.mjs'

// Hasta las 8:00 se puede agendar para el mismo dia.
export const MISMO_DIA_HASTA_MIN = 8 * 60
// La jornada mas larga: un trabajo mas largo se agenda como jornada completa.
export const MAX_DURACION_MIN = 6 * 60
export const MIN_DURACION_MIN = 60
export const ANTICIPACION_REAGENDAR_H = 48
// Los servicios que el cliente puede agregar desde su link (clave y si va por cantidad).
export const SERVICIOS_CLIENTE = [['retiro_orden', false], ['retiro_basura', false], ['cajas', true], ['bici', true]]

const media = min => Math.ceil(min / 30 - 1e-9) * 30
// Lo minimo libre que tiene que quedar al lado de una instalacion (o nada).
export const HUECO_MINIMO_MIN = 120
const MODULO_MAX_CM = 243

// La bodega segun el modelo 3D: m² (largo × ancho), en cuantos muros van las repisas, cuantos
// modulos son y el alto mayor. Sin modelo, los modulos y el alto salen de las filas de la cotizacion.
export function perfilBodega(proyecto3d, repisas = []) {
  const runs = proyecto3d?.shelving?.runs || []
  if (proyecto3d?.room && runs.length) {
    const { backWallCm, leftWallCm, rightWallCm } = proyecto3d.room
    const muros = new Set(runs.map(r => (r.floorPlacement ? `piso-${r.id}` : String(r.wall).replace(/^front-.*/, 'front'))))
    return {
      m2: (backWallCm * Math.max(leftWallCm, rightWallCm)) / 10000,
      muros: muros.size,
      modulos: runs.reduce((n, r) => n + Math.max(1, Math.ceil((Number(r.lengthCm) || 0) / MODULO_MAX_CM - 1e-9)), 0),
      altoCm: Math.max(...runs.map(r => Number(r.heightCm ?? proyecto3d.shelving.heightCm) || 0)),
    }
  }
  const filas = repisas.filter(r => r.kind !== 'rack')
  return {
    m2: null, muros: 1,
    modulos: filas.reduce((n, r) => n + (Number(r.unidades ?? r.u ?? 1) || 0), 0),
    altoCm: Math.max(0, ...filas.map(r => Math.round((Number(r.alto ?? r.a) || 0) * 100))),
  }
}

// Minutos de las repisas en L segun los m² de la bodega; en U suma lo que dijo Maxi.
function minutosEnL(m2) { return m2 < 2 ? 60 : m2 < 6 ? 120 : m2 < 10 ? 150 : m2 < 15 ? 180 : 240 }
const EXTRA_U = { 60: 60, 150: 30, 180: 60 }

// Minutos que dura la instalacion: cotizacion = { repisas, proyecto3d }, con sus servicios.
export function duracionInstalacionMin(cotizacion = {}, adicionales = {}) {
  const b = perfilBodega(cotizacion.proyecto3d, cotizacion.repisas || [])
  let min = b.muros >= 2 && b.m2 != null
    ? minutosEnL(b.m2) + (b.muros >= 3 ? EXTRA_U[minutosEnL(b.m2)] || 0 : 0)
    : 30 * b.modulos
  if (b.altoCm >= 300) min += 60
  else if (b.altoCm >= 250) min += 30
  if ((Number(adicionales.qty_retiro_orden) || 0) > 0) min += b.m2 == null ? 60 : b.m2 < 4 ? 30 : b.m2 < 7.5 ? 60 : 90
  if ((Number(adicionales.qty_retiro_basura) || 0) > 0) min += 30
  min += 15 * (Number(adicionales.qty_bici) || 0)
  return Math.min(MAX_DURACION_MIN, Math.max(MIN_DURACION_MIN, media(min)))
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
  // Cada media hora del hueco, si lo que queda libre antes y despues es 0 o al menos 2 h.
  const sirve = libre => libre === 0 || libre >= HUECO_MINIMO_MIN
  const horas = new Set()
  for (const [a, b] of huecos) {
    for (let inicio = a; inicio + duracionMin <= b; inicio += 30) {
      if (sirve(inicio - a) && sirve(b - inicio - duracionMin)) horas.add(inicio)
    }
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
