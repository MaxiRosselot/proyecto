import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cambiosDesdeCalendario } from './sincronizar-calendario.mjs'

const m = h => Number(h.slice(0, 2)) * 60 + Number(h.slice(3))
const ev = (id, fecha, inicio, fin, extra = {}) => ({ id, tipo: 'instalacion', fecha, inicio, fin, minutoInicio: m(inicio), minutoFin: m(fin), todoElDia: false, ...extra })

test('la venta toma la fecha y horas del evento movido o alargado en Google', () => {
  const cotizaciones = [
    { cotNum: 1, instalacion: { eventId: 'a', fecha: '2026-12-01', inicio: '10:00', fin: '12:00', pagada: true } },
    { cotNum: 2, instalacion: { eventId: 'b', fecha: '2026-12-01', inicio: '12:00', fin: '14:00' } },
    { cotNum: 3, instalacion: { eventId: 'c', fecha: '2026-12-02', inicio: '10:00', fin: '12:00' } },
    { cotNum: 4, instalacion: { fecha: '2026-12-02', inicio: '14:00', fin: '16:00' } },
    { cotNum: 5 },
  ]
  const eventos = [
    ev('a', '2026-12-01', '10:00', '13:00'), // alargado
    ev('b', '2026-12-01', '12:00', '14:00'), // igual
    ev('c', '2026-12-03', '14:00', '16:00'), // movido de dia
    ev('x', '2026-12-02', '14:00', '16:00'),
  ]
  const cambios = cambiosDesdeCalendario(eventos, cotizaciones)
  assert.deepEqual(cambios.map(c => [c.cotNum, c.instalacion.fecha, c.instalacion.inicio, c.instalacion.fin]), [['1', '2026-12-01', '10:00', '13:00'], ['3', '2026-12-03', '14:00', '16:00']])
  assert.equal(cambios[0].instalacion.pagada, true) // lo demas de la instalacion se conserva
  // Todo el dia, de varios dias o que no es instalacion: no se copia.
  assert.deepEqual(cambiosDesdeCalendario([ev('a', '2026-12-01', '00:00', '00:00', { todoElDia: true })], cotizaciones), [])
  assert.deepEqual(cambiosDesdeCalendario([ev('a', '2026-12-01', '22:00', '23:00', { minutoFin: 1440 })], cotizaciones), [])
  assert.deepEqual(cambiosDesdeCalendario([ev('a', '2026-12-01', '11:00', '13:00', { tipo: 'otro' })], cotizaciones), [])
})
