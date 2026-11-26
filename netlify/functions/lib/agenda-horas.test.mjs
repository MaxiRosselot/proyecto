import test from 'node:test'
import assert from 'node:assert/strict'
import { disponibilidadAgenda, duracionInstalacionMin, horasDelDia, ocupadosAgenda, perfilBodega, puedeReagendar } from './agenda-horas.mjs'

const fila = (valor, unidades = 1, extra = {}) => ({ valor, unidades, ...extra })
const cot = (...repisas) => ({ repisas })

test('duracion segun el monto de las repisas (ajustada con las instalaciones del panel)', () => {
  // Casos reales ya instalados (cotizacion: horas que tomo).
  assert.equal(duracionInstalacionMin(cot(fila(80000), fila(60000))), 120)          // 1557: 2 h
  assert.equal(duracionInstalacionMin(cot(fila(150000))), 120)                      // 1 repisa de 2,43
  assert.equal(duracionInstalacionMin(cot(fila(160000), fila(110000), fila(110000), fila(250000))), 240) // 1629-like: 630k → 4 h
  assert.equal(duracionInstalacionMin(cot(fila(110000), fila(60000)), { qty_retiro_orden: 1 }), 150)    // 170k + retiro
  assert.equal(duracionInstalacionMin(cot(fila(110000, 2))), 150)                   // unidades cuentan: 220k
  // Racks como las repisas; basura y bicicletas suman poco; cajas nada.
  assert.equal(duracionInstalacionMin(cot(fila(700000, 1, { kind: 'rack' }))), 270)
  assert.equal(duracionInstalacionMin(cot(fila(200000)), { qty_retiro_basura: 1, qty_bici: 2, qty_cajas: 5 }), 150)
  // Limites: minimo 1 h, maximo la jornada.
  assert.equal(duracionInstalacionMin(cot(fila(0))), 90)
  assert.equal(duracionInstalacionMin({}), 90)
  assert.equal(duracionInstalacionMin(cot(...Array(20).fill(fila(100000)))), 360)
  // Acepta las filas abreviadas (u, v).
  assert.equal(duracionInstalacionMin(cot({ u: 1, v: 150000 })), 120)
  assert.deepEqual(perfilBodega(null, [{ unidades: 4, alto: 2.5 }]), { m2: null, muros: 1, modulos: 4, altoCm: 250 })
})

test('tres bloques de 2 h, y el inicio de cada espacio que libero Maxi en el calendario', () => {
  const inicios = (ocupados = []) => horasDelDia(ocupados).map(h => h.inicio)
  assert.deepEqual(horasDelDia([]).map(h => `${h.inicio}-${h.fin}`), ['10:00-12:00', '12:00-14:00', '14:00-16:00'])
  // Uno a las 10: quedan 12 y 14 (sin tope por dia).
  assert.deepEqual(inicios([{ desde: 600, hasta: 720 }]), ['12:00', '14:00'])
  assert.deepEqual(inicios([{ desde: 600, hasta: 720 }, { desde: 720, hasta: 840 }]), ['14:00'])
  // El de las 10 se alargo a 13:00: se libera de 13 a 16 (13:00 y el bloque de 14).
  assert.deepEqual(inicios([{ desde: 600, hasta: 780 }]), ['13:00', '14:00'])
  // El de las 12 se alargo hasta las 15: queda solo 10-12.
  assert.deepEqual(inicios([{ desde: 720, hasta: 900 }]), ['10:00'])
  // Espacio de menos de 2 h: no se ofrece.
  assert.deepEqual(inicios([{ desde: 600, hasta: 780 }, { desde: 840, hasta: 960 }]), [])
  // Un trabajo puesto a mano a las 11: 10-11 no alcanza; de 13 a 16 si.
  assert.deepEqual(inicios([{ desde: 660, hasta: 780 }]), ['13:00', '14:00'])
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
  // El jueves 22 solo en la tarde (13 a 16): una de 2 h, al inicio o al final; una de 3 h calza justo.
  assert.deepEqual(editado.slice(0, 2).map(d => [d.fecha, d.horas.map(h => h.inicio)]), [['2026-10-22', ['13:00', '14:00']], ['2026-10-23', ['10:00', '12:00', '14:00']]])
  assert.deepEqual(disponibilidadAgenda({}, 180, new Date('2026-10-20T09:00:00-03:00'), horario)[0], { fecha: '2026-10-22', horas: [{ inicio: '13:00', fin: '16:00' }] })
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

test('reagendar cuando quiera, incluso con la hora ya pasada', () => {
  const inst = { fecha: '2026-10-23', inicio: '10:00' }
  assert.equal(puedeReagendar(inst, new Date('2026-10-23T09:59:00-03:00')), true)
  assert.equal(puedeReagendar(inst, new Date('2026-10-23T12:00:00-03:00')), true)
  assert.equal(puedeReagendar({ fecha: '2026-10-23' }), false)
})
