import test from 'node:test'
import assert from 'node:assert/strict'
import { ENCABEZADOS, actualizarCotizacion, almacenEnMemoria, almacenSheets, cotizacionAFila, crearCotizacion, esLimiteDeGoogle, obtenerCotizacion, respuestaDeError } from './cotizaciones.mjs'
import { actualizarFila } from './planilla.mjs'

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

test('el limite de Google responde 429 con un mensaje claro para reintentar', () => {
  const error = Object.assign(new Error("Quota exceeded for quota metric 'Read requests'"), { code: 429 })
  assert.ok(esLimiteDeGoogle(error))
  const r = respuestaDeError(error, {})
  assert.equal(r.statusCode, 429)
  assert.match(JSON.parse(r.body).error, /Google pidió una pausa/)
  assert.equal(JSON.parse(r.body).reintentarEn, 30)
})
