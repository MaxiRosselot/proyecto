import test from 'node:test'
import assert from 'node:assert/strict'
import { disponibilidadAgenda, duracionInstalacionMin, horasDelDia, ocupadosAgenda, puedeReagendar } from './agenda-horas.mjs'

const repisas = neto => [{ unidades: 1, valor: neto }]

test('duracion segun el trabajo, redondeada hacia arriba a la media hora', () => {
  assert.equal(duracionInstalacionMin(repisas(100000)), 120)       // 1,4 + 0,4 = 1,8 h → 2 h
  assert.equal(duracionInstalacionMin(repisas(200000)), 150)       // 2,2 h → 2 h 30
  assert.equal(duracionInstalacionMin(repisas(200000), { qty_retiro_orden: 1 }), 180) // 2,7 h → 3 h
  assert.equal(duracionInstalacionMin(repisas(40000)), 120)        // 1,56 h → 2 h
  assert.equal(duracionInstalacionMin([]), 90)                     // solo servicios: 1,4 h → 1 h 30
  assert.equal(duracionInstalacionMin(repisas(2000000)), 360)      // tope: la jornada completa
})

test('solo horas pegadas a las 10, a las 16 o a otra instalacion', () => {
  assert.deepEqual(horasDelDia([], 120).map(h => h.inicio), ['10:00', '14:00'])
  // Ocupado 10:00-12:30: el hueco 12:30-16:00 permite empezar pegado (12:30) o terminar a las 16 (14:00).
  assert.deepEqual(horasDelDia([{ desde: 600, hasta: 750 }], 120).map(h => `${h.inicio}-${h.fin}`), ['12:30-14:30', '14:00-16:00'])
  // Hueco justo: una sola hora.
  assert.deepEqual(horasDelDia([{ desde: 600, hasta: 720 }, { desde: 840, hasta: 960 }], 120).map(h => h.inicio), ['12:00'])
  // No cabe.
  assert.deepEqual(horasDelDia([{ desde: 600, hasta: 780 }, { desde: 840, hasta: 960 }], 120), [])
  // Jornada completa: solo 10:00.
  assert.deepEqual(horasDelDia([], 360).map(h => h.inicio), ['10:00'])
})

test('lunes a viernes por defecto, el mismo dia solo hasta las 8:00, y con el horario editable', () => {
  // Martes 20 de octubre de 2026.
  const temprano = disponibilidadAgenda({}, 120, new Date('2026-10-20T07:30:00-03:00'))
  assert.equal(temprano[0].fecha, '2026-10-20')
  const tarde = disponibilidadAgenda({}, 120, new Date('2026-10-20T09:00:00-03:00'))
  assert.equal(tarde[0].fecha, '2026-10-21')
  assert.ok(tarde.every(d => ![0, 6].includes(new Date(d.fecha + 'T12:00:00Z').getUTCDay())))
  const lleno = disponibilidadAgenda({ '2026-10-21': [{ desde: 600, hasta: 960 }] }, 120, new Date('2026-10-20T09:00:00-03:00'))
  assert.equal(lleno[0].fecha, '2026-10-22')
  // Horario editado: el miercoles 21 cerrado y el jueves 22 solo en la tarde.
  const rango = [{ desde: '10:00', hasta: '16:00' }]
  const horario = { semanal: { 1: rango, 2: rango, 3: rango, 4: rango, 5: rango },
    fechas: { '2026-10-21': [], '2026-10-22': [{ desde: '13:00', hasta: '16:00' }] }, semanas: 1 }
  const editado = disponibilidadAgenda({}, 120, new Date('2026-10-20T09:00:00-03:00'), horario)
  assert.deepEqual(editado.slice(0, 2).map(d => [d.fecha, d.horas.map(h => h.inicio)]), [['2026-10-22', ['13:00', '14:00']], ['2026-10-23', ['10:00', '14:00']]])
  assert.equal(editado.at(-1).fecha, '2026-10-27') // 1 semana
})

test('lo ocupado: instalaciones del calendario y ventas con fecha sin evento, menos la propia', () => {
  const eventos = [
    { tipo: 'instalacion', id: 'e1', cotNum: '10', fecha: '2026-10-21', minutoInicio: 600, minutoFin: 720 },
    { tipo: 'instalacion', id: 'e2', cotNum: '11', fecha: '2026-10-21', minutoInicio: 780, minutoFin: 900 },
    { tipo: 'visita', id: 'v', fecha: '2026-10-21', minutoInicio: 600, minutoFin: 615 },
  ]
  const cotizaciones = [{ cotNum: 12, instalacion: { fecha: '2026-10-22', inicio: '13:00', fin: '16:00' } }, { cotNum: 11, instalacion: { fecha: '2026-10-21', inicio: '13:00', fin: '15:00', eventId: 'e2' } }]
  assert.deepEqual(ocupadosAgenda({ eventos, cotizaciones, excepto: { cotNum: '11', eventId: 'e2' } }), {
    '2026-10-21': [{ desde: 600, hasta: 720 }],
    '2026-10-22': [{ desde: 780, hasta: 960 }],
  })
})

test('reagendar hasta 48 h antes', () => {
  const inst = { fecha: '2026-10-23', inicio: '10:00' }
  assert.equal(puedeReagendar(inst, new Date('2026-10-21T09:59:00-03:00')), true)
  assert.equal(puedeReagendar(inst, new Date('2026-10-21T10:01:00-03:00')), false)
})
