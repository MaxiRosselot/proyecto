// Horarios en que los clientes pueden agendar visita.
//
// Dos capas:
//   semanal : rangos que se repiten cada semana (ej. domingo 10:00-14:00)
//   fechas  : excepciones para un dia puntual. Con rangos abre ese dia con ese horario
//             (un sabado, o un domingo con otro horario); vacia cierra el dia.
// Mas "semanas": cuantas semanas hacia adelante ve el cliente.
//
// Se guarda en la pestaña "Horarios" de la planilla (GOOGLE_SHEET_ID), una fila por rango:
//   Tipo     | Día o fecha | Desde | Hasta
//   semanal  | domingo     | 10:00 | 14:00
//   fecha    | 2026-10-18  | 09:00 | 13:00
//   cerrado  | 2026-10-25  |       |
//   semanas  | 4           |       |
//
// Sin imports de Node: el panel admin usa estas mismas funciones para la vista previa.

export const HOJA_HORARIOS = 'Horarios'
export const ZONA = 'America/Santiago'
export const PASO_MIN = 30          // cada cuanto parte una visita
export const DURACION_MIN = 15      // lo que dura la visita
// No se ofrecen horarios que parten en menos de esto: nadie llega a una visita en 10 minutos.
export const ANTICIPACION_MIN = 60
export const MAX_SEMANAS = 12
export const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

// Lo que habia fijo en el codigo antes de poder editarlo: domingos, 4 semanas.
export const HORARIO_POR_DEFECTO = Object.freeze({
  semanal: { 0: [{ desde: '08:00', hasta: '20:00' }] },
  fechas: {},
  semanas: 4,
})

export class ErrorHorario extends Error {
  constructor(mensaje) { super(mensaje); this.estado = 400 }
}

// ── Horas y fechas ───────────────────────────────────────────────────────────

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const ISO = /^\d{4}-\d{2}-\d{2}$/

export const aMinutos = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const aHHMM = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

function fechaValida(iso) {
  if (!ISO.test(iso)) return false
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

export function diaSemana(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

export function sumarDias(iso, n) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

// Fecha y minuto actuales en Chile, sin depender de la zona del servidor (Netlify corre en UTC).
export function ahoraEnZona(ahora = new Date(), zona = ZONA) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(ahora).map(x => [x.type, x.value]))
  return { fecha: `${p.year}-${p.month}-${p.day}`, minutos: Number(p.hour) * 60 + Number(p.minute) }
}

// Instante UTC de una hora de reloj en la zona (incluye horario de verano).
export function horaLocalAUTC(fechaISO, hhmm, zona = ZONA) {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  const [h, m] = hhmm.split(':').map(Number)
  const supuesto = Date.UTC(Y, M - 1, D, h, m)
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zona, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(supuesto)).map(x => [x.type, x.value]))
  const visto = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second))
  return new Date(supuesto + (supuesto - visto))
}

// ── Validacion ───────────────────────────────────────────────────────────────

function normalizarRangos(rangos, donde) {
  if (!Array.isArray(rangos)) throw new ErrorHorario(`Rangos inválidos en ${donde}`)
  const limpios = rangos.map(r => {
    if (!HHMM.test(r?.desde || '') || !HHMM.test(r?.hasta || '')) throw new ErrorHorario(`Hora inválida en ${donde}: usa HH:MM`)
    const desde = aMinutos(r.desde), hasta = aMinutos(r.hasta)
    if (desde % PASO_MIN || hasta % PASO_MIN) throw new ErrorHorario(`En ${donde} las horas deben ser en punto o y media`)
    if (hasta - desde < DURACION_MIN) throw new ErrorHorario(`En ${donde} "hasta" debe ser después de "desde"`)
    return { desde, hasta }
  }).sort((a, b) => a.desde - b.desde)
  for (let i = 1; i < limpios.length; i++)
    if (limpios[i].desde < limpios[i - 1].hasta) throw new ErrorHorario(`En ${donde} hay rangos que se cruzan`)
  return limpios.map(r => ({ desde: aHHMM(r.desde), hasta: aHHMM(r.hasta) }))
}

// Devuelve la configuracion limpia o lanza ErrorHorario con un mensaje para el admin.
// Las fechas especiales que ya pasaron se descartan.
export function validarHorario(config, hoy = ahoraEnZona().fecha) {
  const semanal = {}
  for (let d = 0; d < 7; d++) {
    const rangos = normalizarRangos(config?.semanal?.[d] || [], DIAS[d])
    if (rangos.length) semanal[d] = rangos
  }
  const fechas = {}
  for (const [fecha, rangos] of Object.entries(config?.fechas || {})) {
    if (!fechaValida(fecha)) throw new ErrorHorario(`Fecha inválida: ${fecha}`)
    if (fecha < hoy) continue
    fechas[fecha] = normalizarRangos(rangos, fecha)
  }
  const semanas = Number(config?.semanas ?? HORARIO_POR_DEFECTO.semanas)
  if (!Number.isInteger(semanas) || semanas < 1 || semanas > MAX_SEMANAS)
    throw new ErrorHorario(`Las semanas visibles deben ser entre 1 y ${MAX_SEMANAS}`)
  return { semanal, fechas, semanas }
}

// ── Calculo de horarios ──────────────────────────────────────────────────────

