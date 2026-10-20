import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion, listarCotizaciones } from './cotizaciones.mjs'
import { firmaPago } from './mercadopago.mjs'
import { bloquesTomados, completarReservaMercadoPago, confirmarTransferencia, disponibilidad, estadoCliente, rechazarTransferencia, solicitarReserva } from './reservas.mjs'
import { atenderAvisoMercadoPago, atenderReservaGet, atenderReservaPost } from './reserva-cliente.mjs'

// Miercoles 14 de octubre de 2026, 12:00 en Chile.
const AHORA = Date.parse('2026-10-14T15:00:00Z')
const CONFIG = { token: 'tok', secreto: 'secreto', base: 'https://donmaxi.example' }
const T = firmaPago('1500', CONFIG.secreto)

async function conCotizacion(extra = {}) {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, {
    crear: true, cotNum: 1500, nombre: 'Marta Díaz', email: 'marta@example.cl', telefono: '9 7777 8888', direccion: 'Av. Grecia 1500',
    repisas: [{ unidades: 1, valor: 100000 }], adicionales: {}, subtotal: 100000, iva: 19000, total: 119000, ...extra,
  }, new Date(AHORA))
  return almacen
}
function calendarFalso() {
  const eventos = []
  return { eventos, events: {
    async insert({ requestBody }) { eventos.push(requestBody); return { data: { id: 'ev' + eventos.length, htmlLink: 'https://calendar/ev' } } },
    async patch({ eventId, requestBody }) { return { data: { id: eventId, htmlLink: 'https://calendar/ev' } } },
  } }
}
const instalacionEnCalendario = (fecha, inicio, fin) => ({ tipo: 'instalacion', fecha, minutoInicio: Number(inicio.slice(0, 2)) * 60, minutoFin: Number(fin.slice(0, 2)) * 60, todoElDia: false })

test('lunes a viernes, dos bloques de 3 horas, desde mañana y por 4 semanas', () => {
  const dias = disponibilidad('2026-10-14', [])
  assert.equal(dias[0].fecha, '2026-10-15') // jueves
  assert.equal(dias[2].fecha, '2026-10-19') // salta el fin de semana
  assert.equal(dias.length, 20)
  assert.deepEqual(dias[0].bloques.map(b => [b.inicio, b.fin, b.libre]), [['10:00', '13:00', true], ['13:00', '16:00', true]])
})

test('una instalacion que se cruza bloquea el bloque; las visitas no', () => {
  const tomados = bloquesTomados({ eventos: [instalacionEnCalendario('2026-10-15', '12:00', '14:00'), { tipo: 'visita', fecha: '2026-10-16', minutoInicio: 600, minutoFin: 615 }] })
  const [jueves, viernes] = disponibilidad('2026-10-14', tomados)
  assert.deepEqual(jueves.bloques.map(b => b.libre), [false, false])
  assert.deepEqual(viernes.bloques.map(b => b.libre), [true, true])
  const soloTarde = disponibilidad('2026-10-14', bloquesTomados({ eventos: [instalacionEnCalendario('2026-10-15', '13:00', '16:00')] }))[0]
  assert.deepEqual(soloTarde.bloques.map(b => b.libre), [true, false])
})

test('las reservas de otros clientes ocupan su bloque mientras siguen vigentes', () => {
  const cotizaciones = [
    { cotNum: 1, reserva: { estado: 'por verificar', fecha: '2026-10-15', inicio: '10:00', fin: '13:00' } },
    { cotNum: 2, reserva: { estado: 'esperando pago', fecha: '2026-10-16', inicio: '10:00', fin: '13:00', expira: new Date(AHORA + 60000).toISOString() } },
    { cotNum: 3, reserva: { estado: 'esperando pago', fecha: '2026-10-19', inicio: '10:00', fin: '13:00', expira: new Date(AHORA - 60000).toISOString() } },
    { cotNum: 4, reserva: { estado: 'rechazada', fecha: '2026-10-20', inicio: '10:00', fin: '13:00' } },
  ]
  const libres = disponibilidad('2026-10-14', bloquesTomados({ cotizaciones, ahora: AHORA })).slice(0, 4).map(d => d.bloques[0].libre)
  assert.deepEqual(libres, [false, false, true, true])
  // La propia reserva no se bloquea a si misma.
  assert.equal(disponibilidad('2026-10-14', bloquesTomados({ cotizaciones, excepto: 1, ahora: AHORA }))[0].bloques[0].libre, true)
})

