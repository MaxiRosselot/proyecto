import test from 'node:test'
import assert from 'node:assert/strict'
import { ENCABEZADOS, actualizarCotizacion, almacenEnMemoria, almacenSheets, cotizacionAFila, crearCotizacion, esLimiteDeGoogle, obtenerCotizacion, respuestaDeError } from './cotizaciones.mjs'
import { actualizarFila, sincronizarVarias } from './planilla.mjs'

// Google Sheets falso que cuenta las lecturas (el limite es de 60 por minuto).
function sheetsFalso(filas) {
  const datos = [ENCABEZADOS, ...filas.map(f => [...f])]
  const cuenta = { lecturas: 0, escrituras: 0 }
  const filaDe = range => Number(range.match(/A(\d+)/)?.[1])
  return {
    cuenta,
    spreadsheets: {
      values: {
        async get({ range }) {
          cuenta.lecturas++
          if (/A2:/.test(range)) return { data: { values: datos.slice(1).map(f => [...f]) } }
          return { data: { values: [datos[filaDe(range) - 1]] } }
        },
        async update({ range, requestBody }) { cuenta.escrituras++; datos[filaDe(range) - 1] = requestBody.values[0] },
        async batchUpdate({ requestBody }) { cuenta.escrituras++; for (const d of requestBody.data) datos[filaDe(d.range) - 1] = d.values[0] },
      },
    },
  }
}
const venta = (cotNum, nombre, extra = {}) => cotizacionAFila({ cotNum, nombre, status: 'confirmada', instalacion: { fecha: '2026-10-20', inicio: '10:00', fin: '12:00' }, ...extra })
const calendar = { events: { insert: async () => ({ data: { id: 'nuevo' } }), patch: async ({ eventId }) => ({ data: { id: eventId } }) } }

test('editar una fila lee la planilla 3 veces (antes eran 4)', async () => {
  const sheets = sheetsFalso([venta(1, 'Ana'), venta(2, 'Bruno')])
  await actualizarFila(almacenSheets(sheets, 'x'), null, 'cal', 2, { nota: 'Llamar antes' })
  assert.equal(sheets.cuenta.lecturas, 3) // filas, encabezado y la verificacion de lo guardado
  const sheets2 = sheetsFalso([venta(1, 'Ana'), venta(2, 'Bruno')])
  const almacen = almacenSheets(sheets2, 'x')
  await actualizarCotizacion(almacen, { cotNum: 1, notas: 'a' })
  await actualizarCotizacion(almacen, { cotNum: 2, instalacion: { fecha: '2026-10-21' } })
  assert.equal(sheets2.cuenta.lecturas, 5) // el encabezado se revisa una sola vez por llamada
})

test('pasar al calendario por bloque: una lectura y una escritura para todo el bloque', async () => {
  const filas = Array.from({ length: 6 }, (_, i) => venta(i + 1, 'Cliente ' + (i + 1)))
  const sheets = sheetsFalso(filas)
  const r = await sincronizarVarias(almacenSheets(sheets, 'x'), calendar, 'cal', { cotNums: [1, 2, 3, 4, 5, 6] }, { leerEventos: async () => [] })
  assert.deepEqual([r.hechas, r.errores], [6, []])
  assert.deepEqual(sheets.cuenta, { lecturas: 2, escrituras: 1 }) // filas y encabezado; una sola escritura
})

test('las filas sin horas se informan y no frenan el bloque', async () => {
  const almacen = almacenEnMemoria()
  await crearCotizacion(almacen, { crear: true, cotNum: 1, nombre: 'Con hora', status: 'confirmada', instalacion: { fecha: '2026-10-20', inicio: '10:00', fin: '12:00' } })
  await crearCotizacion(almacen, { crear: true, cotNum: 2, nombre: 'Sin hora', status: 'confirmada', instalacion: { fecha: '2026-10-20', inicio: '', fin: '' } })
  const r = await sincronizarVarias(almacen, calendar, 'cal', { cotNums: [1, 2] }, {})
  assert.equal(r.hechas, 1)
  assert.match(r.errores[0], /Sin hora: le falta la fecha o las horas/)
  assert.equal((await obtenerCotizacion(almacen, 1)).instalacion.eventId, 'nuevo')
})

test('el limite de Google responde 429 con un mensaje claro para reintentar', () => {
  const error = Object.assign(new Error("Quota exceeded for quota metric 'Read requests'"), { code: 429 })
  assert.ok(esLimiteDeGoogle(error))
  const r = respuestaDeError(error, {})
  assert.equal(r.statusCode, 429)
  assert.match(JSON.parse(r.body).error, /Google pidió una pausa/)
  assert.equal(JSON.parse(r.body).reintentarEn, 30)
})