// Una fecha especial manda sobre el horario semanal, aunque este vacia (dia cerrado).
export function rangosDelDia(config, fechaISO) {
  if (Object.prototype.hasOwnProperty.call(config.fechas || {}, fechaISO)) return config.fechas[fechaISO]
  return config.semanal?.[diaSemana(fechaISO)] || []
}

// Horas de inicio dentro de los rangos: cada PASO_MIN y que la visita termine antes del cierre.
// 10:00-14:00 da 10:00, 10:30 ... 13:30.
export function horasDeRangos(rangos) {
  const out = []
  for (const r of rangos) {
    for (let t = aMinutos(r.desde); t + DURACION_MIN <= aMinutos(r.hasta); t += PASO_MIN) out.push(aHHMM(t))
  }
  return out
}

// Lo que ve el cliente: los dias de las proximas `semanas` que tienen al menos un horario.
// Hoy solo ofrece horas que parten con ANTICIPACION_MIN de margen.
export function diasDisponibles(config, ahora = new Date()) {
  const { fecha: hoy, minutos } = ahoraEnZona(ahora)
  const dias = []
  for (let i = 0; i < config.semanas * 7; i++) {
    const fecha = sumarDias(hoy, i)
    let horas = horasDeRangos(rangosDelDia(config, fecha))
    if (i === 0) horas = horas.filter(h => aMinutos(h) >= minutos + ANTICIPACION_MIN)
    if (horas.length) dias.push({ fecha, horas })
  }
  return dias
}

// El servidor revisa con esto cada reserva: que la hora exista en el horario y no haya pasado.
export function horaPermitida(config, fechaISO, hhmm, ahora = new Date()) {
  if (!fechaValida(fechaISO) || !HHMM.test(hhmm || '')) return false
  return diasDisponibles(config, ahora).some(d => d.fecha === fechaISO && d.horas.includes(hhmm))
}

// ── Planilla ─────────────────────────────────────────────────────────────────

export const ENCABEZADOS_HORARIOS = ['Tipo', 'Día o fecha', 'Desde', 'Hasta']

export function horarioAFilas(config) {
  const filas = [['semanas', String(config.semanas), '', '']]
  for (let d = 0; d < 7; d++) for (const r of config.semanal[d] || []) filas.push(['semanal', DIAS[d], r.desde, r.hasta])
  for (const fecha of Object.keys(config.fechas).sort()) {
    const rangos = config.fechas[fecha]
    if (!rangos.length) filas.push(['cerrado', fecha, '', ''])
    for (const r of rangos) filas.push(['fecha', fecha, r.desde, r.hasta])
  }
  return filas
}

const sinTilde = s => String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// Lee las filas tal como esten, tambien si alguien las edito a mano en la planilla.
// Sin filas (pestaña nueva o vacia) se usa el horario por defecto.
export function filasAHorario(filas) {
  const datos = (filas || []).filter(f => f?.some(c => String(c ?? '').trim()))
  if (!datos.length) return structuredClone(HORARIO_POR_DEFECTO)
  const config = { semanal: {}, fechas: {}, semanas: HORARIO_POR_DEFECTO.semanas }
  for (const [tipo, clave, desde, hasta] of datos.map(f => f.map(c => String(c ?? '').trim()))) {
    const t = sinTilde(tipo)
    if (t === 'semanas') config.semanas = Number(clave)
    else if (t === 'semanal') {
      const d = DIAS.map(sinTilde).indexOf(sinTilde(clave))
      if (d >= 0) (config.semanal[d] ||= []).push({ desde, hasta })
    } else if (t === 'fecha') (config.fechas[clave] ||= []).push({ desde, hasta })
    else if (t === 'cerrado') config.fechas[clave] ||= []
  }
  return config
}

export function almacenHorariosSheets(sheets, spreadsheetId, hoja = HOJA_HORARIOS) {
  return {
    // null si la pestaña todavia no existe.
    async leerFilas() {
      if (!spreadsheetId) return null
      try {
        const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${hoja}!A2:D` })
        return res.data.values || []
      } catch (e) {
        if (String(e?.message || e).includes('Unable to parse range')) return null
        throw e
      }
    },
    async guardarFilas(filas) {
      const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' })
      if (!meta.data.sheets.some(s => s.properties.title === hoja)) {
        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests: [{ addSheet: { properties: { title: hoja } } }] } })
      }
      await sheets.spreadsheets.values.clear({ spreadsheetId, range: `${hoja}!A:D` })
      await sheets.spreadsheets.values.update({
        spreadsheetId, range: `${hoja}!A1`, valueInputOption: 'RAW',
        requestBody: { values: [ENCABEZADOS_HORARIOS, ...filas] },
      })
    },
  }
}

// Horario vigente. Si la planilla tiene algo mal escrito a mano, se avisa en el log y se usa el
// por defecto antes que dejar a los clientes sin poder agendar.
export async function leerHorario(almacen) {
  const filas = await almacen.leerFilas()
  try { return validarHorario(filasAHorario(filas)) }
  catch (e) {
    console.error('Pestaña Horarios inválida, se usa el horario por defecto:', e.message)
    return validarHorario(HORARIO_POR_DEFECTO)
  }
}

export async function guardarHorario(almacen, config) {
  const limpio = validarHorario(config)
  await almacen.guardarFilas(horarioAFilas(limpio))
  return limpio
}