test('el monto lo calcula el servidor y un bloque tomado se rechaza', async () => {
  const almacen = await conCotizacion()
  const { reserva } = await solicitarReserva(almacen, { cotNum: 1500, fecha: '2026-10-15', inicio: '10:00', medio: 'transferencia', opcion: 'abono' }, { ahora: AHORA })
  assert.deepEqual([reserva.monto, reserva.descuentoPct, reserva.estado, reserva.fin], [56525, 5, 'por verificar', '13:00'])
  const otra = await conCotizacion()
  await assert.rejects(solicitarReserva(otra, { cotNum: 1500, fecha: '2026-10-15', inicio: '10:00', medio: 'transferencia', opcion: 'total' },
    { tomados: [{ fecha: '2026-10-15', desde: 600, hasta: 780 }], ahora: AHORA }), /se acaba de ocupar/)
  await assert.rejects(solicitarReserva(otra, { cotNum: 1500, fecha: '2026-10-17', inicio: '10:00', medio: 'transferencia', opcion: 'total' }, { ahora: AHORA }), /Elige un día/)
  await assert.rejects(solicitarReserva(otra, { cotNum: 1500, fecha: '2026-10-15', inicio: '11:00', medio: 'transferencia', opcion: 'total' }, { ahora: AHORA }), /Elige un día/)
  await assert.rejects(solicitarReserva(otra, { cotNum: 1500, fecha: '2026-10-15', inicio: '10:00', medio: 'cheque', opcion: 'total' }, { ahora: AHORA }), /cómo vas a pagar/)
})

test('confirmar la transferencia: descuento, pago, instalacion agendada y reserva cerrada', async () => {
  const almacen = await conCotizacion()
  await solicitarReserva(almacen, { cotNum: 1500, fecha: '2026-10-15', inicio: '13:00', medio: 'transferencia', opcion: 'total' }, { ahora: AHORA })
  assert.equal(estadoCliente(await obtenerCotizacion(almacen, 1500), AHORA), 'verificando')
  const calendar = calendarFalso()
  const { cotizacion, instalacion } = await confirmarTransferencia(almacen, calendar, 'repisas@donmaxi.cl', { cotNum: 1500 }, AHORA)
  assert.equal(cotizacion.adicionales.descuento_pct, 5)
  assert.equal(Number(cotizacion.total), 113050)
  assert.deepEqual(cotizacion.pagos.map(p => [p.monto, p.medio]), [[113050, 'Transferencia']])
  assert.equal(cotizacion.status, 'confirmada')
  assert.equal(cotizacion.reserva, null)
  assert.deepEqual([instalacion.fecha, instalacion.inicio, instalacion.fin, instalacion.invitado], ['2026-10-15', '13:00', '16:00', 'marta@example.cl'])
  assert.equal(calendar.eventos[0].summary, 'Instalación - Marta Díaz')
  assert.equal(estadoCliente(cotizacion, AHORA), 'lista')
  await assert.rejects(confirmarTransferencia(almacen, calendar, 'x', { cotNum: 1500 }, AHORA), /No hay una transferencia por verificar/)
})

test('rechazar la transferencia libera el bloque y el cliente puede reintentar', async () => {
  const almacen = await conCotizacion()
  await solicitarReserva(almacen, { cotNum: 1500, fecha: '2026-10-15', inicio: '10:00', medio: 'transferencia', opcion: 'total' }, { ahora: AHORA })
  await rechazarTransferencia(almacen, { cotNum: 1500, motivo: 'No llegó' }, AHORA)
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.reserva.estado, 'rechazada')
  assert.equal(estadoCliente(q, AHORA), 'por-agendar')
  assert.equal(bloquesTomados({ cotizaciones: (await listarCotizaciones(almacen)).quotes, ahora: AHORA }).length, 0)
})

