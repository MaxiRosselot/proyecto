import test from 'node:test'
import assert from 'node:assert/strict'
import { materialesDeVenta, textoMateriales, ventasPorInstalar } from './materiales.js'

const venta = (cotNum, nombre, fecha, repisas, extra = {}) => ({ cotNum, nombre, status: 'confirmada', instalacion: { fecha, inicio: '10:00', ...extra }, repisas })
const repisa = (largo, prof, alto, niveles, unidades = 1) => ({ largo, prof, alto, niveles, unidades, valor: 1 })

test('cubiertas por nivel (largo × fondo util) y laterales con el central sobre 110 cm', () => {
  const m = materialesDeVenta(venta(1, 'Ana', '2026-10-21', [repisa(2.43, 0.48, 2, 4), repisa(0.96, 0.68, 3, 6, 2)]))
  assert.deepEqual([...m.tableros], [['243|40', 4], ['96|60', 12]])
  assert.deepEqual([...m.laterales], [['200|48', 3], ['300|68', 4]])
  assert.equal(m.sinMedidas, false)
})

test('los racks van aparte y sin medidas se avisa', () => {
  const m = materialesDeVenta(venta(2, 'Bruno', '2026-10-21', [{ kind: 'rack', label: 'Rack 2x3', unidades: 1 }, { descripcion: 'del Excel', unidades: 1 }]))
  assert.deepEqual([...m.racks], [['Rack 2x3', 1]])
  assert.equal(m.sinMedidas, true)
  assert.equal(materialesDeVenta({ repisas: [] }).sinMedidas, true)
})

test('solo las que vienen, sin instalar ni canceladas, en orden', () => {
  const quotes = [
    venta(1, 'Ana', '2026-10-22', []), venta(2, 'Bruno', '2026-10-21', []), venta(3, 'Carla', '2026-10-19', []),
    venta(4, 'Dani', '2026-10-23', [], { instalada: true }), { ...venta(5, 'Eva', '2026-10-24', []), status: 'rechazada' },
    venta(6, 'Fede', '2026-11-30', []),
  ]
  assert.deepEqual(ventasPorInstalar(quotes, '2026-10-20').map(q => q.nombre), ['Bruno', 'Ana', 'Fede'])
  assert.deepEqual(ventasPorInstalar(quotes, '2026-10-20', '2026-10-27').map(q => q.nombre), ['Bruno', 'Ana'])
})

test('el texto va por dia y al final el total', () => {
  const texto = textoMateriales([
    venta(1, 'Ana', '2026-10-21', [repisa(2.43, 0.48, 2, 4)]),
    venta(2, 'Bruno', '2026-10-21', [repisa(2.43, 0.48, 2, 4)]),
    venta(3, 'Carla', '2026-10-23', [repisa(1, 0.38, 2.5, 5), { descripcion: 'x' }]),
  ])
  assert.match(texto, /^🪵 \*Materiales para las próximas instalaciones\*/)
  assert.match(texto, /📅 \*Miércoles 21 de octubre\* · Ana, Bruno\nTerciado \(cubiertas · largo × fondo\): 7,8 m²\n• 8 × 243 × 40 cm\nLaterales \(alto × profundidad\):\n• 6 × 200 × 48 cm/)
  assert.match(texto, /📅 \*Viernes 23 de octubre\* · Carla\n.*\n• 5 × 100 × 30 cm\nLaterales.*\n• 2 × 250 × 38 cm\n⚠️ Sin medidas \(revisar a mano\): Carla/)
  assert.match(texto, /———\n🧮 \*Total\* \(3 instalaciones\)\nTerciado .*\n• 8 × 243 × 40 cm\n• 5 × 100 × 30 cm\nLaterales.*\n• 2 × 250 × 38 cm\n• 6 × 200 × 48 cm/)
  assert.equal(textoMateriales([]), 'No hay instalaciones por hacer en ese período.')
})
