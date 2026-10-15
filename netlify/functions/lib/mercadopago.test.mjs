import test from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { avisoAutentico, configPago, firmaPago, firmaValida, linkPagoCotizacion, opcionesDePago, preferenciaPago, registrarPagoMercadoPago } from './mercadopago.mjs'
import { atenderAvisoMercadoPago, atenderPagar } from './pagina-pago.mjs'
import { anotarBoleta } from './pagos.mjs'
import { MARCA } from './marca.mjs'

const CONFIG = { token: 'tok', secreto: 'secreto-de-prueba', base: 'https://donmaxi.example' }
const CREADA = new Date('2026-10-14T15:00:00Z')
const HORA = 3600000

async function conCotizacion(extra = {}) {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, {
    crear: true, cotNum: 1500, nombre: 'Marta Díaz', email: 'marta@example.cl', telefono: '9 7777 8888',
    repisas: [{ unidades: 1, valor: 100000 }], adicionales: {}, subtotal: 100000, iva: 19000, total: 119000, ...extra,
  }, CREADA)
  return almacen
}
const mpFalso = pago => {
  const preferencias = []
  return { preferencias, crearPreferencia: async body => { preferencias.push(body); return { init_point: 'https://mp.example/checkout/1' } }, obtenerPago: async () => pago }
}

test('sin token de Mercado Pago se usa el link fijo de siempre', () => {
  assert.equal(configPago({}), null)
  assert.equal(linkPagoCotizacion(1500, null), MARCA.linkPago)
  assert.equal(configPago({ MP_ACCESS_TOKEN: 't', ADMIN_SESSION_SECRET: 's', URL: 'https://x.netlify.app/' }).base, 'https://x.netlify.app')
})

test('el link de pago va firmado y no sirve para otra cotizacion', () => {
  const link = new URL(linkPagoCotizacion(1500, CONFIG))
  assert.equal(link.origin + link.pathname, 'https://donmaxi.example/pagar')
  assert.ok(firmaValida('1500', link.searchParams.get('t'), CONFIG.secreto))
  assert.ok(!firmaValida('1501', link.searchParams.get('t'), CONFIG.secreto))
  assert.ok(!firmaValida('1500', 'x', CONFIG.secreto))
})

test('dentro de 48 horas el total y el abono llevan el 10% de la oferta; despues no', async () => {
  const q = await obtenerCotizacion(await conCotizacion(), 1500)
  const dentro = opcionesDePago(q, CREADA.getTime() + 2 * HORA)
  assert.equal(dentro.oferta, true)
  assert.deepEqual(dentro.opciones.map(o => [o.id, o.monto]), [['total', 107100], ['abono', 53550]])
  const fuera = opcionesDePago(q, CREADA.getTime() + 49 * HORA)
  assert.equal(fuera.oferta, false)
  assert.deepEqual(fuera.opciones.map(o => [o.id, o.monto]), [['total', 119000], ['abono', 59500]])
})

test('con un abono ya pagado solo queda pagar el saldo', async () => {
  const q = await obtenerCotizacion(await conCotizacion({ pagos: [{ id: 'p1', monto: 59500, fecha: '2026-10-14', medio: 'Transferencia' }] }), 1500)
  assert.deepEqual(opcionesDePago(q, CREADA.getTime()).opciones, [{ id: 'saldo', nombre: 'Pagar el saldo', monto: 59500 }])
})

test('la preferencia lleva la referencia, el aviso y la vuelta a /pagar', async () => {
  const q = await obtenerCotizacion(await conCotizacion(), 1500)
  const p = preferenciaPago(q, { id: 'abono', nombre: 'Abonar el 50%', monto: 53550 }, { base: CONFIG.base, firma: 'f', oferta: true })
  assert.equal(p.external_reference, '1500')
  assert.equal(p.items[0].unit_price, 53550)
  assert.equal(p.items[0].currency_id, 'CLP')
  assert.equal(p.notification_url, 'https://donmaxi.example/.netlify/functions/mp-webhook')
  assert.deepEqual(p.metadata, { cot_num: '1500', opcion: 'abono', oferta: true })
  assert.match(p.back_urls.success, /\/pagar\?c=1500&t=f&estado=ok$/)
})

