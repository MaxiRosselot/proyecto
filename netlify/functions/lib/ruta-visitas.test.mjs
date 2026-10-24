import test from 'node:test'
import assert from 'node:assert/strict'
import { linksRuta, minutosEntre, planificarRuta } from './ruta-visitas.mjs'

const R1 = { desde: '08:00', hasta: '11:00' }, R2 = { desde: '11:00', hasta: '14:00' }
// Puntos aproximados: Ñuñoa, Providencia, Las Condes, Puente Alto, La Florida.
const NUNOA = { lat: -33.4569, lng: -70.5976 }, PROVIDENCIA = { lat: -33.4314, lng: -70.6093 }
const LAS_CONDES = { lat: -33.4089, lng: -70.5675 }, PUENTE_ALTO = { lat: -33.6117, lng: -70.5758 }, LA_FLORIDA = { lat: -33.5227, lng: -70.5986 }

test('traslados: con coordenadas por distancia; sin coordenadas por comuna', () => {
  assert.ok(minutosEntre(NUNOA, PROVIDENCIA) >= 5 && minutosEntre(NUNOA, PROVIDENCIA) <= 12)
  assert.ok(minutosEntre(LAS_CONDES, PUENTE_ALTO) > 35)
  assert.equal(minutosEntre({ ubicacion: 'Grecia 1500, Ñuñoa' }, { ubicacion: 'Irarrázaval 3000, Ñuñoa' }), 10)
  assert.equal(minutosEntre({ ubicacion: 'Grecia 1500, Ñuñoa' }, { ubicacion: 'Pajaritos 2000, Maipú' }), 25)
})

test('la ruta respeta los rangos y dentro de cada uno elige el orden mas corto', () => {
  const visitas = [
    { id: 'pa', cliente: 'Puente Alto', rango: R1, ...PUENTE_ALTO },
    { id: 'lc', cliente: 'Las Condes', rango: R1, ...LAS_CONDES },
    { id: 'lf', cliente: 'La Florida', rango: R1, ...LA_FLORIDA },
    { id: 'pr', cliente: 'Providencia', rango: R2, ...PROVIDENCIA },
    { id: 'nu', cliente: 'Ñuñoa', rango: R2, ...NUNOA },
  ]
  const { paradas, sinCoordenadas } = planificarRuta(visitas)
  // 8–11: de un extremo al otro pasando por La Florida (no Las Condes → Puente Alto → La Florida).
  const r1 = paradas.slice(0, 3).map(p => p.id)
  assert.equal(r1[1], 'lf')
  // 11–14 despues; desde Las Condes conviene Providencia y despues Ñuñoa, desde Puente Alto al reves.
  assert.deepEqual(paradas.slice(3).map(p => p.id), r1[2] === 'lc' ? ['pr', 'nu'] : ['nu', 'pr'])
  assert.equal(paradas[0].llegada, '08:00')
  assert.ok(paradas.every((p, i) => i === 0 || p.llegada > paradas[i - 1].llegada))
  assert.equal(paradas[3].llegada, '11:00') // el segundo rango no parte antes de las 11
  assert.ok(paradas.every(p => !p.fueraDeRango))
  assert.equal(sinCoordenadas, 0)
})

test('si no alcanzan a caber en el rango, se marca', () => {
  const visitas = Array.from({ length: 6 }, (_, i) => ({ id: String(i), rango: { desde: '08:00', hasta: '09:00' }, ubicacion: `Calle ${i}, ${['Maipú', 'Las Condes'][i % 2]}` }))
  const { paradas, sinCoordenadas } = planificarRuta(visitas)
  assert.equal(sinCoordenadas, 6)
  assert.ok(paradas.at(-1).fueraDeRango)
  // Sin coordenadas, junta las de la misma comuna.
  const comunas = paradas.map(p => p.ubicacion.split(', ')[1])
  assert.equal(comunas.filter((c, i) => i > 0 && c !== comunas[i - 1]).length, 1)
})

test('links de Google Maps en orden, de a 10 paradas', () => {
  const paradas = Array.from({ length: 12 }, (_, i) => ({ lat: -33.4 - i / 100, lng: -70.6, ubicacion: `x${i}` }))
  const links = linksRuta(paradas)
  assert.equal(links.length, 2)
  assert.deepEqual([links[0].desde, links[0].hasta, links[1].desde, links[1].hasta], [1, 10, 10, 12])
  const u = new URL(links[0].url)
  assert.equal(u.searchParams.get('origin'), '-33.4,-70.6')
  assert.equal(u.searchParams.get('waypoints').split('|').length, 8)
  assert.equal(new URL(linksRuta([{ ubicacion: 'Grecia 1500, Ñuñoa' }])[0].url).searchParams.get('destination'), 'Grecia 1500, Ñuñoa')
})
