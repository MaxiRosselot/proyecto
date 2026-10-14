import test from 'node:test'
import assert from 'node:assert/strict'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion, actualizarCotizacion } from './cotizaciones.mjs'
import { borrarPago, registrarPago, resumenPagos } from './pagos.mjs'

async function cotizacion() {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, { crear: true, nombre: 'Ana', total: 238000, subtotal: 200000, iva: 38000, repisas: [], adicionales: {} })
  return almacen
}
const ahora = new Date('2026-10-14T15:00:00Z')

test('abono, saldo y pago completo', async () => {
  const almacen = await cotizacion()
  const abono = await registrarPago(almacen, { cotNum: 1421, monto: 119000, medio: 'Transferencia', fecha: '2026-10-14' }, ahora)
  assert.deepEqual(abono.resumen, { total: 238000, pagado: 119000, saldo: 119000, estado: 'abono', porcentaje: 50 })
  const saldo = await registrarPago(almacen, { cotNum: 1421, monto: 119000, medio: 'Efectivo', fecha: '2026-10-17', nota: 'al instalar' }, new Date('2026-10-17T18:00:00Z'))
  assert.equal(saldo.resumen.estado, 'pagada')
  const guardada = await obtenerCotizacion(almacen, 1421)
  assert.deepEqual(guardada.pagos.map(p => [p.monto, p.medio, p.nota]), [[119000, 'Transferencia', ''], [119000, 'Efectivo', 'al instalar']])
})

test('no deja pagar mas que el saldo ni montos o medios invalidos', async () => {
  const almacen = await cotizacion()
  await assert.rejects(registrarPago(almacen, { cotNum: 1421, monto: 300000, medio: 'Efectivo', fecha: '2026-10-14' }), /supera el saldo/)
  await assert.rejects(registrarPago(almacen, { cotNum: 1421, monto: 0, medio: 'Efectivo', fecha: '2026-10-14' }), /mayor que 0/)
  await assert.rejects(registrarPago(almacen, { cotNum: 1421, monto: 1000, medio: 'Cheque', fecha: '2026-10-14' }), /medio de pago/)
  await assert.rejects(registrarPago(almacen, { cotNum: 1421, monto: 1000, medio: 'Efectivo', fecha: '' }), /fecha/)
  await assert.rejects(registrarPago(almacen, { cotNum: 9, monto: 1000, medio: 'Efectivo', fecha: '2026-10-14' }), { estado: 404 })
})

test('borrar un pago y conservar los pagos al editar la cotizacion', async () => {
  const almacen = await cotizacion()
  const { pagos } = await registrarPago(almacen, { cotNum: 1421, monto: 50000, medio: 'Mercado Pago', fecha: '2026-10-14' }, ahora)
  await actualizarCotizacion(almacen, { cotNum: 1421, status: 'confirmada' })
  assert.equal((await obtenerCotizacion(almacen, 1421)).pagos.length, 1)
  const r = await borrarPago(almacen, { cotNum: 1421, id: pagos[0].id })
  assert.equal(r.resumen.estado, 'sin pago')
  await assert.rejects(borrarPago(almacen, { cotNum: 1421, id: 'nada' }), { estado: 404 })
})

test('resumen sin total ni pagos', () => {
  assert.deepEqual(resumenPagos(0, []), { total: 0, pagado: 0, saldo: 0, estado: 'sin pago', porcentaje: 0 })
})