test('un pago aprobado se registra una sola vez, confirma la cotizacion y aplica la oferta', async () => {
  const almacen = await conCotizacion()
  const pago = { id: 987, status: 'approved', transaction_amount: 53550, external_reference: '1500', metadata: { oferta: true }, date_approved: '2026-10-14T18:00:00.000-03:00' }
  const r = await registrarPagoMercadoPago(almacen, pago)
  assert.equal(r.registrado, true)
  assert.equal(r.oferta, true)
  const q = await obtenerCotizacion(almacen, 1500)
  assert.equal(q.status, 'confirmada')
  assert.equal(q.adicionales.descuento_pct, 10)
  assert.equal(Number(q.total), 107100)
  assert.deepEqual(q.pagos.map(p => [p.monto, p.medio, p.fecha, p.mpId]), [[53550, 'Mercado Pago', '2026-10-14', '987']])
  assert.equal((await registrarPagoMercadoPago(almacen, pago)).registrado, false)
  assert.equal((await obtenerCotizacion(almacen, 1500)).pagos.length, 1)
  assert.equal((await registrarPagoMercadoPago(almacen, { ...pago, id: 988, status: 'pending' })).registrado, false)
})

test('/pagar: link malo, opciones, ida a Mercado Pago y cotizacion pagada', async () => {
  const almacen = await conCotizacion()
  const t = firmaPago('1500', CONFIG.secreto)
  const mp = mpFalso()
  const ahora = CREADA.getTime() + HORA
  assert.equal((await atenderPagar({ c: '1500', t: 'malo' }, { almacen, mp, config: CONFIG, ahora })).statusCode, 404)
  assert.equal((await atenderPagar({ c: '1500', t }, { almacen, mp, config: null })).headers.Location, MARCA.linkPago)

  const pagina = await atenderPagar({ c: '1500', t }, { almacen, mp, config: CONFIG, ahora })
  assert.equal(pagina.statusCode, 200)
  assert.match(pagina.body, /Pagar el total/)
  assert.match(pagina.body, /\$107\.100/)
  assert.match(pagina.body, /Abonar el 50%/)

  const ida = await atenderPagar({ c: '1500', t, opcion: 'abono' }, { almacen, mp, config: CONFIG, ahora })
  assert.equal(ida.statusCode, 302)
  assert.equal(ida.headers.Location, 'https://mp.example/checkout/1')
  assert.equal(mp.preferencias[0].items[0].unit_price, 53550)

  await registrarPagoMercadoPago(almacen, { id: 1, status: 'approved', transaction_amount: 107100, external_reference: '1500', metadata: { oferta: true } })
  assert.match((await atenderPagar({ c: '1500', t }, { almacen, mp, config: CONFIG, ahora })).body, /Cotización pagada/)
})

test('el aviso de Mercado Pago: firma, tipo y pago que no es de una cotizacion', async () => {
  const almacen = await conCotizacion()
  const pago = { id: 55, status: 'approved', transaction_amount: 119000, external_reference: '1500', metadata: {} }
  const avisos = []
  const deps = { almacen, mp: mpFalso(pago), secretoAviso: 'sec', alRegistrar: async r => avisos.push(r) }
  const ts = '1700000000'
  const v1 = createHmac('sha256', 'sec').update(`id:55;request-id:req-1;ts:${ts};`).digest('hex')
  assert.ok(avisoAutentico({ firma: `ts=${ts},v1=${v1}`, requestId: 'req-1', dataId: '55' }, 'sec'))

  assert.equal((await atenderAvisoMercadoPago({ body: { type: 'payment', data: { id: '55' } }, headers: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'req-1' } }, deps)).statusCode, 401)
  assert.equal((await atenderAvisoMercadoPago({ body: { type: 'merchant_order', data: { id: '1' } } }, deps)).statusCode, 200)
  const ok = await atenderAvisoMercadoPago({ body: { type: 'payment', data: { id: '55' } }, headers: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': 'req-1' } }, deps)
  assert.equal(ok.statusCode, 200)
  assert.equal(avisos.length, 1)
  assert.equal(avisos[0].resumen.saldo, 0)

  const ajeno = await atenderAvisoMercadoPago({ body: { type: 'payment', data: { id: '9' } } }, { ...deps, secretoAviso: '', mp: mpFalso({ ...pago, id: 9, external_reference: '777' }) })
  assert.equal(ajeno.statusCode, 200)
  assert.match(JSON.parse(ajeno.body).ignorado, /no corresponde/)
})

test('se anota y se quita el N° de boleta de un pago', async () => {
  const almacen = await conCotizacion({ pagos: [{ id: 'p1', monto: 59500, fecha: '2026-10-14', medio: 'Transferencia' }] })
  assert.equal((await anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: ' 4521 ' })).pagos[0].boleta, '4521')
  assert.equal((await anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: '' })).pagos[0].boleta, undefined)
  await assert.rejects(anotarBoleta(almacen, { cotNum: 1500, id: 'p1', boleta: '45 21; drop' }), /números y letras/)
  await assert.rejects(anotarBoleta(almacen, { cotNum: 1500, id: 'nope', boleta: '1' }), /Pago no encontrado/)
})
