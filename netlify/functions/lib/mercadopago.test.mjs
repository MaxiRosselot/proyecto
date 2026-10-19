import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { avisoAutentico, configPago, firmaValida, linkPagoCotizacion, opcionesDePago, preferenciaPago, registrarPagoMercadoPago } from './mercadopago.mjs'
import { anotarBoleta } from './pagos.mjs'
import { MARCA } from './marca.mjs'

const CONFIG = { token: 'tok', secreto: 'secreto-de-prueba', base: 'https://donmaxi.example', reserva: true }

async function conCotizacion(extra = {}) {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, {
    crear: true, cotNum: 1500, nombre: 'Marta Díaz', email: 'marta@example.cl', telefono: '9 7777 8888',
    repisas: [{ unidades: 1, valor: 100000 }], adicionales: {}, subtotal: 100000, iva: 19000, total: 119000, ...extra,
  }, new Date('2026-10-14T15:00:00Z'))
  return almacen
}

test('sin sitio configurado se usa el link fijo; sin token igual hay link de reserva', () => {
  assert.equal(configPago({}), null)
  assert.equal(linkPagoCotizacion(1500, null), MARCA.linkPago)
  const sinToken = configPago({ ADMIN_SESSION_SECRET: 's', URL: 'https://x.netlify.app/', RESERVA_ACTIVA: '1' })
  assert.deepEqual(sinToken, { token: '', secreto: 's', base: 'https://x.netlify.app', reserva: true })
  assert.match(linkPagoCotizacion(7, sinToken), /^https:\/\/x\.netlify\.app\/reserva\?c=7&t=/)
})

test('mientras la reserva no este activa, la cotizacion lleva el link fijo de Mercado Pago', () => {
  const config = configPago({ ADMIN_SESSION_SECRET: 's', URL: 'https://x.netlify.app/', MP_ACCESS_TOKEN: 't' })
  assert.equal(config.reserva, false)
  assert.equal(linkPagoCotizacion(7, config), 'https://link.mercadopago.cl/repisasdonmaxi')
})

test('el link va firmado y no sirve para otra cotizacion', () => {
  const link = new URL(linkPagoCotizacion(1500, CONFIG))
  assert.equal(link.origin + link.pathname, 'https://donmaxi.example/reserva')
  assert.ok(firmaValida('1500', link.searchParams.get('t'), CONFIG.secreto))
  assert.ok(!firmaValida('1501', link.searchParams.get('t'), CONFIG.secreto))
  assert.ok(!firmaValida('1500', 'x', CONFIG.secreto))
})

test('la transferencia lleva el 10% de descuento; Mercado Pago no', async () => {
  const q = await obtenerCotizacion(await conCotizacion(), 1500)
  const transferencia = opcionesDePago(q, 'transferencia')
  assert.equal(transferencia.descuento, 10)
  assert.deepEqual(transferencia.opciones.map(o => [o.id, o.monto]), [['total', 107100], ['abono', 53550]])
  const mp = opcionesDePago(q, 'mercadopago')
  assert.equal(mp.descuento, 0)
  assert.deepEqual(mp.opciones.map(o => [o.id, o.monto]), [['total', 119000], ['abono', 59500]])
})

test('con un abono ya pagado solo queda el saldo, sin descuento', async () => {
  const q = await obtenerCotizacion(await conCotizacion({ pagos: [{ id: 'p1', monto: 59500, fecha: '2026-10-14', medio: 'Transferencia' }] }), 1500)
  assert.deepEqual(opcionesDePago(q, 'transferencia').opciones, [{ id: 'saldo', nombre: 'Pagar el saldo', monto: 59500 }])
})

test('si ya tiene otro descuento, la transferencia no suma otro', async () => {
  const q = await obtenerCotizacion(await conCotizacion({ adicionales: { descuento_pct: 5 }, subtotal: 95000, iva: 18050, total: 113050 }), 1500)
  assert.equal(opcionesDePago(q, 'transferencia').descuento, 0)
  assert.equal(opcionesDePago(q, 'transferencia').opciones[0].monto, 113050)
})

test('la preferencia lleva la referencia, el aviso y la vuelta a /reserva', async () => {
  const q = await obtenerCotizacion(await conCotizacion(), 1500)
  const p = preferenciaPago(q, { id: 'abono', nombre: 'Abonar el 50%', monto: 59500 }, { base: CONFIG.base, firma: 'f' })
  assert.equal(p.external_reference, '1500')
  assert.equal(p.items[0].unit_price, 59500)
  assert.equal(p.items[0].currency_id, 'CLP')
  assert.equal(p.notification_url, 'https://donmaxi.example/.netlify/functions/mp-webhook')
  assert.deepEqual(p.metadata, { cot_num: '1500', opcion: 'abono' })
  assert.match(p.back_urls.success, /\/reserva\?c=1500&t=f&estado=ok$/)
})

test('un pago aprobado se registra una sola vez y confirma la cotizacion', async () => {
  const almacen = await conCotizacion()
  const pago = { id: 987, status: 'approved', transaction_amount: 59500, external_reference: '1500', metadata: {}, date_approved: '2026-10-14T18:00:00.000-03:00' }
  const r = await registrarPagoMercadoPago(almacen, pago)
  assert.equal(r.registrado, true)
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.status, 'confirmada')
  assert.deepEqual(q.pagos.map(p => [p.monto, p.medio, p.fecha, p.mpId]), [[59500, 'Mercado Pago', '2026-10-14', '987']])
  assert.equal((await registrarPagoMercadoPago(almacen, pago)).registrado, false)
  assert.equal((await obtenerCotizacion(almacen, 1500)).pagos.length, 1)
  assert.equal((await registrarPagoMercadoPago(almacen, { ...pago, id: 988, status: 'pending' })).registrado, false)
})

test('firma del aviso de Mercado Pago', () => {
  const ts = '1700000000'
  const v1 = createHmac('sha256', 'sec').update(`id:55;request-id:req-1;ts:${ts};`).digest('hex')
  assert.ok(avisoAutentico({ firma: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '55' }, 'sec'))
  assert.ok(!avisoAutentico({ firma: 'ts=1,v1=abc', requestId: 'req-1', dataId: '55' }, 'sec'))
  assert.ok(avisoAutentico({}, ''))
})

test('se anota y se quita el N° de boleta de un pago', async () => {
  const almacen = await conCotizacion({ pagos: [{ id: 'p1', monto: 59500, fecha: '2026-10-14', medio: 'Transferencia' }] })
  assert.equal((await anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: ' 4521 ' })).pagos[0].boleta, '4521')
  assert.equal((await anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: '' })).pagos[0].boleta, undefined)
  await assert.rejects(anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: '45 21; drop' }), /números y letras/)
  await assert.rejects(anotarBoleta(almacen, { cotNum: 1500, id: 'nope', boleta: '1' }), /Pago no encontrado/)
})
