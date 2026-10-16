// La planilla de instalaciones: cada fila es una venta (una cotizacion confirmada con su instalacion),
// como en el Excel de Maxi. Aca se edita una fila, se agrega una nueva y se cancela, con el
// calendario del negocio al dia: cambiar fecha u horas mueve el evento, cancelar lo borra.
//
// Lo propio de la fila vive dentro de "instalacion" (columna R): fecha, horas, instalada, nota
// interna (columna A del Excel), codigo de documento (B, B*, M...) y el evento de Calendar.
// Calendar y la planilla se inyectan: en Netlify son Google; en local y en los tests, falsos.
import { ErrorCotizacion, actualizarCotizacion, actualizarVariasCotizaciones, crearCotizacion, listarCotizaciones, obtenerCotizacion } from './cotizaciones.mjs'
import { normalizarDocumento } from './documentos.mjs'
import { MARCA_EVENTO, eventoInstalacion, limpiarAdicionales, limpiarRepisas, validarHorario } from './instalaciones.mjs'
import { mismoNombre } from './leer-ventas.mjs'
import { totalesCotizacion } from './totales.mjs'

const falla = (mensaje, estado = 400) => { throw new ErrorCotizacion(estado, mensaje) }
const texto = (v, max) => String(v ?? '').trim().slice(0, max)

// El evento de esta venta en el calendario aunque no este enlazado (los que creaba el script del
// Excel): mismo dia y el nombre del cliente en el titulo, o ya marcado con su N°.
export const tituloSinPrefijo = t => String(t || '').replace(/^\s*instalaci[oó]n\s*[-—:]?\s*/i, '')
async function buscarEvento(leerEventos, cotizacion, fechas) {
  for (const fecha of [...new Set(fechas.filter(Boolean))]) {
    const eventos = (await leerEventos(fecha, fecha)).filter(e => e.tipo !== 'visita')
    const ev = eventos.find(e => String(e.cotNum || '') === String(cotizacion.cotNum)) || eventos.find(e => mismoNombre(cotizacion.nombre, tituloSinPrefijo(e.titulo)))
    if (ev) return ev
  }
  return null
}

// Crea o mueve el evento de la instalacion; sin fecha, lo borra. Si la fila no tenia evento
// enlazado, antes de crear uno busca el que ya exista ese dia, para no duplicarlo.
async function sincronizarEvento(calendar, calendarId, cotizacion, instalacion, { leerEventos, fechaPrevia } = {}) {
  const { fecha, inicio, fin, invitado } = instalacion
  let { eventId } = instalacion
  if (!eventId && leerEventos && fecha) eventId = (await buscarEvento(leerEventos, cotizacion, [fechaPrevia, fecha]))?.id || ''
  if (!fecha || !inicio || !fin) {
    if (eventId) await borrarEvento(calendar, calendarId, eventId)
    return { ...instalacion, eventId: '', link: '' }
  }
  validarHorario({ fecha, inicio, fin })
  const cuerpo = eventoInstalacion({ cotizacion, fecha, inicio, fin, adicionales: cotizacion.adicionales || {}, totales: totalesCotizacion(cotizacion.repisas || [], cotizacion.adicionales || {}), invitado: invitado || '', notas: instalacion.notas || instalacion.nota || '' })
  let r = null
  if (eventId) {
    try { r = await calendar.events.patch({ calendarId, eventId, sendUpdates: invitado ? 'all' : 'none', requestBody: cuerpo }) }
    catch (e) { if (![404, 410].includes(e?.code ?? e?.response?.status)) throw e } // lo borraron en Calendar: se crea de nuevo
  }
  r ||= await calendar.events.insert({ calendarId, sendUpdates: 'none', requestBody: cuerpo })
  return { ...instalacion, eventId: r.data.id, link: r.data.htmlLink || instalacion.link || '' }
}

async function borrarEvento(calendar, calendarId, eventId) {
  try { await calendar.events.delete({ calendarId, eventId, sendUpdates: 'all' }) }
  catch (e) { if (![404, 410].includes(e?.code ?? e?.response?.status)) throw e } // ya no estaba
}

