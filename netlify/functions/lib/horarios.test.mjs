import test from 'node:test'
import assert from 'node:assert/strict'
import {
  HORARIO_POR_DEFECTO, diasDisponibles, filasAHorario, guardarHorario, horaLocalAUTC, horaPermitida,
  horarioAFilas, horasDeRangos, leerHorario, rangosDelDia, validarHorario,
} from './horarios.mjs'

// Miercoles 7 de octubre de 2026, 12:00 en Santiago (UTC-3 en primavera).
const AHORA = new Date('2026-10-07T15:00:00Z')
const HOY = '2026-10-07'
const config = (c = {}) => validarHorario({ semanal: {}, fechas: {}, semanas: 4, ...c }, HOY)

test('el horario por defecto es el que estaba fijo: domingos, 4 semanas', () => {
  const dias = diasDisponibles(validarHorario(HORARIO_POR_DEFECTO, HOY), AHORA)
  assert.deepEqual(dias.map(d => d.fecha), ['2026-10-11', '2026-10-18', '2026-10-25', '2026-11-01'])
  assert.equal(dias[0].horas[0], '08:00')
  assert.equal(dias[0].horas.at(-1), '19:30')
})

test('un rango 10-14 ofrece visitas cada media hora que terminan antes del cierre', () => {
  assert.deepEqual(horasDeRangos([{ desde: '10:00', hasta: '14:00' }]),
    ['10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30'])
  assert.deepEqual(horasDeRangos([{ desde: '09:00', hasta: '10:00' }, { desde: '15:00', hasta: '16:00' }]),
    ['09:00', '09:30', '15:00', '15:30'])
})

test('una fecha especial abre un sabado, cambia un domingo o cierra un dia', () => {
  const c = config({
    semanal: { 0: [{ desde: '10:00', hasta: '14:00' }] },
    fechas: {
      '2026-10-10': [{ desde: '09:00', hasta: '11:00' }], // sabado abierto
      '2026-10-18': [{ desde: '15:00', hasta: '17:00' }], // domingo con otro horario
      '2026-10-25': [],                                   // domingo cerrado
    },
  })
  const dias = Object.fromEntries(diasDisponibles(c, AHORA).map(d => [d.fecha, d.horas]))
  assert.deepEqual(Object.keys(dias), ['2026-10-10', '2026-10-11', '2026-10-18', '2026-11-01'])
  assert.deepEqual(dias['2026-10-10'], ['09:00', '09:30', '10:00', '10:30'])
  assert.equal(dias['2026-10-18'][0], '15:00')
  assert.deepEqual(rangosDelDia(c, '2026-10-25'), [])
})

test('solo se puede agendar lo habilitado, en el futuro y dentro de las semanas visibles', () => {
  const c = config({ semanal: { 0: [{ desde: '10:00', hasta: '14:00' }], 3: [{ desde: '10:00', hasta: '16:00' }] }, semanas: 2 })
  assert.equal(horaPermitida(c, '2026-10-11', '10:00', AHORA), true)
  assert.equal(horaPermitida(c, '2026-10-11', '14:00', AHORA), false) // fuera del rango
  assert.equal(horaPermitida(c, '2026-10-11', '10:15', AHORA), false) // no parte en el paso
  assert.equal(horaPermitida(c, '2026-10-10', '10:00', AHORA), false) // sabado cerrado
  assert.equal(horaPermitida(c, '2026-10-25', '10:00', AHORA), false) // mas alla de 2 semanas
  // Hoy (miercoles, 12:00): solo desde las 13:00, con una hora de margen.
  assert.equal(horaPermitida(c, HOY, '12:30', AHORA), false)
  assert.equal(horaPermitida(c, HOY, '13:00', AHORA), true)
  assert.equal(horaPermitida(c, 'cualquier-cosa', '10:00', AHORA), false)
})

test('rechaza horarios mal armados con un mensaje claro', () => {
  const malo = semanal => () => config({ semanal })
  assert.throws(malo({ 0: [{ desde: '14:00', hasta: '10:00' }] }), /después/)
  assert.throws(malo({ 0: [{ desde: '10:15', hasta: '12:00' }] }), /media/)
  assert.throws(malo({ 0: [{ desde: '10:00', hasta: '13:00' }, { desde: '12:00', hasta: '15:00' }] }), /cruzan/)
  assert.throws(malo({ 0: [{ desde: '25:00', hasta: '26:00' }] }), /HH:MM/)
  assert.throws(() => config({ semanas: 0 }), /semanas/)
  assert.throws(() => config({ fechas: { '2026-02-30': [] } }), /Fecha inválida/)
  // Las fechas especiales que ya pasaron se descartan solas.
  assert.deepEqual(config({ fechas: { '2026-10-01': [], '2026-10-20': [] } }).fechas, { '2026-10-20': [] })
})

test('la planilla ida y vuelta, y tolera ediciones a mano', () => {
  const c = config({
    semanal: { 0: [{ desde: '10:00', hasta: '14:00' }], 6: [{ desde: '09:00', hasta: '12:00' }] },
    fechas: { '2026-10-25': [], '2026-10-31': [{ desde: '11:00', hasta: '13:00' }] },
    semanas: 6,
  })
  const filas = horarioAFilas(c)
  assert.deepEqual(filas[0], ['semanas', '6', '', ''])
  assert.ok(filas.some(f => f[0] === 'cerrado' && f[1] === '2026-10-25'))
  assert.deepEqual(validarHorario(filasAHorario(filas), HOY), c)
  // "Sabado" sin tilde y con mayuscula, fila vacia en medio.
  const aMano = filasAHorario([['Semanal', 'Sabado', '10:00', '12:00'], [], ['semanas', 3]])
  assert.deepEqual(aMano.semanal[6], [{ desde: '10:00', hasta: '12:00' }])
  assert.equal(aMano.semanas, 3)
  assert.deepEqual(filasAHorario(null), structuredClone(HORARIO_POR_DEFECTO))
})

test('guardar valida antes de escribir y una planilla rota no deja sin agenda', async () => {
  let escritas = null
  const almacen = { async leerFilas() { return escritas }, async guardarFilas(f) { escritas = f } }
  await assert.rejects(guardarHorario(almacen, { semanal: { 0: [{ desde: '12:00', hasta: '10:00' }] } }), { estado: 400 })
  assert.equal(escritas, null)
  await guardarHorario(almacen, { semanal: { 6: [{ desde: '10:00', hasta: '12:00' }] }, fechas: {}, semanas: 2 })
  assert.deepEqual((await leerHorario(almacen)).semanal, { 6: [{ desde: '10:00', hasta: '12:00' }] })
  escritas = [['semanal', 'domingo', '18:00', '09:00']]
  assert.deepEqual(await leerHorario(almacen), validarHorario(HORARIO_POR_DEFECTO))
})

test('convierte la hora de Chile a UTC con y sin horario de verano', () => {
  assert.equal(horaLocalAUTC('2026-10-18', '10:00').toISOString(), '2026-10-18T13:00:00.000Z')
  assert.equal(horaLocalAUTC('2026-07-12', '10:00').toISOString(), '2026-07-12T14:00:00.000Z')
})
