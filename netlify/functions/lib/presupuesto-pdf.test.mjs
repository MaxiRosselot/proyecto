import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_BODEGAS, generarPresupuestoPdf, prepararBodega } from './presupuesto-pdf.mjs'

const fila = (largo, valor, extra = {}) => ({ largo, prof: 0.48, alto: 2, niveles: 4, unidades: 1, valor, kind: 'shelf', ...extra })

test('presupuesto conjunto: cada bodega con los totales de su cotizacion y la suma en la portada', async () => {
  const bodegas = [
    { cotNum: 1635, repisas: [fila(2.43, 140000, { lateralesExtra: 1 }), fila(1.49, 90000), fila(0.99, 80000)], adicionales: {} },
    { cotNum: 1636, repisas: [fila(1.88, 100000)], adicionales: { qty_retiro_orden: 1, precio_retiro_orden: 40000 } },
    { cotNum: 1637, repisas: [fila(1.3, 90000)], adicionales: { recargo_pct: 5 } },
  ]
  const b = prepararBodega(bodegas[1], 1)
  assert.equal(b.titulo, 'Bodega 2')
  assert.deepEqual(b.servicios, [{ nombre: 'Retiro y orden de artículos', qty: 1, precio: 40000 }])
  assert.equal(b.subtotal, 140000)
  const r = await generarPresupuestoPdf({ cliente: { nombre: 'Ana Díaz', telefono: '+56 9 1' }, bodegas }, { now: new Date('2026-11-18T12:00:00Z') })
  assert.equal(r.neto, 310000 + 140000 + 94500)
  assert.equal(r.total, r.neto + r.iva)
  assert.equal(r.paginas, 1 + 3 + 3)
  assert.equal(r.numero, '1635 – 1637')
  assert.equal(r.bytes.subarray(0, 5).toString(), '%PDF-')
})

test('presupuesto conjunto: minimo 2 y maximo de bodegas; repisas obligatorias', async () => {
  const una = { cotNum: 1, repisas: [fila(1, 50000)] }
  await assert.rejects(generarPresupuestoPdf({ bodegas: [una] }), /al menos 2/)
  await assert.rejects(generarPresupuestoPdf({ bodegas: Array(MAX_BODEGAS + 1).fill(una) }), /Máximo/)
  await assert.rejects(generarPresupuestoPdf({ bodegas: [una, { cotNum: 2, repisas: [] }] }), /no tiene repisas/)
})
