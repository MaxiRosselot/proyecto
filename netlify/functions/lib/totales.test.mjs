import test from 'node:test'
import assert from 'node:assert/strict'
import { nombreServicio, porcentajeDescuento, totalesCotizacion } from './totales.mjs'
import { limpiarAdicionales } from './instalaciones.mjs'

test('el descuento se aplica al neto antes del IVA', () => {
  const t = totalesCotizacion([{ unidades: 1, valor: 200000 }], { qty_retiro_orden: 1, precio_retiro_orden: 40000, descuento_pct: 10 })
  assert.deepEqual(t, { repisas: 200000, adicionales: 40000, despacho: 0, bruto: 240000, descuentoPct: 10, descuento: 24000, subtotal: 216000, iva: 41040, total: 257040 })
})

test('el despacho se suma al neto, antes del descuento y el IVA', () => {
  const t = totalesCotizacion([{ unidades: 1, valor: 100000 }], { despacho: 50000, descuento_pct: 10 })
  assert.deepEqual([t.despacho, t.bruto, t.subtotal, t.total], [50000, 150000, 135000, 160650])
})

test('el descuento queda entre 0 y 50%', () => {
  assert.equal(porcentajeDescuento({ descuento_pct: 80 }), 50)
  assert.equal(porcentajeDescuento({ descuento_pct: -5 }), 0)
  assert.equal(porcentajeDescuento({}), 0)
})

test('el nombre editado de un servicio reemplaza al de lista', () => {
  assert.equal(nombreServicio({}, 'cajas'), 'Cajas organizadoras')
  assert.equal(nombreServicio({ nombre_cajas: '  Cajas 60 L con tapa ' }, 'cajas'), 'Cajas 60 L con tapa')
  assert.equal(nombreServicio({ nombre_cajas: '   ' }, 'cajas'), 'Cajas organizadoras')
})

test('al agendar se conservan los nombres editados y el descuento', () => {
  const limpio = limpiarAdicionales({ qty_cajas: 2, precio_cajas: 15000, nombre_cajas: 'Cajas grandes', descuento_pct: 10, otra_cosa: 'x' })
  assert.equal(limpio.nombre_cajas, 'Cajas grandes')
  assert.equal(limpio.descuento_pct, 10)
  assert.equal(limpio.otra_cosa, undefined)
  assert.throws(() => limpiarAdicionales({ descuento_pct: 60 }), /entre 0 y 50/)
})
