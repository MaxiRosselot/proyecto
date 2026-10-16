// Agendar la instalacion de una cotizacion aceptada.
//
// Crea (o mueve, si ya estaba agendada) el evento "Instalación - Nombre" en el calendario del
// negocio, invita al cliente si hay correo y deja la cotizacion confirmada, con los servicios
// adicionales y el total al dia, y la instalacion guardada en su fila (columna R).
//
// Calendar y la planilla se inyectan: en Netlify son Google; en local y en los tests, falsos.
import { ErrorCotizacion, actualizarCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { SERVICIOS } from './marca.mjs'
import { DESCUENTO_MAX, nombreServicio, totalesCotizacion } from './totales.mjs'

export { totalesCotizacion }

export const ZONA = 'America/Santiago'
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/
const ISO = /^\d{4}-\d{2}-\d{2}$/
const CORREO = /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/
// Marca que usan los recordatorios diarios para reconocer las instalaciones en el calendario.
export const MARCA_EVENTO = 'instalacion-donmaxi'

const falla = (mensaje, estado = 400) => { throw new ErrorCotizacion(estado, mensaje) }
const aMinutos = hhmm => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m }
export const correoValido = email => CORREO.test(String(email || '').trim())

export function duracionTexto(inicio, fin) {
  const minutos = aMinutos(fin) - aMinutos(inicio)
  const h = Math.floor(minutos / 60), m = minutos % 60
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ')
}

// Cantidades y precios enteros y no negativos, solo de los servicios que existen. Conserva los
// nombres editados y el descuento, que viajan en el mismo objeto.
export function limpiarAdicionales(adicionales = {}) {
  const limpio = {}
  for (const [clave, , lista] of SERVICIOS) {
    const qty = Number(adicionales[`qty_${clave}`] ?? 0)
    const precio = Number(adicionales[`precio_${clave}`] ?? lista)
    if (!Number.isInteger(qty) || qty < 0 || qty > 999) falla('Revisa la cantidad de los servicios adicionales')
    if (!Number.isInteger(precio) || precio < 0 || precio > 1e8) falla('Revisa el precio de los servicios adicionales')
    limpio[`qty_${clave}`] = qty
    limpio[`precio_${clave}`] = precio
    const nombre = String(adicionales[`nombre_${clave}`] ?? '').trim().slice(0, 60)
    if (nombre) limpio[`nombre_${clave}`] = nombre
  }
  const descuento = Number(adicionales.descuento_pct ?? 0)
  if (!Number.isInteger(descuento) || descuento < 0 || descuento > DESCUENTO_MAX) falla(`El descuento debe ser un porcentaje entre 0 y ${DESCUENTO_MAX}`)
  if (descuento) limpio.descuento_pct = descuento
  return limpio
}

// Al agendar se puede ajustar cada repisa de la cotizacion: cuantas van y a que precio (por ejemplo,
// el cliente se queda con una sola de las que eligio). Se cambian solo unidades y valor de las filas
// que ya existen; una fila en 0 queda guardada (para poder volver a sumarla) y el PDF no la muestra.
export function limpiarRepisas(originales = [], editadas) {
  if (editadas === undefined) return originales
  if (!Array.isArray(editadas) || editadas.length !== originales.length) falla('Las repisas cambiaron: recarga la cotización')
  return originales.map((fila, i) => {
    const unidades = Number(editadas[i]?.unidades)
    const valor = Number(editadas[i]?.valor)
    if (!Number.isInteger(unidades) || unidades < 0 || unidades > 999) falla('Revisa la cantidad de las repisas')
    if (!Number.isInteger(valor) || valor < 0 || valor > 1e8) falla('Revisa el precio de las repisas')
    return { ...fila, unidades, valor }
  })
}

export function validarHorario({ fecha, inicio, fin }) {
  if (!ISO.test(fecha || '') || Number.isNaN(Date.parse(fecha))) falla('Elige la fecha de la instalación')
  if (!HHMM.test(inicio || '') || !HHMM.test(fin || '')) falla('Indica la hora de inicio y de término')
  if (aMinutos(fin) <= aMinutos(inicio)) falla('La hora de término debe ser después de la de inicio')
}

const pesos = n => '$' + Math.round(n).toLocaleString('es-CL')