// cambios: nombre, telefono, direccion, email, nota, documento, instalada, fecha, inicio, fin,
// repisas ([{ unidades, valor }] por fila), repisasTotal (un solo monto, como la columna REPISAS
// del Excel: para ventas sin repisas detalladas o con una sola fila) y adicionales
// (servicios, despacho, descuento).
export async function actualizarFila(almacen, calendar, calendarId, cotNum, cambios = {}, { leerEventos } = {}) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla('Venta no encontrada', 404)
  const previa = cotizacion.instalacion || {}
  const datos = {}, instalacion = { ...previa }

  for (const campo of ['nombre', 'telefono', 'direccion', 'email']) if (cambios[campo] !== undefined) datos[campo] = texto(cambios[campo], 120)
  if (datos.nombre === '') falla('El nombre no puede quedar vacío')
  if (cambios.nota !== undefined) instalacion.nota = texto(cambios.nota, 300)
  if (cambios.documento !== undefined) instalacion.documento = normalizarDocumento(cambios.documento)
  if (cambios.instalada !== undefined) instalacion.instalada = cambios.instalada === true
  for (const campo of ['fecha', 'inicio', 'fin']) if (cambios[campo] !== undefined) instalacion[campo] = texto(cambios[campo], 10)

  // Montos: el cliente saco o agrego algo al instalar. Cambia el total; el PDF enviado no se toca.
  let repisas = cambios.repisas !== undefined ? limpiarRepisas(cotizacion.repisas || [], cambios.repisas) : cotizacion.repisas || []
  if (cambios.repisasTotal !== undefined) {
    const valor = Number(cambios.repisasTotal)
    if (!Number.isInteger(valor) || valor < 0 || valor > 1e8) falla('Revisa el monto de las repisas')
    if (repisas.length > 1) falla('Esta venta tiene varias repisas: edítalas en el detalle')
    repisas = [{ label: 'Repisas', ...repisas[0], unidades: 1, valor }]
  }
  const adicionales = cambios.adicionales !== undefined ? limpiarAdicionales({ ...cotizacion.adicionales, ...cambios.adicionales }) : cotizacion.adicionales || {}
  if (cambios.repisas !== undefined || cambios.repisasTotal !== undefined || cambios.adicionales !== undefined) {
    const t = totalesCotizacion(repisas, adicionales)
    Object.assign(datos, { repisas, adicionales, subtotal: t.subtotal, iva: t.iva, total: t.total })
  }

  const actualizada = { ...cotizacion, ...datos }
  const mueveEvento = ['fecha', 'inicio', 'fin'].some(c => cambios[c] !== undefined && cambios[c] !== previa[c])
    || (datos.nombre && datos.nombre !== cotizacion.nombre && previa.eventId)
  if (mueveEvento && calendar) Object.assign(instalacion, await sincronizarEvento(calendar, calendarId, actualizada, instalacion, { leerEventos, fechaPrevia: previa.fecha }))

  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, ...datos, instalacion })
  return { cotizacion: { ...actualizada, instalacion } }
}

// Una instalacion que no paso por el cotizador: nombre, dia y horas; los montos se completan despues.
export async function crearInstalacion(almacen, calendar, calendarId, { nombre, telefono = '', direccion = '', fecha = '', inicio = '', fin = '', nota = '' }, ahora = new Date()) {
  if (!texto(nombre, 120)) falla('Escribe el nombre del cliente')
  if (fecha) validarHorario({ fecha, inicio, fin })
  const base = { nombre: texto(nombre, 120), telefono: texto(telefono, 40), direccion: texto(direccion, 160), repisas: [], adicionales: {}, subtotal: 0, iva: 0, total: 0 }
  let instalacion = { fecha: texto(fecha, 10), inicio: texto(inicio, 5), fin: texto(fin, 5), instalada: false, nota: texto(nota, 300), documento: '' }
  // Si otro toma el mismo numero a la vez, crearCotizacion responde 409 y se pide el siguiente.
  let respuesta
  for (let intento = 0; intento < 3 && !respuesta?.ok; intento++) {
    ({ respuesta } = await crearCotizacion(almacen, { crear: true, ...base, status: 'confirmada', notas: 'Agregada desde la planilla', instalacion }, ahora))
  }
  if (!respuesta?.ok) falla('No se pudo agregar la instalación. Intenta de nuevo.', 503)
  if (fecha && calendar) {
    instalacion = await sincronizarEvento(calendar, calendarId, { ...base, cotNum: respuesta.cotNum }, instalacion)
    await actualizarCotizacion(almacen, { cotNum: respuesta.cotNum, instalacion })
  }
  return { cotizacion: await obtenerCotizacion(almacen, respuesta.cotNum) }
}

