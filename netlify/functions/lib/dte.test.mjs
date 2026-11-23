import test from 'node:test'
import assert from 'node:assert/strict'
import { detalleBoleta, emitido, limpiarDte } from './documentos.mjs'
import { documentosEmitidos } from './resumen-instalaciones.mjs'

test('dte: se guarda limpio, con folio, fecha y PDF https', () => {
  const d = limpiarDte({ folio: '440', fecha: '2026-11-22', monto: 261800.4, detalle: 'Repisas de madera para bodega - Carlos Bravo', via: 'e-Boleta SII', pdf: 'https://eboleta.s3.amazonaws.com/x.pdf?a=1', extra: 'no' })
  assert.deepEqual(d, { tipo: 'boleta', folio: 440, fecha: '2026-11-22', monto: 261800, detalle: 'Repisas de madera para bodega - Carlos Bravo', via: 'e-Boleta SII', pdf: 'https://eboleta.s3.amazonaws.com/x.pdf?a=1' })
  assert.equal(limpiarDte({ folio: 1, fecha: '2026-11-22', pdf: 'javascript:alert(1)' }).pdf, undefined)
  assert.throws(() => limpiarDte({ fecha: '2026-11-22' }), /folio/)
  assert.equal(limpiarDte(null), null)
})

test('dte: detalle de la boleta y lista de emitidos', () => {
  assert.equal(detalleBoleta('  Fernando   Barriuso '), 'Repisas de madera para bodega - Fernando Barriuso')
  assert.ok(detalleBoleta('x'.repeat(100)).length <= 80)
  assert.equal(emitido('M/B*'), 'M/B')
  const cot = (n, dte) => ({ cotNum: n, nombre: 'C' + n, instalacion: { documento: 'B', dte } })
  const l = documentosEmitidos([cot('1', { folio: 440, fecha: '2026-11-22' }), cot('2', null), cot('3', { folio: 441, fecha: '2026-11-22' })])
  assert.deepEqual(l.map(d => d.folio), [441, 440])
})
