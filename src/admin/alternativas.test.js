import test from 'node:test'
import assert from 'node:assert/strict'
import { alternativasDe, comparacion, fondoMenor, superficieRepisas } from './alternativas.js'

const sala = (runs, extra = {}) => ({
  units: 'cm',
  room: { backWallCm: 225, leftWallCm: 200, rightWallCm: 200, heightCm: 240, door: { wall: 'front', fromLeftCornerCm: 120, toRightCornerCm: 25 }, ...extra },
  shelving: { layout: 'manual', heightCm: 200, depthCm: 48, runs },
})
// L: fondo de 225 (pasa por la esquina) y lateral izquierdo de 146 que parte en 48.
const enL = sala([{ id: 'fondo', wall: 'back', startCm: 0, lengthCm: 225, depthCm: 48 }, { id: 'izq', wall: 'left', startCm: 48, lengthCm: 146, depthCm: 48 }])

test('fondos: un paso menos; 28 solo desde 38', () => {
  assert.deepEqual([68, 48, 38, 28].map(fondoMenor), [48, 38, 28, null])
})

test('una L da: en U, mas angosta, laterales angostos y un solo muro', () => {
  const alt = alternativasDe(enL)
  assert.deepEqual(alt.map(a => a.tipo), ['mas-completa', 'mas-angosta', 'lateral-angosto', 'un-muro'])
  const [u, angosta, lateral, unMuro] = alt
  // U: el lateral derecho, del mismo fondo; la puerta (120 a 200 cm) cruza la zona del lateral derecho, se acorta.
  const der = u.proyecto.shelving.runs.find(r => r.wall === 'right')
  assert.deepEqual([der.startCm, der.depthCm, der.lengthCm], [48, 48, 67])
  // Mas angosta: todo en 38 y el lateral se corre a la nueva esquina.
  const [f, i] = angosta.proyecto.shelving.runs
  assert.deepEqual([f.depthCm, i.depthCm, i.startCm, i.lengthCm], [38, 38, 38, 156])
  // Laterales angostos: el fondo sigue en 48.
  assert.deepEqual(lateral.proyecto.shelving.runs.map(r => r.depthCm), [48, 38])
  // Un muro: solo el fondo, con recargo.
  assert.equal(unMuro.proyecto.shelving.runs.length, 1)
  assert.equal(unMuro.recargo, 1.2)
})

test('el lateral que se suma en U respeta la puerta', () => {
  const lejos = sala(enL.shelving.runs, { door: { wall: 'front', fromLeftCornerCm: 60, toRightCornerCm: 85 } })
  const der = alternativasDe(lejos)[0].proyecto.shelving.runs.find(r => r.wall === 'right')
  assert.equal(der.lengthCm, 146)
})

test('una sola repisa: la mas completa es mas profunda y no hay "un muro"', () => {
  const sola = sala([{ id: 'fondo', wall: 'back', startCm: 0, lengthCm: 225, depthCm: 48 }])
  assert.deepEqual(alternativasDe(sola).map(a => [a.tipo, a.titulo]), [['mas-completa', 'Más profunda'], ['mas-angosta', 'Más angosta']])
})

test('sin alternativas en bodega irregular o con repisas sueltas', () => {
  assert.deepEqual(alternativasDe(sala(enL.shelving.runs, { planta: [{ direccion: 'derecha', largoCm: 100 }] })), [])
  assert.deepEqual(alternativasDe(sala([{ id: 'x', wall: 'back', startCm: 0, lengthCm: 100, floorPlacement: { centerXCm: 50, centerZCm: 30, rotationQuarterTurns: 0 } }])), [])
})

test('la comparacion dice cuanto se ahorra y cuanto espacio se pierde', () => {
  const principal = { total: 300000, repisas: [{ largo: 2, prof: .48, niveles: 4, unidades: 2 }] }
  assert.equal(comparacion({ total: 250000, repisas: [{ largo: 2, prof: .48, niveles: 4, unidades: 1 }] }, principal), 'Ahorras $50.000, con 50% menos espacio para guardar.')
  assert.equal(comparacion({ total: 360000, repisas: [{ largo: 2, prof: .68, niveles: 4, unidades: 2 }] }, principal), '$60.000 más, con 42% más espacio para guardar.')
  assert.ok(Math.abs(superficieRepisas(principal.repisas) - 7.68) < 1e-9)
})

test('repisas altas: la mas baja pasa de 2,5 m a 2 m (y de 3 a 2,5)', () => {
  const alta = sala([{ id: 'fondo', wall: 'back', startCm: 0, lengthCm: 225, depthCm: 48, heightCm: 250, levels: [{ heightCm: 50, enabled: true }] }])
  alta.shelving.heightCm = 250
  const baja = alternativasDe(alta).find(a => a.tipo === 'mas-baja')
  assert.equal(baja.proyecto.shelving.heightCm, 200)
  assert.equal(baja.proyecto.shelving.runs[0].heightCm, 200)
  assert.equal(baja.proyecto.shelving.runs[0].levels, undefined)
  assert.match(baja.descripcion, /2 m de alto en vez de 2,5 m/)
  alta.shelving.heightCm = 300; alta.shelving.runs[0].heightCm = 300
  assert.equal(alternativasDe(alta).find(a => a.tipo === 'mas-baja').proyecto.shelving.heightCm, 250)
  // De 2 m no hay mas baja.
  assert.equal(alternativasDe(enL).find(a => a.tipo === 'mas-baja'), undefined)
})
