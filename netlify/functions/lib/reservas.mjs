// Reserva de la instalacion por el propio cliente, desde el link de su cotizacion.
//
// El cliente ve los bloques libres (lunes a viernes, 10 a 13 y 13 a 16), elige uno y paga:
// - por transferencia (con descuento): avisa que transfirio, el bloque queda reservado y Don Maxi
//   lo verifica en el panel. Al confirmarlo se registra el pago, se agenda la instalacion (con la
//   invitacion de Calendar) y se le avisa por correo.
// - con Mercado Pago: el bloque queda reservado 30 minutos mientras paga; cuando Mercado Pago
//   aprueba el pago, la instalacion se agenda sola.
// Un bloque se ocupa si se cruza con una instalacion del calendario o con otra reserva vigente.
//
// La reserva vive en la columna T de la cotizacion. Calendar y la planilla se inyectan.
import { ErrorCotizacion, actualizarCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { aMinutos, ahoraEnZona, diaSemana, sumarDias } from './horarios.mjs'
import { agendarInstalacion } from './instalaciones.mjs'
import { opcionesDePago } from './mercadopago.mjs'
import { resumenPagos } from './pagos-resumen.mjs'
import { registrarPago } from './pagos.mjs'
import { totalesCotizacion } from './totales.mjs'

export const AGENDA_INSTALACIONES = Object.freeze({
  bloques: [['10:00', '13:00'], ['13:00', '16:00']],
  dias: [1, 2, 3, 4, 5], // lunes a viernes (0 = domingo)
  semanas: 4,
  desdeDias: 1, // se puede reservar desde mañana
})
export const RETENCION_MP_MIN = 30
export const MEDIOS = ['transferencia', 'mercadopago']

const falla = (mensaje, estado = 400) => { throw new ErrorCotizacion(estado, mensaje) }
const hoyChile = (ahora = Date.now()) => ahoraEnZona(new Date(ahora)).fecha

export function reservaVigente(reserva, ahora = Date.now()) {
  if (!reserva?.fecha) return false
  if (reserva.estado === 'por verificar') return true
  return reserva.estado === 'esperando pago' && Date.parse(reserva.expira) > ahora
}

// Lo que ocupa la agenda: instalaciones del calendario y reservas vigentes de otras cotizaciones.
export function bloquesTomados({ eventos = [], cotizaciones = [], excepto, ahora = Date.now() }) {
  const deEventos = eventos.filter(e => e.tipo === 'instalacion')
    .map(e => ({ fecha: e.fecha, desde: e.todoElDia ? 0 : e.minutoInicio, hasta: e.todoElDia ? 1440 : e.minutoFin }))
  const deReservas = cotizaciones.filter(c => String(c.cotNum) !== String(excepto) && reservaVigente(c.reserva, ahora))
    .map(c => ({ fecha: c.reserva.fecha, desde: aMinutos(c.reserva.inicio), hasta: aMinutos(c.reserva.fin) }))
  return [...deEventos, ...deReservas]
}

export function rangoAgenda(hoy, config = AGENDA_INSTALACIONES) {
  const desde = sumarDias(hoy, config.desdeDias)
  return { desde, hasta: sumarDias(desde, config.semanas * 7 - 1) }
}

// Dias habiles del rango con sus bloques, libres u ocupados.
export function disponibilidad(hoy, tomados, config = AGENDA_INSTALACIONES) {
  const { desde, hasta } = rangoAgenda(hoy, config)
  const dias = []
  for (let fecha = desde; fecha <= hasta; fecha = sumarDias(fecha, 1)) {
    if (!config.dias.includes(diaSemana(fecha))) continue
    dias.push({
      fecha,
      bloques: config.bloques.map(([inicio, fin]) => ({
        inicio, fin, libre: !tomados.some(t => t.fecha === fecha && t.desde < aMinutos(fin) && t.hasta > aMinutos(inicio)),
      })),
    })
  }
  return dias
}

// En que punto esta el cliente: lo que ve al abrir su link.
export function estadoCliente(cotizacion, ahora = Date.now()) {
  if (!cotizacion || cotizacion.status === 'rechazada') return 'no-disponible'
  const { saldo } = resumenPagos(cotizacion.total, cotizacion.pagos)
  const r = cotizacion.reserva
  if (r?.estado === 'por verificar') return 'verificando'
  // Volvio de Mercado Pago y el aviso aun no llega. Si lo abandono, a los 30 minutos puede reintentar.
  if (r?.estado === 'esperando pago' && Date.parse(r.expira) > ahora) return 'esperando-pago'
  if (cotizacion.instalacion) return saldo > 0 ? 'agendada' : 'lista'
  return saldo > 0 ? 'por-agendar' : 'pagada-sin-fecha'
}

// El cliente elige bloque (si aun no tiene instalacion) y como paga. El monto se calcula aca.
export async function solicitarReserva(almacen, { cotNum, fecha, inicio, medio, opcion }, { tomados = [], ahora = Date.now() } = {}) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion || cotizacion.status === 'rechazada') falla('Esta cotización ya no está disponible', 404)
  if (cotizacion.reserva?.estado === 'por verificar') falla('Ya tenemos tu aviso de transferencia y lo estamos revisando.', 409)
  if (!MEDIOS.includes(medio)) falla('Elige cómo vas a pagar')
  const info = opcionesDePago(cotizacion, medio)
  const elegida = info.opciones.find(o => o.id === opcion)
  if (!elegida) falla(info.opciones.length ? 'Elige cuánto vas a pagar' : 'Esta cotización ya está pagada', info.opciones.length ? 400 : 409)

  let bloque = {}
  if (!cotizacion.instalacion) {
    const b = disponibilidad(hoyChile(ahora), tomados).find(d => d.fecha === fecha)?.bloques.find(x => x.inicio === inicio)
    if (!b) falla('Elige un día y horario de la lista')
    if (!b.libre) falla('Ese horario se acaba de ocupar. Elige otro, por favor.', 409)
    bloque = { fecha, inicio: b.inicio, fin: b.fin }
  }
  const reserva = {
    ...bloque, medio, opcion: elegida.id, monto: elegida.monto, descuentoPct: info.descuento,
    estado: medio === 'transferencia' ? 'por verificar' : 'esperando pago', creada: new Date(ahora).toISOString(),
    ...(medio === 'mercadopago' ? { expira: new Date(ahora + RETENCION_MP_MIN * 60000).toISOString() } : {}),
  }
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, reserva })
  return { cotizacion, reserva, opcion: elegida }
}

