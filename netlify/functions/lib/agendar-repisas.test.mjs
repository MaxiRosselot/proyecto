import test from 'node:test'
import assert from 'node:assert/strict'
import pdf from 'pdf-parse/lib/pdf-parse.js'
import { almacenEnMemoria, crearCotizacion, obtenerCotizacion } from './cotizaciones.mjs'
import { agendarInstalacion, limpiarRepisas } from './instalaciones.mjs'
import { generateQuotePdf } from './quote-pdf.mjs'

const calendar = { events: { insert: async () => ({ data: { id: 'ev1' } }), patch: async () => ({ data: { id: 'ev1' } }) } }
const REPISAS = [
  { largo: 2.43, prof: .48, alto: 2, niveles: 4, unidades: 1, valor: 110000 },
  { largo: 1.57, prof: .48, alto: 2, niveles: 4, unidades: 2, valor: 90000 },
]
async function cotizacion() {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, { crear: true, nombre: 'Ana Pérez', subtotal: 290000, iva: 55100, total: 345100, repisas: REPISAS, adicionales: {} })
  return almacen
}
const agenda = { cotNum: 1421, fecha: '2026-10-20', inicio: '10:00', fin: '13:00', adicionales: {} }

test('al agendar se ajusta cantidad y precio de cada repisa; la que queda en 0 no se cobra', async () => {
  const almacen = await cotizacion()
  const r = await agendarInstalacion(almacen, calendar, 'x', { ...agenda, repisas: [{ unidades: 1, valor: 100000 }, { unidades: 0, valor: 90000 }] })
  assert.equal(r.totales.subtotal, 100000)
  const q = await obtenerCotizacion(almacen, 1421)
  assert.deepEqual(q.repisas.map(x => [x.largo, x.unidades, x.valor]), [[2.43, 1, 100000], [1.57, 0, 90000]])
  assert.equal(Number(q.total), 119000)
})

test('sin repisas editadas se usan las de la cotizacion', async () => {
  const almacen = await cotizacion()
  const r = await agendarInstalacion(almacen, calendar, 'x', agenda)
  assert.equal(r.totales.subtotal, 290000)
})

test('no se puede agendar una venta en $0 ni con datos raros', async () => {
  await assert.rejects(agendarInstalacion(await cotizacion(), calendar, 'x', { ...agenda, repisas: [{ unidades: 0, valor: 1 }, { unidades: 0, valor: 1 }] }), /quedó en \$0/)
  assert.throws(() => limpiarRepisas(REPISAS, [{ unidades: 1, valor: 1 }]), /recarga la cotización/)
  assert.throws(() => limpiarRepisas(REPISAS, [{ unidades: 1.5, valor: 1 }, { unidades: 1, valor: 1 }]), /cantidad de las repisas/)
  assert.throws(() => limpiarRepisas(REPISAS, [{ unidades: 1, valor: -5 }, { unidades: 1, valor: 1 }]), /precio de las repisas/)
})

test('el PDF no muestra la repisa que quedo en 0', async () => {
  const r = await generateQuotePdf({ repisas: [{ ...REPISAS[0] }, { ...REPISAS[1], unidades: 0 }] })
  assert.equal(r.subtotal, 110000)
  const { text } = await pdf(r.bytes)
  assert.ok(text.includes('2.43 m'))
  assert.ok(!text.includes('1.57 m'))
})
