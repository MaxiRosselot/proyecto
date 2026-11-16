// Agenda de instalaciones para el link del cliente (/agendar): cuanto dura su trabajo y que horas
// le quedan libres. Sin imports de Node: la pagina del cliente recalcula las horas al agregar un
// servicio y el servidor vuelve a validar con estas mismas funciones.
//
// Reglas:
//   · duracion (2026-11-16): ajustada con las 613 instalaciones del panel hasta septiembre de 2026,
//     tomando como real la hora agendada, y probada con las 30 ya hechas de oct-nov con modelo 3D
//     (acierta el 50% exacto, error medio 20 min; la regla anterior por m² y muros se quedaba corta
//     en el 27% por mas de 30 min). El monto neto ya resume el tamaño: largo, fondo, alto, niveles
//     y laterales. Minutos = 83 + 25 por cada $100.000 de repisas + 25 por cada $100.000 de racks
//     + 29 con retiro y orden + 4 con retiro de basura + 6 por soporte de bicicleta; a la media hora
//     mas cercana, entre 1 h y la jornada (6 h).
//   · jornada segun Admin → Horarios → Instalaciones (por defecto lunes a viernes de 10:00 a 16:00);
//     un dia puede tener varios rangos (p. ej. solo la tarde) o estar cerrado. Una instalacion a la vez.
//   · todo espacio libre donde quepa el trabajo se ofrece: siempre pegado a su inicio y a su fin
//     (junto a la otra instalacion o al borde de la jornada). Ademas, las horas que dejan libre 0 o
//     al menos 2 h antes y despues (para no cortar el dia). En un dia vacio: 3 h → 10 o 13;
//     2 h → 10, 12 o 14. (2026-11-16: antes solo esas, y se perdian dias con espacio.)
//   · se puede agendar el mismo dia hasta las 8:00; hasta las semanas que diga el horario (4).
//   · reagendar: cuando quiera, incluso si la hora ya paso (solo no, si ya esta instalada).
import { HORARIO_INSTALACIONES, aHHMM, aMinutos, ahoraEnZona, rangosDelDia, sumarDias } from './horarios.mjs'

// Hasta las 8:00 se puede agendar para el mismo dia.
export const MISMO_DIA_HASTA_MIN = 8 * 60
// La jornada mas larga: un trabajo mas largo se agenda como jornada completa.
export const MAX_DURACION_MIN = 6 * 60
export const MIN_DURACION_MIN = 60
// Los servicios que el cliente puede agregar desde su link (clave y si va por cantidad).
export const SERVICIOS_CLIENTE = [['retiro_orden', false], ['retiro_basura', false], ['cajas', true], ['bici', true]]

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

// Coeficientes del ajuste (ver arriba). Para recalibrar: mismas variables, minimos cuadrados.
export const MODELO_DURACION = { base: 83, por100kRepisas: 25, por100kRacks: 25, retiroOrden: 29, retiroBasura: 4, porBici: 6 }

// Neto de las repisas y de los racks de una cotizacion (sus filas: unidades × valor).
export function netosCotizacion(repisas = []) {
  let repisasNeto = 0, racksNeto = 0
  for (const r of repisas || []) {
    const monto = (Number(r.unidades ?? r.u ?? 1) || 0) * (Number(r.valor ?? r.v) || 0)
    if (r.kind === 'rack') racksNeto += monto; else repisasNeto += monto
  }
  return { repisasNeto, racksNeto }
}

// Minutos que dura la instalacion: cotizacion = { repisas }, con sus servicios.
export function duracionInstalacionMin(cotizacion = {}, adicionales = {}) {
  const m = MODELO_DURACION
  const { repisasNeto, racksNeto } = netosCotizacion(cotizacion.repisas)
  const min = m.base + m.por100kRepisas * repisasNeto / 1e5 + m.por100kRacks * racksNeto / 1e5
    + ((Number(adicionales.qty_retiro_orden) || 0) > 0 ? m.retiroOrden : 0)
    + ((Number(adicionales.qty_retiro_basura) || 0) > 0 ? m.retiroBasura : 0)
    + m.porBici * (Number(adicionales.qty_bici) || 0)
  return Math.min(MAX_DURACION_MIN, Math.max(MIN_DURACION_MIN, Math.round(min / 30) * 30))
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
  // En cada hueco donde cabe: pegado a su inicio y a su fin, y cada media hora que deja libre
  // 0 o al menos 2 h antes y despues.
  const sirve = libre => libre === 0 || libre >= HUECO_MINIMO_MIN
  const horas = new Set()
  for (const [a, b] of huecos) {
    if (b - a < duracionMin) continue
    horas.add(a)
    horas.add(b - duracionMin)
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

// Puede reagendar siempre que tenga una hora (lo ya instalado se corta antes, en estadoAgenda).
export function puedeReagendar(instalacion) {
  return Boolean(instalacion?.fecha && instalacion.inicio)
}
