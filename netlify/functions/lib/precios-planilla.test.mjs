import test from 'node:test'
import assert from 'node:assert/strict'
import { leerTablaPrecios, tablaDesdeFilas } from './precios-planilla.mjs'

const ENCABEZADO = ['Alto (cm)', 'Niveles', 'Profundidad (cm)', 'Laterales', 'Largo desde', 'Largo hasta', 'Precio']

test('lee la hoja "precios" con el orden de siempre y guarda la fila de cada precio', () => {
  const { tabla, columnaPrecio } = tablaDesdeFilas([ENCABEZADO, [200, 4, 40, 2, 0, 100, 40000], [200, 4, 40, 2, 101, 150, 52000], []])
  assert.equal(columnaPrecio, 'G')
  assert.deepEqual(tabla, [
    { alto: 200, prof: 40, desde: 0, hasta: 100, precio: 40000, row: 2 },
    { alto: 200, prof: 40, desde: 101, hasta: 150, precio: 52000, row: 3 },
  ])
})

test('encuentra las columnas aunque esten en otro orden, con un titulo arriba y precios como texto', () => {
  const filas = [['Precios repisas 2026'], [], ['Precio', 'Largo hasta', 'Largo desde', 'Fondo', 'Altura (cm)'], ['$40.000', 100, 0, 40, 200], ['', '', '', '', '']]
  const { tabla, columnaPrecio } = tablaDesdeFilas(filas)
  assert.equal(columnaPrecio, 'A')
  assert.deepEqual(tabla, [{ alto: 200, prof: 40, desde: 0, hasta: 100, precio: 40000, row: 4 }])
})

test('explica que falta si la hoja no calza', async () => {
  assert.throws(() => tablaDesdeFilas([['Alto', 'Profundidad', 'Precio'], [200, 40, 1000]]), /falta la columna: Largo desde, Largo hasta/)
  assert.throws(() => tablaDesdeFilas([['algo'], [1, 2]]), /fila de títulos/)
  const sheets = { spreadsheets: { values: { get: async () => { throw new Error('Unable to parse range: precios!A1:Z') } } } }
  await assert.rejects(leerTablaPrecios(sheets, 'id'), /No encuentro la hoja "precios"/)
})
