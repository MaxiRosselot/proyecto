import test from 'node:test'
import assert from 'node:assert/strict'
import { juntarEnUnaVenta } from './juntar-venta.mjs'

const q = (cotNum, extra = {}) => ({ cotNum, nombre: 'Ana Díaz', telefono: '9 1234 5678', status: 'por confirmar', repisas: [{ largo: 1.2, prof: .45, alto: 2, niveles: 5, unidades: 1, valor: 100000 }], adicionales: {}, ...extra })

test('juntar en una venta: suma repisas, servicios, despacho y pagos', () => {
  const r = juntarEnUnaVenta([
    q('1635', { adicionales: { qty_retiro_orden: 1, despacho: 10000 }, pagos: [{ id: 'a', monto: 50000, medio: 'Transferencia' }] }),
    q('1636', { adicionales: { qty_retiro_orden: 1, qty_bici: 2, recargo_pct: 5 } }),
  ], { direccion: 'Calle 1' })
  assert.deepEqual(r.venta.repisas.map(x => x.label), ['Bodega 1 · Repisa', 'Bodega 2 · Repisa'])
  assert.deepEqual(r.venta.adicionales, { qty_retiro_orden: 2, precio_retiro_orden: 40000, qty_bici: 2, precio_bici: 20000, despacho: 10000 })
  // 200.000 repisas + 80.000 retiro + 40.000 bicis + 10.000 despacho = 330.000 neto; el recargo no se copia.
  assert.equal(r.venta.subtotal, 330000)
  assert.equal(r.venta.total, Math.round(330000 * 1.19))
  assert.equal(r.totalSeparadas, r.venta.total)
  assert.equal(r.venta.direccion, 'Calle 1')
  assert.equal(r.venta.telefono, '9 1234 5678')
  assert.equal(r.venta.status, 'por confirmar')
  assert.deepEqual(r.venta.pagos, [{ id: 'a', monto: 50000, medio: 'Transferencia', nota: 'de la N° 1635' }])
  assert.match(r.venta.notas, /N° 1635, N° 1636/)
  assert.equal(r.motivo('1700'), 'Juntada en la N° 1700 (N° 1635 + N° 1636)')
})

test('juntar en una venta: avisa lo que no se puede juntar solo', () => {
  assert.throws(() => juntarEnUnaVenta([q('1')]), /al menos 2/)
  assert.throws(() => juntarEnUnaVenta([q('1'), q('2', { instalacion: { fecha: '2026-12-01' } })]), /ya tiene instalación/)
  assert.throws(() => juntarEnUnaVenta([q('1'), q('2', { status: 'confirmada' })]), /no está por confirmar/)
  assert.throws(() => juntarEnUnaVenta([q('1', { adicionales: { descuento_pct: 5 } }), q('2')]), /descuentos distintos/)
  assert.throws(() => juntarEnUnaVenta([q('1', { adicionales: { qty_cajas: 1, precio_cajas: 15000 } }), q('2', { adicionales: { qty_cajas: 1, precio_cajas: 12001 } })]), /no cuadran/)
  // Precios distintos que si cuadran en promedio: 1 × 14.000 + 1 × 16.000 = 2 × 15.000.
  const r = juntarEnUnaVenta([q('1', { adicionales: { qty_cajas: 1, precio_cajas: 14000, descuento_pct: 10 } }), q('2', { adicionales: { qty_cajas: 1, precio_cajas: 16000, descuento_pct: 10 } })])
  assert.deepEqual([r.venta.adicionales.qty_cajas, r.venta.adicionales.precio_cajas, r.venta.adicionales.descuento_pct], [2, 15000, 10])
})