export function eventoInstalacion({ cotizacion, fecha, inicio, fin, adicionales, totales, invitado, notas }) {
  const servicios = SERVICIOS
    .filter(([clave]) => adicionales[`qty_${clave}`] > 0)
    .map(([clave]) => `• ${nombreServicio(adicionales, clave)} × ${adicionales[`qty_${clave}`]} (${pesos(adicionales[`precio_${clave}`])} c/u)`)
  const description = [
    `Cliente: ${cotizacion.nombre}`,
    cotizacion.telefono && `Teléfono: ${cotizacion.telefono}`,
    (invitado || cotizacion.email) && `Correo: ${invitado || cotizacion.email}`,
    cotizacion.direccion && `Dirección: ${cotizacion.direccion}`,
    `Cotización N° ${cotizacion.cotNum} · Total ${pesos(totales.total)} con IVA`,
    servicios.length && `\nServicios adicionales:\n${servicios.join('\n')}`,
    totales.descuento > 0 && `Descuento ${totales.descuentoPct}%: -${pesos(totales.descuento)} neto`,
    notas && `\nNotas:\n${notas}`,
  ].filter(Boolean).join('\n')
  return {
    summary: `Instalación - ${cotizacion.nombre}`,
    location: cotizacion.direccion || undefined,
    description,
    start: { dateTime: `${fecha}T${inicio}:00`, timeZone: ZONA },
    end: { dateTime: `${fecha}T${fin}:00`, timeZone: ZONA },
    attendees: invitado ? [{ email: invitado }] : [],
    reminders: { useDefault: true },
    extendedProperties: { shared: { created_by: MARCA_EVENTO, cliente: cotizacion.nombre, cot_num: String(cotizacion.cotNum) } },
  }
}

// Agenda la instalacion. Si la cotizacion ya tenia una, mueve ese mismo evento en vez de crear otro.
export async function agendarInstalacion(almacen, calendar, calendarId, datos) {
  const cotizacion = await obtenerCotizacion(almacen, datos.cotNum)
  if (!cotizacion) falla('Cotización no encontrada', 404)
  const fecha = datos.fecha, inicio = datos.inicio, fin = datos.fin
  validarHorario({ fecha, inicio, fin })
  const adicionales = limpiarAdicionales(datos.adicionales)
  const correoNuevo = String(datos.email || '').trim().toLowerCase()
  if (correoNuevo && !correoValido(correoNuevo)) falla('El correo del cliente no es válido')
  const email = correoNuevo || cotizacion.email || ''
  const invitado = datos.invitar !== false && correoValido(email) ? email : ''
  const repisas = limpiarRepisas(cotizacion.repisas || [], datos.repisas)
  const totales = totalesCotizacion(repisas, adicionales)
  if (totales.bruto <= 0) falla('La venta quedó en $0: deja al menos una repisa o un servicio')
  const notas = String(datos.notas || '').trim().slice(0, 1000)

  const cuerpo = eventoInstalacion({ cotizacion, fecha, inicio, fin, adicionales, totales, invitado, notas })
  const previo = cotizacion.instalacion?.eventId
  const respuesta = previo
    ? await calendar.events.patch({ calendarId, eventId: previo, sendUpdates: invitado ? 'all' : 'none', requestBody: cuerpo })
    : await calendar.events.insert({ calendarId, sendUpdates: invitado ? 'all' : 'none', requestBody: cuerpo })

  const instalacion = {
    eventId: respuesta.data.id, link: respuesta.data.htmlLink || '',
    fecha, inicio, fin, invitado, notas, agendadaEn: new Date().toISOString(),
  }
  await actualizarCotizacion(almacen, {
    cotNum: cotizacion.cotNum, status: 'confirmada', motivoRechazo: '',
    adicionales, subtotal: totales.subtotal, iva: totales.iva, total: totales.total,
    ...(datos.repisas !== undefined ? { repisas } : {}),
    instalacion, ...(email && email !== cotizacion.email ? { email } : {}),
  })
  return { instalacion, totales, email, repisas }
}

// Invita al cliente a una instalacion ya agendada, para cuando el correo se consigue despues.
export async function invitarClienteInstalacion(almacen, calendar, calendarId, { cotNum, email }) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla('Cotización no encontrada', 404)
  if (!cotizacion.instalacion?.eventId) falla('Esta cotización todavía no tiene instalación agendada')
  const correo = String(email || '').trim().toLowerCase()
  if (!correoValido(correo)) falla('El correo del cliente no es válido')
  await calendar.events.patch({ calendarId, eventId: cotizacion.instalacion.eventId, sendUpdates: 'all', requestBody: { attendees: [{ email: correo }] } })
  const instalacion = { ...cotizacion.instalacion, invitado: correo }
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, email: correo, instalacion })
  return { instalacion, email: correo }
}