// Enlaza la venta con un evento que ya esta en el calendario (elegido en el detalle): el evento
// pasa a la fecha y horas de la fila y queda marcado como de esta instalacion.
export async function enlazarEvento(almacen, calendar, calendarId, { cotNum, eventId }) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla('Venta no encontrada', 404)
  if (!eventId) falla('Elige el evento')
  const inst = { ...(cotizacion.instalacion || {}), eventId: String(eventId) }
  const instalacion = inst.fecha && inst.inicio && inst.fin
    ? await sincronizarEvento(calendar, calendarId, cotizacion, inst)
    : { ...inst, link: (await calendar.events.patch({ calendarId, eventId: inst.eventId, sendUpdates: 'none', requestBody: { extendedProperties: { shared: { created_by: MARCA_EVENTO, cliente: cotizacion.nombre, cot_num: String(cotizacion.cotNum) } } } })).data.htmlLink || '' }
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, instalacion })
  return { cotizacion: { ...cotizacion, instalacion } }
}

// Deja la fila en el calendario: mueve su evento a la hora de la fila, enlaza el que ya exista ese
// dia con su nombre o, si no hay, lo crea. Lo usa "Pasar al calendario" de la planilla, fila por fila.
export async function sincronizarFila(almacen, calendar, calendarId, { cotNum }, { leerEventos } = {}) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla('Venta no encontrada', 404)
  const inst = cotizacion.instalacion || {}
  if (!inst.fecha || !inst.inicio || !inst.fin) falla(`${cotizacion.nombre}: le falta la fecha o las horas`)
  const instalacion = await sincronizarEvento(calendar, calendarId, cotizacion, inst, { leerEventos })
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, instalacion })
  return { cotizacion: { ...cotizacion, instalacion } }
}

// Lo mismo para un bloque de filas: una lectura y una escritura de la planilla para todo el bloque
// (Google limita las lecturas por minuto) y los eventos de cada dia se leen una vez.
export async function sincronizarVarias(almacen, calendar, calendarId, { cotNums = [] }, { leerEventos } = {}) {
  if (!Array.isArray(cotNums) || !cotNums.length || cotNums.length > 12) falla('Manda entre 1 y 12 ventas por vez')
  const { quotes } = await listarCotizaciones(almacen)
  const porDia = new Map()
  const eventosDelDia = leerEventos && ((desde, hasta) => {
    const clave = desde + '|' + hasta
    if (!porDia.has(clave)) porDia.set(clave, leerEventos(desde, hasta))
    return porDia.get(clave)
  })
  const cambios = [], errores = []
  for (const cotNum of cotNums) {
    const q = quotes.find(x => String(x.cotNum) === String(cotNum))
    const inst = q?.instalacion || {}
    if (!q) { errores.push(`N° ${cotNum}: no existe`); continue }
    if (!inst.fecha || !inst.inicio || !inst.fin) { errores.push(`${q.nombre}: le falta la fecha o las horas`); continue }
    try { cambios.push({ cotNum: q.cotNum, instalacion: await sincronizarEvento(calendar, calendarId, q, inst, { leerEventos: eventosDelDia }) }) }
    catch (e) { errores.push(`${q.nombre}: ${e.message}`) }
  }
  await actualizarVariasCotizaciones(almacen, cambios)
  return { hechas: cambios.length, errores }
}

// El cliente cancelo: sale de la planilla (queda como rechazada, motivo "Canceló") y se borra el evento.
export async function cancelarInstalacion(almacen, calendar, calendarId, { cotNum }) {
  const cotizacion = await obtenerCotizacion(almacen, cotNum)
  if (!cotizacion) falla('Venta no encontrada', 404)
  const inst = cotizacion.instalacion
  if (inst?.eventId && calendar) await borrarEvento(calendar, calendarId, inst.eventId)
  const instalacion = inst ? { ...inst, eventId: '', link: '', cancelada: new Date().toISOString() } : null
  await actualizarCotizacion(almacen, { cotNum: cotizacion.cotNum, status: 'rechazada', motivoRechazo: 'Canceló', ...(instalacion ? { instalacion } : {}) })
  return { ok: true }
}
