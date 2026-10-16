// La pagina /reserva del cliente y el aviso de Mercado Pago, sin depender de Netlify: los usan las
// funciones reserva y mp-webhook, y el backend local, con los mismos argumentos.
//
// deps: { almacen, config, mp, calendar, calendarId, leerEventos(desde, hasta), enviarCorreo, avisoA, ahora }
import { listarCotizaciones, obtenerCotizacion } from './cotizaciones.mjs'
import { ahoraEnZona } from './horarios.mjs'
import { MARCA, OFERTA, WHATSAPP } from './marca.mjs'
import { correoAvisoTransferencia, correoReservaConfirmada, correoTransferenciaAvisada } from './mensajes.mjs'
import { avisoAutentico, firmaPago, firmaValida, opcionesDePago, preferenciaPago, registrarPagoMercadoPago } from './mercadopago.mjs'
import { resumenPagos } from './pagos-resumen.mjs'
import { bloquesTomados, completarReservaMercadoPago, disponibilidad, estadoCliente, rangoAgenda, solicitarReserva } from './reservas.mjs'

const json = (statusCode, body) => ({ statusCode, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: JSON.stringify(body) })
const primerNombre = n => String(n || '').trim().split(/\s+/)[0] || ''
const correoValido = e => /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(String(e || '').trim())

function verificar(c, t, config) {
  const cotNum = String(c || '').trim()
  if (!config || !/^\d{1,9}$/.test(cotNum) || !firmaValida(cotNum, t, config.secreto)) return null
  return cotNum
}

async function tomadosPara(cotNum, deps) {
  const hoy = ahoraEnZona(new Date(deps.ahora ?? Date.now())).fecha
  const { desde, hasta } = rangoAgenda(hoy)
  const [eventos, { quotes }] = await Promise.all([deps.leerEventos(desde, hasta), listarCotizaciones(deps.almacen)])
  return { hoy, tomados: bloquesTomados({ eventos, cotizaciones: quotes, excepto: cotNum, ahora: deps.ahora ?? Date.now() }) }
}

const vistaReserva = r => r && { estado: r.estado, medio: r.medio, opcion: r.opcion, monto: r.monto, fecha: r.fecha || null, inicio: r.inicio || null, fin: r.fin || null, motivo: r.motivo || '' }

// GET /reserva?c=&t= → lo que la pagina necesita para mostrar el paso en que va el cliente.
export async function atenderReservaGet(params, deps) {
  const cotNum = verificar(params.c, params.t, deps.config)
  if (!cotNum) return json(404, { ok: false, error: 'Link no válido. Revisa que esté completo o pídenos uno nuevo.' })
  const cotizacion = await obtenerCotizacion(deps.almacen, cotNum)
  const ahora = deps.ahora ?? Date.now()
  const estado = estadoCliente(cotizacion, ahora)
  if (estado === 'no-disponible') return json(404, { ok: false, error: 'Esta cotización ya no está disponible. Escríbenos y te enviamos una actualizada.', whatsapp: WHATSAPP })

  const { pagado, saldo, total } = resumenPagos(cotizacion.total, cotizacion.pagos)
  const conDispo = estado === 'por-agendar' || estado === 'esperando-pago'
  const { hoy, tomados } = conDispo ? await tomadosPara(cotNum, deps) : {}
  return json(200, {
    ok: true, estado,
    cotizacion: {
      cotNum, nombre: primerNombre(cotizacion.nombre), direccion: cotizacion.direccion || '', total, pagado, saldo,
      instalacion: cotizacion.instalacion?.fecha ? { fecha: cotizacion.instalacion.fecha, inicio: cotizacion.instalacion.inicio, fin: cotizacion.instalacion.fin } : null,
      reserva: vistaReserva(cotizacion.reserva),
    },
    pagos: {
      transferencia: opcionesDePago(cotizacion, 'transferencia'),
      mercadopago: deps.config.token ? opcionesDePago(cotizacion, 'mercadopago') : null,
    },
    disponibilidad: conDispo ? disponibilidad(hoy, tomados) : [],
    banco: { razonSocial: MARCA.razonSocial, rut: MARCA.rut, banco: MARCA.banco, tipoCuenta: MARCA.tipoCuenta, numeroCuenta: MARCA.numeroCuenta },
    descuentoTransferencia: OFERTA.descuento,
    whatsapp: WHATSAPP,
  })
}