async function agendarDesdeReserva(almacen, calendar, calendarId, cotNum, reserva) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  const { instalacion } = await agendarInstalacion(almacen, calendar, calendarId, {
    cotNum, fecha: reserva.fecha, inicio: reserva.inicio, fin: reserva.fin, adicionales: cotizacion.adicionales,
    email: cotizacion.email, invitar: true, notas: 'Reservada por el cliente desde su link.',
  })
  return instalacion
}

// Don Maxi vio la transferencia en su cuenta: descuento, pago, instalacion y fin de la reserva.
export async function confirmarTransferencia(almacen, calendar, calendarId, { cotNum }, ahora = Date.now()) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  const r = cotizacion?.reserva
  if (!r || r.estado !== 'por verificar') falla('No hay una transferencia por verificar en esta cotización', 409)
  if (r.descuentoPct && !totalesCotizacion(cotizacion.repisas, cotizacion.adicionales).descuentoPct) {
    const adicionales = { ...(cotizacion.adicionales || {}), descuento_pct: r.descuentoPct }
    const t = totalesCotizacion(cotizacion.repisas || [], adicionales)
    await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, adicionales, subtotal: t.subtotal, iva: t.iva, total: t.total })
  }
  await registrarPago(almacen, { cotNum: cotizacion.cotNum, monto: r.monto, medio: 'Transferencia', fecha: hoyChile(ahora), nota: 'Transferencia avisada por el cliente y verificada' }, new Date(ahora))
  let instalacion = null
  if (r.fecha && !cotizacion.instalacion) instalacion = await agendarDesdeReserva(almacen, calendar, calendarId, cotizacion.cotNum, r)
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, reserva: null, ...(instalacion || cotizacion.status !== 'por confirmar' ? {} : { status: 'confirmada' }) })
  return { cotizacion: await obtenerCotizacion(almacen, cotizacion.cotNum), instalacion }
}

// La transferencia no llego: el bloque se libera y el cliente puede volver a intentarlo.
export async function rechazarTransferencia(almacen, { cotNum, motivo = '' }, ahora = Date.now()) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  const r = cotizacion?.reserva
  if (!r || r.estado !== 'por verificar') falla('No hay una transferencia por verificar en esta cotización', 409)
  const reserva = { ...r, estado: 'rechazada', motivo: String(motivo).trim().slice(0, 200) || 'No encontramos la transferencia', revisada: new Date(ahora).toISOString() }
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, reserva })
  return { reserva }
}

// Mercado Pago aprobo el pago (ya registrado): si venia de una reserva, se agenda la instalacion.
export async function completarReservaMercadoPago(almacen, calendar, calendarId, cotNum) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  const r = cotizacion?.reserva
  if (!r || r.medio !== 'mercadopago') return { instalacion: null }
  const instalacion = r.fecha && !cotizacion.instalacion ? await agendarDesdeReserva(almacen, calendar, calendarId, cotizacion.cotNum, r) : null
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, reserva: null })
  return { instalacion }
}
