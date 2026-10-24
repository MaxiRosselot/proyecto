import test from 'node:test'
import assert from 'node:assert/strict'
import { disponibilidadAgenda, duracionInstalacionMin, horasDelDia, ocupadosAgenda, perfilBodega, puedeReagendar } from './agenda-horas.mjs'

// Bodega de ancho × fondo (cm) con repisas de 200 cm en los muros dados.
const bodega = (ancho, fondo, muros, { alto = 200, largo = 200 } = {}) => ({
  proyecto3d: { room: { backWallCm: ancho, leftWallCm: fondo, rightWallCm: fondo }, shelving: { heightCm: alto, runs: muros.map((wall, i) => ({ id: `r${i}`, wall, lengthCm: largo, heightCm: alto })) } },
})

test('duracion en L segun los m² de la bodega', () => {
  assert.equal(duracionInstalacionMin(bodega(150, 120, ['back', 'right'])), 60)   // 1,8 m²
  assert.equal(duracionInstalacionMin(bodega(200, 250, ['back', 'right'])), 120)  // 5 m²
  assert.equal(duracionInstalacionMin(bodega(300, 300, ['back', 'left'])), 150)   // 9 m²
  assert.equal(duracionInstalacionMin(bodega(300, 400, ['back', 'left'])), 180)   // 12 m²
  assert.equal(duracionInstalacionMin(bodega(400, 400, ['back', 'left'])), 240)   // 16 m²
})

test('en U suma lo que corresponde; la altura y los servicios suman; minimo 1 h', () => {
  const U = ['back', 'left', 'right']
  assert.equal(duracionInstalacionMin(bodega(150, 120, U)), 120)  // 1 h → 2 h
  assert.equal(duracionInstalacionMin(bodega(200, 250, U)), 120)  // 2 h se queda
  assert.equal(duracionInstalacionMin(bodega(300, 300, U)), 180)  // 2 h 30 → 3 h
  assert.equal(duracionInstalacionMin(bodega(300, 400, U)), 240)  // 3 h → 4 h
  assert.equal(duracionInstalacionMin(bodega(300, 400, ['back', 'left'], { alto: 250 })), 210)
  assert.equal(duracionInstalacionMin(bodega(300, 400, ['back', 'left'], { alto: 300 })), 240)
  // Retiro y orden segun el tamaño de la bodega; basura 30 min; bicicleta 15 min c/u; cajas nada.
  assert.equal(duracionInstalacionMin(bodega(150, 120, ['back', 'right']), { qty_retiro_orden: 1 }), 90)
  assert.equal(duracionInstalacionMin(bodega(200, 250, ['back', 'right']), { qty_retiro_orden: 1 }), 180)
  assert.equal(duracionInstalacionMin(bodega(300, 300, ['back', 'left']), { qty_retiro_orden: 1 }), 240)
  assert.equal(duracionInstalacionMin(bodega(200, 250, ['back', 'right']), { qty_retiro_basura: 1, qty_bici: 2, qty_cajas: 5 }), 180)
})

test('una sola muralla: 30 min por modulo de hasta 243 cm; sin modelo, los modulos de la cotizacion', () => {
  assert.equal(duracionInstalacionMin(bodega(300, 200, ['back'], { largo: 243 })), 60)   // 1 modulo → minimo 1 h
  assert.equal(duracionInstalacionMin(bodega(500, 200, ['back'], { largo: 486 })), 60)   // 2 modulos
  assert.equal(duracionInstalacionMin(bodega(700, 200, ['back'], { largo: 600 })), 90)   // 3 modulos
  assert.deepEqual(perfilBodega(null, [{ unidades: 4, alto: 2.5 }]), { m2: null, muros: 1, modulos: 4, altoCm: 250 })
  assert.equal(duracionInstalacionMin({ repisas: [{ unidades: 4, alto: 2.5 }] }), 150)   // 4 × 30 + 30 por el alto
  assert.equal(duracionInstalacionMin({ repisas: [{ unidades: 1 }] }, { qty_retiro_orden: 1 }), 90)
  assert.equal(duracionInstalacionMin({ repisas: Array(20).fill({ unidades: 1 }) }), 360) // tope: la jornada
})

test('solo horas que dejan libre 0 o al menos 2 h: no se corta el dia', () => {
  const inicios = (d, ocupados = []) => horasDelDia(ocupados, d).map(h => h.inicio)
  assert.deepEqual(inicios(180), ['10:00', '13:00'])
  assert.deepEqual(inicios(120), ['10:00', '12:00', '14:00'])
  assert.deepEqual(inicios(150), ['10:00', '13:30'])
  assert.deepEqual(inicios(240), ['10:00', '12:00'])
  assert.deepEqual(inicios(360), ['10:00'])
  assert.deepEqual(inicios(60), ['10:00', '12:00', '12:30', '13:00', '15:00'])
  // Con 10-12 ocupado, una de 3 h dejaria 1 h suelta: no se ofrece; una de 2 h si.
  assert.deepEqual(inicios(180, [{ desde: 600, hasta: 720 }]), [])
  assert.deepEqual(horasDelDia([{ desde: 600, hasta: 720 }], 120).map(h => `${h.inicio}-${h.fin}`), ['12:00-14:00', '14:00-16:00'])
  // Hueco justo.
  assert.deepEqual(inicios(120, [{ desde: 600, hasta: 720 }, { desde: 840, hasta: 960 }]), ['12:00'])
  // No cabe.
  assert.deepEqual(inicios(120, [{ desde: 600, hasta: 780 }, { desde: 840, hasta: 960 }]), [])
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
  assert.deepEqual(editado.slice(0, 2).map(d => [d.fecha, d.horas.map(h => h.inicio)]), [['2026-10-23', ['10:00', '12:00', '14:00']], ['2026-10-26', ['10:00', '12:00', '14:00']]])
  // El jueves 22 solo en la tarde (13 a 16): una de 2 h dejaria 1 h suelta; una de 3 h calza justo.
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

test('reagendar hasta 48 h antes', () => {
  const inst = { fecha: '2026-10-23', inicio: '10:00' }
  assert.equal(puedeReagendar(inst, new Date('2026-10-21T09:59:00-03:00')), true)
  assert.equal(puedeReagendar(inst, new Date('2026-10-21T10:01:00-03:00')), false)
})