// POST { c, t, accion: 'transferencia' | 'mercadopago', fecha?, inicio?, opcion }
export async function atenderReservaPost(body, deps) {
  const cotNum = verificar(body.c, body.t, deps.config)
  if (!cotNum) return json(404, { ok: false, error: 'Link no válido' })
  if (body.accion === 'mercadopago' && !deps.config.token) return json(400, { ok: false, error: 'El pago con Mercado Pago no está disponible. Puedes pagar por transferencia.' })
  const { tomados } = await tomadosPara(cotNum, deps)
  const { cotizacion, reserva, opcion } = await solicitarReserva(deps.almacen, { cotNum, fecha: body.fecha, inicio: body.inicio, medio: body.accion, opcion: body.opcion }, { tomados, ahora: deps.ahora ?? Date.now() })

  if (body.accion === 'mercadopago') {
    const pref = await deps.mp.crearPreferencia(preferenciaPago(cotizacion, opcion, { base: deps.config.base, firma: firmaPago(cotNum, deps.config.secreto) }))
    return json(200, { ok: true, url: pref.init_point })
  }
  // Transferencia: acuso al cliente y aviso para verificar. Si un correo falla, la reserva igual queda.
  const correos = []
  if (correoValido(cotizacion.email)) correos.push(correoTransferenciaAvisada(cotizacion, reserva))
  if (deps.avisoA) correos.push({ para: deps.avisoA, ...correoAvisoTransferencia(cotizacion, reserva, `${deps.config.base}/admin`) })
  for (const correo of correos) await deps.enviarCorreo?.(correo).catch(e => console.warn('reserva: correo no enviado:', e.message))
  return json(200, { ok: true, reserva: vistaReserva(reserva) })
}

// POST del aviso de Mercado Pago. Solo confia en lo que devuelve la API al consultar el pago.
// Si el pago venia de una reserva, agenda la instalacion y le confirma al cliente por correo.
export async function atenderAvisoMercadoPago({ query = {}, body = {}, headers = {} }, deps) {
  const tipo = body.type || body.topic || query.type || query.topic
  const dataId = body.data?.id || query['data.id'] || query.id
  if (tipo !== 'payment' || !dataId) return { statusCode: 200, body: JSON.stringify({ ok: true, ignorado: tipo || 'sin tipo' }) }
  if (!avisoAutentico({ firma: headers['x-signature'], requestId: headers['x-request-id'], dataId }, deps.secretoAviso)) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'Firma inválida' }) }
  }
  const pago = await deps.mp.obtenerPago(dataId)
  let r
  try { r = await registrarPagoMercadoPago(deps.almacen, pago) }
  catch (e) {
    // Un pago que no es de una cotizacion (otro cobro de la cuenta): se ignora para que no reintente.
    if (e.estado === 404) { console.warn(e.message); return { statusCode: 200, body: JSON.stringify({ ok: true, ignorado: e.message }) } }
    throw e
  }
  if (r.registrado) {
    const { instalacion } = await completarReservaMercadoPago(deps.almacen, deps.calendar, deps.calendarId, r.cotNum)
    r.instalacion = instalacion
    const cotizacion = await obtenerCotizacion(deps.almacen, r.cotNum)
    if (instalacion && correoValido(cotizacion.email)) {
      await deps.enviarCorreo?.(correoReservaConfirmada(cotizacion, instalacion, resumenPagos(cotizacion.total, cotizacion.pagos))).catch(e => console.warn('Confirmación no enviada:', e.message))
    }
    if (deps.alRegistrar) await deps.alRegistrar(r).catch(e => console.warn('Aviso de pago no enviado:', e.message))
  }
  return { statusCode: 200, body: JSON.stringify({ ok: true, ...r }) }
}
