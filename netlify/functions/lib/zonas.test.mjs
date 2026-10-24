import test from 'node:test'
import assert from 'node:assert/strict'
import { COMUNAS, comunaDe, diaRecomendado, diasParaComuna, horasPorZona, zonaDe, zonasCerca } from './zonas.mjs'

test('la zona sale de la comuna o de la direccion escrita a mano', () => {
  assert.equal(zonaDe('Ñuñoa'), 'oriente')
  assert.equal(zonaDe('Av. Grecia 1500, depto 302, nunoa'), 'oriente')
  assert.equal(zonaDe('Pasaje Los Aromos 355, Puente Alto'), 'suroriente')
  assert.equal(zonaDe('Camino El Alba 9021, Las Condes, Santiago'), 'oriente') // "Las Condes" gana
  assert.equal(zonaDe('Calle Falsa 123, San José de Maipo'), 'suroriente')
  assert.equal(zonaDe('Valparaíso'), null)
  assert.equal(comunaDe('los militares 5400, las condes'), 'Las Condes')
  assert.ok(COMUNAS.includes('Lo Barnechea') && COMUNAS.length > 50)
})

test('zonas cercanas: misma, vecinas; Las Condes y Puente Alto no', () => {
  assert.equal(zonasCerca('oriente', 'oriente'), true)
  assert.equal(zonasCerca('oriente', 'centro'), true)
  assert.equal(zonasCerca('oriente', 'suroriente'), false)
  assert.equal(zonasCerca('poniente', 'oriente'), false)
  assert.equal(zonasCerca(null, 'oriente'), true)
})

test('horas: no se ofrecen a menos de 2 h de una visita lejana; se recomiendan pegadas a una cercana', () => {
  const horas = ['10:00', '10:30', '11:00', '11:30', '12:00', '13:00', '14:00', '15:00', '16:00']
  // Ya hay una visita en Puente Alto a las 11:00 y otra en Las Condes a las 15:00.
  const visitas = [{ hora: '11:00', zona: 'suroriente' }, { hora: '15:00', zona: 'oriente' }]
  const lasCondes = horasPorZona(horas, visitas, 'oriente')
  assert.deepEqual(Object.entries(lasCondes).filter(([, e]) => e === 'lejos').map(([h]) => h), ['10:00', '10:30', '11:00', '11:30', '12:00'])
  assert.deepEqual(Object.entries(lasCondes).filter(([, e]) => e === 'recomendada').map(([h]) => h), ['14:00', '15:00', '16:00'])
  assert.equal(lasCondes['13:00'], 'libre')
  const puenteAlto = horasPorZona(horas, visitas, 'suroriente')
  assert.equal(puenteAlto['10:30'], 'recomendada')
  assert.equal(puenteAlto['15:00'], 'lejos')
  // Sin comuna (o fuera de Santiago): todo libre.
  assert.ok(Object.values(horasPorZona(horas, visitas, null)).every(e => e === 'libre'))
  assert.equal(diaRecomendado(visitas, 'centro'), true)
  assert.equal(diaRecomendado([{ hora: '10:00', zona: 'poniente' }], 'oriente'), false)
})

test('dias para una comuna: sin horas tomadas ni lejanas, con los dias cercanos destacados', () => {
  const dias = [{ fecha: '2026-10-31', horas: ['10:00', '10:30', '11:00', '15:00'] }, { fecha: '2026-11-01', horas: ['10:00', '11:00'] }]
  const visitas = [{ fecha: '2026-10-31', hora: '10:30', ubicacion: 'Concha y Toro 100, Puente Alto' }, { fecha: '2026-11-01', hora: '10:00', ubicacion: 'Los Militares 5400, Las Condes' }]
  assert.deepEqual(diasParaComuna(dias, visitas, 'Vitacura'), [
    { fecha: '2026-10-31', recomendado: false, horas: [{ hora: '15:00', recomendada: false }] },
    { fecha: '2026-11-01', recomendado: true, horas: [{ hora: '11:00', recomendada: true }] },
  ])
  assert.deepEqual(diasParaComuna(dias, visitas, '').map(d => d.horas.length), [3, 1])
})