test('pagina del cliente: link, disponibilidad, aviso de transferencia con correos', async () => {
  const almacen = await conCotizacion()
  const correos = []
  const deps = { almacen, config: CONFIG, ahora: AHORA, leerEventos: async () => [instalacionEnCalendario('2026-10-15', '10:00', '13:00')], enviarCorreo: async c => correos.push(c), avisoA: 'admin@example.cl' }
  assert.equal((await atenderReservaGet({ c: '1500', t: 'malo' }, deps)).statusCode, 404)
  const get = JSON.parse((await atenderReservaGet({ c: '1500', t: T }, deps)).body)
  assert.equal(get.estado, 'por-agendar')
  assert.deepEqual(get.disponibilidad[0].bloques.map(b => b.libre), [false, true])
  assert.equal(get.pagos.transferencia.opciones[0].monto, 113050)
  assert.equal(get.pagos.mercadopago.opciones[0].monto, 119000)
  assert.equal(get.cotizacion.nombre, 'Marta')

  const tomado = await atenderReservaPost({ c: '1500', t: T, accion: 'transferencia', fecha: '2026-10-15', inicio: '10:00', opcion: 'total' }, deps).catch(e => e)
  assert.equal(tomado.estado, 409)
  const ok = await atenderReservaPost({ c: '1500', t: T, accion: 'transferencia', fecha: '2026-10-15', inicio: '13:00', opcion: 'abono' }, deps)
  assert.equal(ok.statusCode, 200)
  assert.deepEqual(correos.map(c => c.para), ['marta@example.cl', 'admin@example.cl'])
  assert.match(correos[0].texto, /Recibimos tu aviso de transferencia por \$56\.525/)
  assert.match(correos[1].asunto, /Transferencia por verificar: \$56\.525 · Marta Díaz/)
  assert.equal(JSON.parse((await atenderReservaGet({ c: '1500', t: T }, deps)).body).estado, 'verificando')
})

test('Mercado Pago: reserva el bloque, al aprobarse agenda la instalacion y confirma por correo', async () => {
  const almacen = await conCotizacion()
  const correos = [], avisos = [], preferencias = []
  const calendar = calendarFalso()
  let pagoMP
  const mp = { crearPreferencia: async body => { preferencias.push(body); return { init_point: 'https://mp.example/1' } }, obtenerPago: async () => pagoMP }
  const deps = { almacen, config: CONFIG, mp, calendar, calendarId: 'repisas@donmaxi.cl', ahora: AHORA, leerEventos: async () => [], enviarCorreo: async c => correos.push(c), alRegistrar: async r => avisos.push(r) }
  const r = JSON.parse((await atenderReservaPost({ c: '1500', t: T, accion: 'mercadopago', fecha: '2026-10-16', inicio: '10:00', opcion: 'abono' }, deps)).body)
  assert.equal(r.url, 'https://mp.example/1')
  assert.equal(preferencias[0].items[0].unit_price, 59500)
  assert.equal((await obtenerCotizacion(almacen, 1500)).reserva.estado, 'esperando pago')

  pagoMP = { id: 77, status: 'approved', transaction_amount: 59500, external_reference: '1500', metadata: {} }
  const aviso = await atenderAvisoMercadoPago({ body: { type: 'payment', data: { id: '77' } } }, deps)
  assert.equal(aviso.statusCode, 200)
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.reserva, null)
  assert.deepEqual([q.instalacion.fecha, q.instalacion.inicio, q.instalacion.fin], ['2026-10-16', '10:00', '13:00'])
  assert.equal(q.status, 'confirmada')
  assert.match(correos[0].asunto, /instalación está confirmada/)
  assert.match(correos[0].texto, /Saldo pendiente: \$59\.500/)
  assert.equal(avisos[0].instalacion.fecha, '2026-10-16')
  // Sin token, Mercado Pago no se ofrece.
  assert.equal(JSON.parse((await atenderReservaGet({ c: '1500', t: T }, { ...deps, config: { ...CONFIG, token: '' } })).body).pagos.mercadopago, null)
  assert.equal(estadoCliente(q, AHORA), 'agendada')
})

test('un pago de Mercado Pago sin reserva solo se registra', async () => {
  const almacen = await conCotizacion()
  const { instalacion } = await completarReservaMercadoPago(almacen, calendarFalso(), 'x', 1500)
  assert.equal(instalacion, null)
})
